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

/// Minimum time between `file_changed` events for one panel
const EMIT_THROTTLE: Duration = Duration::from_millis(200);

/// Directories to skip when scanning the filesystem
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

fn build_tree(path: &Path, current_depth: usize, max_depth: usize) -> Result<Vec<FileNode>, String> {
    if current_depth >= max_depth {
        return Ok(vec![]);
    }
    

    let read_dir = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

    let mut dirs: Vec<FileNode> = Vec::new();
    let mut files: Vec<FileNode> = Vec::new();

    for entry in read_dir {
        // Skip entries we can't read instead of failing the whole tree
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue, // Skip files we can't read
        };

        if metadata.is_dir() {
            // Skip common non-useful directories
            if SKIP_DIRS.contains(&name.as_str()) {
                dirs.push(FileNode {
                    name,
                    node_type: "folder".into(),
                    children: Some(vec![]), // empty — collapsed by default
                    icon_type: None,
                    compact_path: None,
                });
                continue;
            }

            // An unreadable subfolder (e.g. permission denied) shows up empty
            // instead of failing the whole tree
            let children = build_tree(&entry.path(), current_depth + 1, max_depth)
                .unwrap_or_default();
            dirs.push(FileNode {
                name,
                node_type: "folder".into(),
                children: Some(children),
                icon_type: None,
                compact_path: None,
            });
        } else {
            files.push(FileNode {
                name: name.clone(),
                node_type: "file".into(),
                children: None,
                icon_type: get_icon_type(&name),
                compact_path: None,
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

fn compact_tree(nodes: Vec<FileNode>, prefix: &str) -> Vec<FileNode> {
    nodes.into_iter().map(|mut node| {
        if node.node_type == "folder" {
            if let Some(children) = node.children.take() {
                // verificam daca are exact un singur copil care e folder
                let only_folders: Vec<&FileNode> = children.iter()
                    .filter(|n| n.node_type == "folder")
                    .collect();
                let has_files = children.iter().any(|n| n.node_type == "file");

                if only_folders.len() == 1 && !has_files {
                    // compactam: combinam numele
                    let child = children.into_iter().next().unwrap();
                    let compact_label = format!("{}{} / ", prefix, node.name);
                    let mut compacted = child;
                    compacted.compact_path = Some(compact_label.clone());
                    compacted.children = compacted.children.map(|c| compact_tree(c, &compact_label));
                    return compacted;
                } else {
                    node.children = Some(compact_tree(children, ""));
                }
            }
        }
        node
    }).collect()
}

// ─── Tauri Commands ────────────────────────────────────────────────

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    let tree = build_tree(p, 0, 8)?;
    Ok(compact_tree(tree, ""))
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

    #[test]
    fn builds_and_compacts_tree() {
        let tmp = std::env::temp_dir().join(format!("canopy_test_{}", std::process::id()));
        std::fs::create_dir_all(tmp.join("a").join("b")).unwrap();
        std::fs::write(tmp.join("a").join("b").join("f.py"), "").unwrap();
        let tree = compact_tree(build_tree(&tmp, 0, 8).unwrap(), "");
        std::fs::remove_dir_all(&tmp).ok();
        assert_eq!(tree[0].name, "b");
        assert_eq!(tree[0].compact_path.as_deref(), Some("a / "));
        assert_eq!(tree[0].children.as_ref().unwrap()[0].icon_type.as_deref(), Some("py"));
    }
}
