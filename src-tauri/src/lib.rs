use serde::Serialize;
use std::{path::Path, collections::HashMap, sync::Mutex, time::{Duration, Instant}};
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config};
use tauri::{ Emitter};


struct WatcherState{
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
pub struct FileNode {
    name: String,
    #[serde(rename = "type")]
    node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
    #[serde(rename = "iconType", skip_serializing_if = "Option::is_none")]
    icon_type: Option<String>,
    #[serde(rename = "compactPath", skip_serializing_if = "Option::is_none")]
    compact_path: Option<String>,
    /// Folder whose contents haven't been scanned yet (beyond the scan depth,
    /// or a skipped directory). The frontend loads it on expand.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    unloaded: bool,
}

/// Options for scanning a directory, coming from the user's settings.
pub struct ScanOptions {
    pub max_depth: usize,
    pub show_hidden: bool,
    pub skip_dirs: Vec<String>,
}

impl ScanOptions {
    fn skips(&self, name: &str) -> bool {
        self.skip_dirs.iter().any(|d| d == name)
    }
}

#[derive(Serialize, Clone)]
pub struct GitFileInfo {
    pub path: String,
    pub status: String, // "modified", "untracked", "staged", "conflict", "deleted"
}

#[derive(Serialize, Clone)]
pub struct GitStatus {
    pub branch: String,
    pub is_dirty: bool,
    pub files: Vec<GitFileInfo>, // Adăugăm lista de fișiere
}

/// Levels loaded per request when the frontend doesn't say otherwise
const DEFAULT_SCAN_DEPTH: usize = 3;
/// Hard cap on levels per request, to keep a single scan bounded
const MAX_SCAN_DEPTH: usize = 12;

/// Minimum time between `file_changed` events for one panel
const EMIT_THROTTLE: Duration = Duration::from_millis(200);

/// Default directories that are listed but not scanned (expandable on demand)
const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", ".git", "__pycache__", ".venv", "venv",
    ".idea", ".vscode", "dist", "build", ".next", ".cache",
    "vendor", "packages", ".svn", "obj", "bin",
];

fn get_icon_type(filename: &str) -> Option<String> {
    let ext = Path::new(filename).extension()?.to_str()?;
    match ext.to_lowercase().as_str() {
        "py" => Some("py".into()),
        "c" | "cpp" | "cc" | "cxx" | "h" | "hpp" => Some("cpp".into()),
        "js" | "jsx" | "mjs" => Some("js".into()),
        "ts" | "tsx" => Some("ts".into()),
        "rs" => Some("rs".into()),
        "json" => Some("json".into()),
        "toml" | "yaml" | "yml" | "ini" | "cfg" => Some("config".into()),
        "md" | "txt" | "rst" => Some("doc".into()),
        "html" | "css" | "scss" | "sass" => Some("web".into()),
        _ => None,
    }
}

fn folder(name: String, children: Option<Vec<FileNode>>, unloaded: bool) -> FileNode {
    FileNode { name, node_type: "folder".into(), children, icon_type: None, compact_path: None, unloaded }
}

/// Scan `path` up to `opts.max_depth` levels. Folders at the depth limit and
/// skipped folders are returned with `unloaded: true` and no children.
fn build_tree(path: &Path, current_depth: usize, opts: &ScanOptions) -> Result<Vec<FileNode>, String> {
    let read_dir = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

    let mut dirs: Vec<FileNode> = Vec::new();
    let mut files: Vec<FileNode> = Vec::new();

    for entry in read_dir {
        // Skip entries we can't read instead of failing the whole tree
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();

        if !opts.show_hidden && name.starts_with('.') {
            continue;
        }

        let Ok(metadata) = entry.metadata() else { continue };

        if metadata.is_dir() {
            if opts.skips(&name) || current_depth + 1 >= opts.max_depth {
                dirs.push(folder(name, None, true));
                continue;
            }
            // An unreadable subfolder (e.g. permission denied) shows up empty
            // instead of failing the whole tree
            let children = build_tree(&entry.path(), current_depth + 1, opts).unwrap_or_default();
            dirs.push(folder(name, Some(children), false));
        } else {
            files.push(FileNode {
                icon_type: get_icon_type(&name),
                name,
                node_type: "file".into(),
                children: None,
                compact_path: None,
                unloaded: false,
            });
        }
    }

    // Sort alphabetically: folders first, then files
    dirs.sort_by_key(|n| n.name.to_lowercase());
    files.sort_by_key(|n| n.name.to_lowercase());

    let mut result = dirs;
    result.extend(files);
    Ok(result)
}

