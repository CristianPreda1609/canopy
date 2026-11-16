use serde::Serialize;
use std::{path::Path, collections::HashMap, sync::Mutex};
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
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
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

            let children = build_tree(&entry.path(), current_depth + 1, max_depth)?;
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
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

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

#[tauri::command]
fn open_in_vscode(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "code", &path])
        .spawn()
        .map_err(|e| format!("Failed to open VSCode: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    // Try Windows Terminal first, fall back to cmd.exe
    let wt_result = std::process::Command::new("cmd")
        .args(["/C", "wt", "-d", &path])
        .spawn();

    match wt_result {
        Ok(_) => Ok(()),
        Err(_) => {
            std::process::Command::new("cmd")
                .args(["/K", &format!("cd /d \"{}\"", path)])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
            Ok(())
        }
    }
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    Ok(())
}
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| format!("Failed to reveal in Explorer: {}", e))?;
    Ok(())
}
#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.set_text(&text)
        .map_err(|e| format!("Failed to copy: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_git_info(path: String) -> Result<Option<GitStatus>, String> {
    let git_dir = Path::new(&path);

    if !git_dir.join(".git").exists() {
        return Ok(None);
    }

    let git_head = git_dir.join(".git").join("HEAD");
    let head_content = std::fs::read_to_string(&git_head)
        .map_err(|e| format!("Failed to read HEAD: {}", e))?;

    let branch = if head_content.starts_with("ref: refs/heads/") {
        head_content.trim().strip_prefix("ref: refs/heads/").unwrap_or("unknown").to_string()
    } else {
        "detached".to_string()
    };

   let output = std::process::Command::new("git")
        .args(["-C", &path, "status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let is_dirty = !stdout.is_empty();

    let mut files = Vec::new();
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        
        let status_code = &line[0..2];
        let file_path = line[3..].trim().trim_matches('"').to_string();
        
        let status = match status_code {
            "??" => "untracked",
            "UU" | "AA" | "DD" => "conflict",
            "M " | "A " | "D " | "R " | "C " => "staged",
            " M" | " A" | " D" | " R" | " C" => "modified",
            _ => "unknown",
        };
        
        files.push(GitFileInfo {
            path: file_path,
            status: status.to_string(),
        });
    }


     Ok(Some(GitStatus {
        branch,
        is_dirty,
        files,
    }))
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

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res { 
                match event.kind{
                    notify::EventKind::Create(_) |
                    notify::EventKind::Remove(_) |
                    notify::EventKind::Modify(_)=>{
                        let _ = app_handle.emit("file_changed", &panel_id_clone);
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