/// Collapse chains of folders that contain exactly one (loaded) folder and
/// nothing else, VS Code style: `a/b/c` becomes one node named `c` with
/// `compact_path = "a / b / "`. `compact_path` is always relative to the
/// node's displayed parent, so the frontend can rebuild real paths from it.
fn compact_node(mut node: FileNode) -> FileNode {
    if node.node_type != "folder" {
        return node;
    }
    let mut prefix: Vec<String> = Vec::new();
    loop {
        let single_folder_child = matches!(
            node.children.as_deref(),
            Some([child]) if child.node_type == "folder" && !child.unloaded
        );
        if !single_folder_child {
            break;
        }
        let child = node.children.take().and_then(|c| c.into_iter().next()).unwrap();
        prefix.push(std::mem::take(&mut node.name));
        node = child;
    }
    if !prefix.is_empty() {
        node.compact_path = Some(format!("{} / ", prefix.join(" / ")));
    }
    node.children = node.children.map(compact_tree);
    node
}

fn compact_tree(nodes: Vec<FileNode>) -> Vec<FileNode> {
    nodes.into_iter().map(compact_node).collect()
}

// ─── Tauri Commands ────────────────────────────────────────────────

/// Scan a directory. `depth` = how many levels to load now (deeper folders
/// come back `unloaded` and are fetched on expand). Missing options fall
/// back to the defaults.
#[tauri::command]
fn read_directory(
    path: String,
    depth: Option<usize>,
    show_hidden: Option<bool>,
    skip_dirs: Option<Vec<String>>,
) -> Result<Vec<FileNode>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    let opts = ScanOptions {
        max_depth: depth.unwrap_or(DEFAULT_SCAN_DEPTH).clamp(1, MAX_SCAN_DEPTH),
        show_hidden: show_hidden.unwrap_or(false),
        skip_dirs: skip_dirs.unwrap_or_else(default_skip_dirs),
    };
    Ok(compact_tree(build_tree(p, 0, &opts)?))
}

/// The built-in list of skipped directories (shown in Settings as the default).
#[tauri::command]
fn default_skip_dirs() -> Vec<String> {
    SKIP_DIRS.iter().map(|s| s.to_string()).collect()
}

// ─── Platform integration (VS Code, terminal, file manager) ─────────

use std::process::Command;

/// Try each command in order; succeed on the first one that spawns.
/// `Command::spawn` fails when the program isn't installed, which is what
/// lets us fall through to the next candidate.
fn spawn_first(candidates: Vec<Command>, what: &str) -> Result<(), String> {
    let mut last_err = None;
    for mut cmd in candidates {
        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }
    Err(format!(
        "Failed to open {}: {}",
        what,
        last_err.map(|e| e.to_string()).unwrap_or_else(|| "no candidates".into())
    ))
}

fn cmd(program: &str, args: &[&str]) -> Command {
    let mut c = Command::new(program);
    c.args(args);
    c
}

fn cmd_in(program: &str, args: &[&str], dir: &str) -> Command {
    let mut c = cmd(program, args);
    c.current_dir(dir);
    c
}

#[tauri::command]
fn open_in_vscode(path: String) -> Result<(), String> {
    let candidates = if cfg!(target_os = "windows") {
        // `code` is a .cmd shim on Windows, so it has to go through cmd
        vec![cmd("cmd", &["/C", "code", &path])]
    } else if cfg!(target_os = "macos") {
        // GUI apps on macOS often don't inherit the shell PATH, so fall back to `open -a`
        vec![cmd("code", &[&path]), cmd("open", &["-a", "Visual Studio Code", &path])]
    } else {
        vec![cmd("code", &[&path]), cmd("codium", &[&path])]
    };
    spawn_first(candidates, "VS Code")
}

#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            // Windows Terminal, spawned directly so a missing `wt` actually falls through
            cmd("wt", &["-d", &path]),
            cmd_in("cmd", &["/C", "start", "cmd"], &path),
        ]
    } else if cfg!(target_os = "macos") {
        vec![cmd("open", &["-a", "Terminal", &path])]
    } else {
        // Linux: try the common terminal emulators
        vec![
            cmd_in("x-terminal-emulator", &[], &path),
            cmd("gnome-terminal", &["--working-directory", &path]),
            cmd("konsole", &["--workdir", &path]),
            cmd("xfce4-terminal", &["--working-directory", &path]),
            cmd("kitty", &["--directory", &path]),
            cmd("alacritty", &["--working-directory", &path]),
            cmd("wezterm", &["start", "--cwd", &path]),
            cmd_in("xterm", &[], &path),
        ]
    };
    spawn_first(candidates, "terminal")
}

/// Open a folder in the system file manager (Explorer / Finder / xdg default).
#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let candidates = if cfg!(target_os = "windows") {
        vec![cmd("explorer", &[&path])]
    } else if cfg!(target_os = "macos") {
        vec![cmd("open", &[&path])]
    } else {
        vec![cmd("xdg-open", &[&path]), cmd("gio", &["open", &path])]
    };
    spawn_first(candidates, "file manager")
}

/// Show a file or folder selected inside its parent in the file manager.
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let candidates = if cfg!(target_os = "windows") {
        vec![cmd("explorer", &["/select,", &path])]
    } else if cfg!(target_os = "macos") {
        vec![cmd("open", &["-R", &path])]
    } else {
        // There's no universal "select" on Linux; open the containing folder
        let parent = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        vec![cmd("xdg-open", &[&parent]), cmd("gio", &["open", &parent])]
    };
    spawn_first(candidates, "file manager")
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.set_text(&text)
        .map_err(|e| format!("Failed to copy: {}", e))?;
    Ok(())
}

/// Map a porcelain v1 `XY` status code to a simple status label.
fn classify_git_status(code: &str) -> &'static str {
    let mut chars = code.chars();
    let x = chars.next().unwrap_or(' ');
    let y = chars.next().unwrap_or(' ');
    match (x, y) {
        ('?', '?') => "untracked",
        ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D') => "conflict",
        (_, 'D') | ('D', ' ') => "deleted",
        (_, 'M') | (_, 'T') => "modified", // unstaged changes win over staged ones
        (x, ' ') if x != ' ' => "staged",
        _ => "unknown",
    }
}

/// Parse the branch line of `git status -b`, e.g.
/// `## main...origin/main [ahead 1]`, `## No commits yet on main`, `## HEAD (no branch)`.
fn parse_branch_line(line: &str) -> String {
    let rest = line.trim_start_matches("## ");
    if let Some(b) = rest.strip_prefix("No commits yet on ") {
        return b.trim().to_string();
    }
    if rest.starts_with("HEAD (no branch)") {
        return "detached".to_string();
    }
    let name = rest.split("...").next().unwrap_or(rest);
    name.split(' ').next().unwrap_or(name).to_string()
}

/// Parse `git status --porcelain=v1 -b` output into a GitStatus.
fn parse_git_status(stdout: &str) -> GitStatus {
    let mut branch = "unknown".to_string();
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.starts_with("## ") {
            branch = parse_branch_line(line);
            continue;
        }
        if line.len() < 4 || !line.is_char_boundary(3) {
            continue;
        }
        let status = classify_git_status(&line[0..2]);
        let mut file_path = &line[3..];
        // Renames/copies are reported as "old -> new"; we care about the new path
        if let Some(idx) = file_path.find(" -> ") {
            file_path = &file_path[idx + 4..];
        }
        files.push(GitFileInfo {
            path: file_path.trim().trim_matches('"').to_string(),
            status: status.to_string(),
        });
    }

    GitStatus { branch, is_dirty: !files.is_empty(), files }
}

#[tauri::command]
fn get_git_info(path: String) -> Result<Option<GitStatus>, String> {
    // `.git` may be a directory (normal repo) or a file (worktree / submodule)
    if !Path::new(&path).join(".git").exists() {
        return Ok(None);
    }

    // If git isn't installed or the command fails, show no git info
    // rather than failing to open the panel.
    let output = match std::process::Command::new("git")
        .args(["-C", &path, "-c", "core.quotepath=off",
               "status", "--porcelain=v1", "-b", "--untracked-files=all"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Ok(None),
    };

    Ok(Some(parse_git_status(&String::from_utf8_lossy(&output.stdout))))
}

/// Should a filesystem event at `event_path` trigger a refresh of the panel?
/// Ignores churn inside skipped/hidden directories, except the git metadata
/// that changes git status (index, HEAD).
fn is_relevant_change(root: &Path, event_path: &Path) -> bool {
    let Ok(rel) = event_path.strip_prefix(root) else { return true };
    let parts: Vec<String> = rel.components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();

    if parts.first().map(|p| p == ".git").unwrap_or(false) {
        // Staging, committing, switching branches
        return matches!(parts.get(1).map(|s| s.as_str()), Some("index") | Some("HEAD"));
    }
    // Ignore anything *inside* a skipped or hidden directory
    let dir_parts = &parts[..parts.len().saturating_sub(1)];
    !dir_parts.iter().any(|p| SKIP_DIRS.contains(&p.as_str()) || p.starts_with('.'))
}

#[tauri::command]
fn watch_directory(
    app: tauri::AppHandle,
    state: tauri::State<WatcherState>,
    panel_id: String,
    path: String,
)->Result<(), String>{
    let mut watchers = state.watchers.lock().unwrap();

    watchers.remove(&panel_id);

    let app_handle = app.clone();
    let panel_id_clone = panel_id.clone();
    let root = std::path::PathBuf::from(&path);
    // Throttle: emit at most once per window. Safe because the frontend
    // debounces (500ms > window) and then re-reads the whole tree, so changes
    // dropped here are still picked up by that later read.
    let last_emit = Mutex::new(Instant::now() - EMIT_THROTTLE);

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res { 
                match event.kind{
                    notify::EventKind::Create(_) |
                    notify::EventKind::Remove(_) |
                    notify::EventKind::Modify(_)=>{
                        if !event.paths.iter().any(|p| is_relevant_change(&root, p)) {
                            return;
                        }
                        let mut last = last_emit.lock().unwrap();
                        if last.elapsed() >= EMIT_THROTTLE {
                            *last = Instant::now();
                            let _ = app_handle.emit("file_changed", &panel_id_clone);
                        }
                    }
                    _ => {}
                }
            }
        },
       Config::default()
    
    ).map_err(|e| e.to_string())?;


    watcher.watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    watchers.insert(panel_id, watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_directory(
    state: tauri::State<WatcherState>,
    panel_id: String) -> Result<(), String> {
    let mut watchers = state.watchers.lock().unwrap();
    watchers.remove(&panel_id);
    Ok(())
}

// ─── App Entry ─────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState{
            watchers: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_directory,
            default_skip_dirs,
            open_in_vscode,
            open_terminal,
            open_in_explorer,
            reveal_in_explorer,
            copy_to_clipboard,
            get_git_info,
            watch_directory,
            unwatch_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_porcelain_codes() {
        assert_eq!(classify_git_status("??"), "untracked");
        assert_eq!(classify_git_status("M "), "staged");
        assert_eq!(classify_git_status("A "), "staged");
        assert_eq!(classify_git_status("R "), "staged");
        assert_eq!(classify_git_status(" M"), "modified");
        assert_eq!(classify_git_status("MM"), "modified");
        assert_eq!(classify_git_status("AM"), "modified");
        assert_eq!(classify_git_status(" D"), "deleted");
        assert_eq!(classify_git_status("D "), "deleted");
        assert_eq!(classify_git_status("UU"), "conflict");
        assert_eq!(classify_git_status("AA"), "conflict");
    }

    #[test]
    fn parses_status_output() {
        let out = "## main...origin/main [ahead 1]\n M src/a.rs\nR  old.txt -> new dir/new.txt\n?? notes/todo.md\n";
        let st = parse_git_status(out);
        assert_eq!(st.branch, "main");
        assert!(st.is_dirty);
        assert_eq!(st.files.len(), 3);
        assert_eq!(st.files[1].path, "new dir/new.txt");
        assert_eq!(st.files[1].status, "staged");
        assert_eq!(st.files[2].status, "untracked");
    }

    #[test]
    fn parses_branch_variants() {
        assert_eq!(parse_branch_line("## feature/x"), "feature/x");
        assert_eq!(parse_branch_line("## No commits yet on main"), "main");
        assert_eq!(parse_branch_line("## HEAD (no branch)"), "detached");
        assert!(!parse_git_status("## main\n").is_dirty);
    }

    #[test]
    fn filters_irrelevant_changes() {
        let root = Path::new("C:/proj");
        assert!(is_relevant_change(root, Path::new("C:/proj/src/main.rs")));
        assert!(is_relevant_change(root, Path::new("C:/proj/new_file.txt")));
        assert!(is_relevant_change(root, Path::new("C:/proj/node_modules"))); // dir itself appearing
        assert!(!is_relevant_change(root, Path::new("C:/proj/node_modules/x/index.js")));
        assert!(!is_relevant_change(root, Path::new("C:/proj/target/debug/app.exe")));
        assert!(!is_relevant_change(root, Path::new("C:/proj/.git/objects/ab/cdef")));
        assert!(is_relevant_change(root, Path::new("C:/proj/.git/index")));
        assert!(is_relevant_change(root, Path::new("C:/proj/.git/HEAD")));
    }

    fn opts(max_depth: usize) -> ScanOptions {
        ScanOptions { max_depth, show_hidden: false, skip_dirs: default_skip_dirs() }
    }

    /// Creates a unique temp dir with the given relative files, runs `f`, cleans up.
    fn with_tree(name: &str, files: &[&str], f: impl FnOnce(&Path)) {
        let root = std::env::temp_dir().join(format!("canopy_{}_{}", name, std::process::id()));
        for rel in files {
            let p = root.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, "").unwrap();
        }
        f(&root);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn compacts_single_folder_chain() {
        with_tree("chain2", &["a/b/f.py"], |root| {
            let tree = compact_tree(build_tree(root, 0, &opts(8)).unwrap());
            assert_eq!(tree[0].name, "b");
            assert_eq!(tree[0].compact_path.as_deref(), Some("a / "));
            assert_eq!(tree[0].children.as_ref().unwrap()[0].icon_type.as_deref(), Some("py"));
        });
    }

    #[test]
    fn compacts_long_chain_with_correct_prefix() {
        // Regression: a/b/c/d used to produce "a / " then a nested "a / c / "
        with_tree("chain4", &["a/b/c/d/f.txt"], |root| {
            let tree = compact_tree(build_tree(root, 0, &opts(8)).unwrap());
            assert_eq!(tree.len(), 1);
            assert_eq!(tree[0].name, "d");
            assert_eq!(tree[0].compact_path.as_deref(), Some("a / b / c / "));
            assert_eq!(tree[0].children.as_ref().unwrap()[0].name, "f.txt");
        });
    }

    #[test]
    fn does_not_compact_folder_with_files() {
        with_tree("nocompact", &["a/x.txt", "a/b/f.txt"], |root| {
            let tree = compact_tree(build_tree(root, 0, &opts(8)).unwrap());
            assert_eq!(tree[0].name, "a");
            assert!(tree[0].compact_path.is_none());
        });
    }

    #[test]
    fn depth_limit_marks_folders_unloaded() {
        with_tree("lazy", &["src/deep/more/f.rs", "top.txt"], |root| {
            let tree = build_tree(root, 0, &opts(1)).unwrap();
            let src = tree.iter().find(|n| n.name == "src").unwrap();
            assert!(src.unloaded);
            assert!(src.children.is_none());
            assert!(tree.iter().any(|n| n.name == "top.txt"));
            // An unloaded folder is never compacted into its parent
            let compacted = compact_tree(build_tree(root, 0, &opts(2)).unwrap());
            let src = compacted.iter().find(|n| n.name == "src").unwrap();
            assert!(src.compact_path.is_none());
            assert!(src.children.as_ref().unwrap()[0].unloaded);
        });
    }

    #[test]
    fn skipped_dirs_are_listed_but_unloaded() {
        with_tree("skip", &["node_modules/pkg/index.js", "main.js"], |root| {
            let tree = build_tree(root, 0, &opts(8)).unwrap();
            let nm = tree.iter().find(|n| n.name == "node_modules").unwrap();
            assert!(nm.unloaded && nm.children.is_none());
        });
    }

    #[test]
    fn hidden_files_respect_option() {
        with_tree("hidden", &[".env", "a.txt"], |root| {
            assert!(!build_tree(root, 0, &opts(8)).unwrap().iter().any(|n| n.name == ".env"));
            let show = ScanOptions { show_hidden: true, ..opts(8) };
            assert!(build_tree(root, 0, &show).unwrap().iter().any(|n| n.name == ".env"));
        });
    }
}
