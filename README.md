<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" alt="Canopy icon" />
</p>

<h1 align="center">Canopy</h1>

<p align="center">
  <a href="https://github.com/CristianPreda1609/canopy/actions/workflows/ci.yml"><img src="https://github.com/CristianPreda1609/canopy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

**Canopy** is a lightweight desktop app for **Windows, macOS and Linux** that puts all of your projects side by side as live file trees. Each project is a panel, and you can jump from any file or folder into VS Code, a terminal or your file manager with one click.

Canopy is built with **[Tauri 2](https://tauri.app/)**, so it uses a native Rust backend and the system WebView2. It doesn't bundle a whole browser.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running in Development](#running-in-development)
  - [Building a Release](#building-a-release)
- [Usage](#usage)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Command Palette](#command-palette)
  - [Context Menu](#context-menu)
  - [Git Status Colors](#git-status-colors)
- [How It Works](#how-it-works)
  - [Architecture](#architecture)
  - [Backend Commands (Rust API)](#backend-commands-rust-api)
  - [Directory Scanning Rules](#directory-scanning-rules)
  - [Permissions (Tauri Capabilities)](#permissions-tauri-capabilities)
- [Development Notes](#development-notes)
- [Roadmap / Known Limitations](#roadmap--known-limitations)
- [License](#license)

---

## Features

- 📂 **Multi-panel workspace**: open any number of project folders, each in its own panel.
- 🌲 **Fast, lazy file tree**: only the first few levels load up front, and deeper folders load when you expand them, so huge repos open instantly. Folders come first, sorted alphabetically. Heavy folders such as `node_modules` and `target` aren't scanned until you open them.
- ⚙️ **Settings**: scan depth, hidden files, skipped folders, **custom git colors**, and **rebindable shortcuts** with a built-in shortcuts guide (`F1`).
- 🗜️ **Compact folders**: chains of single-child folders are merged into one row (`src / main / java`), the same way VS Code does it.
- 🔄 **Live reload**: a file watcher on each panel refreshes the tree when files are created, modified or deleted.
- 🌿 **Git integration**: shows the current branch and whether there are uncommitted changes, and colors each file by its git status.
- ⚡ **Quick actions**: open a file or folder in **VS Code**, a **terminal**, or the system **file manager** (Explorer / Finder / your Linux default), reveal it there, or copy its path.
- 🖥️ **Cross-platform**: Windows, macOS and Linux, each using its native terminal and file manager.
- 🪟 **Tiling workspaces** *(experimental branch)*: Hyprland-style dwindle tiling, keyboard focus/swap/resize, fullscreen, and workspaces 1–9.
- 🎛️ **Command palette** (`Ctrl+Shift+P`) with fuzzy filtering and keyboard navigation.
- ⬆️ **Auto-updates**: Canopy checks GitHub Releases on startup and updates itself in one click. Updates are cryptographically signed.
- 💾 **Persistent workspace**: the panels you open are remembered between launches.
- 🪟 **Frameless, transparent window** with a custom title bar and a glassmorphism UI.
- 🧪 **Browser fallback**: the frontend also runs in a regular browser (`npm run dev`), with mocked native calls for UI work.

---

## Tech Stack

| Layer      | Technology                                                                 |
|------------|-----------------------------------------------------------------------------|
| Shell      | [Tauri 2](https://tauri.app/) (WebView2 / WKWebView / WebKitGTK)             |
| Backend    | Rust (edition 2021): `serde`, `notify` (file watching), `arboard` (clipboard) |
| Plugins    | `tauri-plugin-dialog` (native folder picker), `tauri-plugin-log`             |
| Frontend   | React 19 + TypeScript, bundled with Vite                                     |
| State      | React Context API (`AppContext`)                                             |
| Styling    | Vanilla CSS with custom properties (no CSS framework)                        |
| Icons      | [`react-icons`](https://react-icons.github.io/react-icons/) (Tabler set)     |
| Quality    | ESLint, `node:test` (frontend), `cargo test` + Clippy (backend)              |
| CI / CD    | GitHub Actions: checks on all 3 OSes, tagged releases build installers       |

---

## Project Structure

```
canopy/
├── frontend/                    # React + TypeScript UI (Vite)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx             # React entry point
│       ├── App.tsx              # Root component, global Ctrl+Shift+P listener
│       ├── index.css            # Design system (CSS variables, glass effects)
│       ├── contexts/
│       │   └── AppContext.tsx   # Global state: panels, trees, git info, persistence
│       ├── services/
│       │   ├── tauri.ts         # The ONLY place that calls Tauri invoke()
│       │   ├── paths.ts         # Cross-platform path helpers (+ paths.test.ts)
│       └── components/
│           ├── TitleBar.tsx     # Custom frameless title bar (drag/min/max/close)
│           ├── Panels.tsx       # Panel grid
│           ├── PanelHeader.tsx  # Panel title, badge, git branch, close button
│           ├── TreeView.tsx     # Recursive file tree with git coloring
│           ├── ContextMenu.tsx  # Right-click / Ctrl+hover actions
│           ├── CommandPalette.tsx
│           └── StatusBar.tsx
│
├── src-tauri/                   # Rust backend
│   ├── Cargo.toml
│   ├── app-icon.png             # 1024px source icon (regenerate with `cargo tauri icon app-icon.png`)
│   ├── tauri.conf.json          # Window, build & security (CSP) config
│   ├── capabilities/
│   │   └── default.json         # Permissions granted to the webview
│   ├── icons/
│   └── src/
│       ├── main.rs              # Binary entry point
│       └── lib.rs               # Tauri commands (fs, git, watcher, shell, clipboard)
│
├── .github/workflows/
│   ├── ci.yml                   # Lint, test, build, clippy on Windows/macOS/Linux
│   └── release.yml              # Tag v* → installers for all platforms
├── ARCHITECTURE.md              # In-depth technical documentation (Romanian)
├── LICENSE-APACHE               # Apache License 2.0
├── LICENSE-MIT                  # MIT License
└── README.md
```

---

## Getting Started

### Prerequisites

**All platforms:**

| Requirement | Notes |
|-------------|-------|
| [Node.js](https://nodejs.org/) **22.18+** (24 recommended) and npm | For the frontend toolchain. `npm test` relies on native TypeScript support |
| [Rust](https://rustup.rs/) via rustup | The exact version is pinned in `src-tauri/rust-toolchain.toml` (currently 1.100.0), and rustup installs it automatically |
| [Tauri CLI](https://tauri.app/reference/cli/) | `cargo install tauri-cli --version "^2"` |
| *Optional:* [VS Code](https://code.visualstudio.com/) with `code` on your `PATH` | Needed for "Open in VS Code" |
| *Optional:* [Git](https://git-scm.com/) on your `PATH` | Needed for git status info |

**Per platform:**

| OS | Extra requirements |
|----|--------------------|
| **Windows 10/11** | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (*Desktop development with C++*), [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11). Optional: [Windows Terminal](https://aka.ms/terminal), with a fallback to `cmd` |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** (Debian/Ubuntu) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |

**How the integrations behave on each OS:**

| Action | Windows | macOS | Linux |
|--------|---------|-------|-------|
| Terminal | `wt`, falling back to `cmd` | Terminal.app | First found: `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `kitty`, `alacritty`, `wezterm`, `xterm` |
| File manager | Explorer | Finder | `xdg-open` / `gio open` |
| Reveal | `explorer /select,` | `open -R` | Opens the containing folder |
| VS Code | `code` | `code`, falling back to `open -a "Visual Studio Code"` | `code`, falling back to `codium` |

See the official [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for more detail.

### Installation

```powershell
git clone https://github.com/CristianPreda1609/canopy.git
cd canopy

# Install frontend dependencies
cd frontend
npm install
cd ..
```

Cargo downloads the Rust dependencies automatically on the first build.

### Running in Development

From the **`src-tauri`** directory, where `tauri.conf.json` lives:

```powershell
cd src-tauri
cargo tauri dev
```

This starts the Vite dev server on `http://localhost:5173` (via `beforeDevCommand`), compiles the Rust backend and opens the Canopy window with hot reload.

**Frontend-only mode.** To work on the UI without the Rust side:

```powershell
cd frontend
npm run dev
```

Native calls are mocked in this mode. They log to the console or return empty data.

### Building a Release

```powershell
cd src-tauri
cargo tauri build
```

The build runs `npm run build` for the frontend and then compiles an optimized binary. The installers end up in `src-tauri/target/release/bundle/`: MSI/NSIS on Windows, `.dmg`/`.app` on macOS, and `.deb`/`.rpm`/`.AppImage` on Linux.

### Testing

```powershell
cd frontend;  npm test          # path helper unit tests (node:test)
cd src-tauri; cargo test --lib  # git parsing, watcher filter, tree building
cd src-tauri; cargo clippy --all-targets -- -D warnings
```

### Continuous Integration & Releases

- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and on every PR:
  - **Frontend:** lint, unit tests and production build.
  - **Backend:** Clippy (warnings count as errors) and `cargo test`, on **Windows, macOS and Linux**.
- **Release** (`.github/workflows/release.yml`): push a version tag to build installers for every platform. Windows, Linux, and macOS on both Apple Silicon and Intel are built and attached to a **draft** GitHub Release:
  ```powershell
  git tag v0.1.0
  git push origin v0.1.0
  ```
  Review the draft on GitHub and publish it. The macOS builds aren't signed or notarized, so on first launch users have to right-click → **Open**.

### Other scripts (in `frontend/`)

| Command           | Description                         |
|-------------------|-------------------------------------|
| `npm run dev`     | Start the Vite dev server           |
| `npm run build`   | Type-check (`tsc -b`) and build     |
| `npm run lint`    | Run ESLint                          |
| `npm test`        | Run unit tests                      |
| `npm run preview` | Preview the production build        |

### Auto-updates

Canopy uses Tauri's official [updater plugin](https://v2.tauri.app/plugin/updater/):

1. About 5 seconds after startup, the app fetches `releases/latest/download/latest.json` from this repo. You can also run **Check for updates** from the command palette.
2. If a newer version exists, an **"update to vX.Y.Z"** pill appears in the status bar. Clicking it downloads the update, checks its signature against the public key in `tauri.conf.json`, installs it and restarts.
3. Release builds are signed with a private key that lives only in the `TAURI_SIGNING_PRIVATE_KEY` repository secret. Without that secret, releases still build, just without update files.

**One-time setup (maintainer):**

1. The key pair was generated with `cargo tauri signer generate -w ~/.tauri/canopy.key`. **Back up `~/.tauri/canopy.key`.** If it's lost, existing installs can't verify future updates.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**:
   - `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `~/.tauri/canopy.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional (the current key has no password)
3. Publish releases. Drafts and pre-releases are invisible to `releases/latest`, so the updater only sees **published** releases.

To release a new version, bump `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml`), then tag it and push the tag.

### Changing the app icon

Replace `src-tauri/app-icon.png` (1024×1024, transparent PNG), then run this from `src-tauri`:

```powershell
cargo tauri icon app-icon.png
```

Copy `icons/64x64.png` to `frontend/public/favicon.png` and `icons/128x128.png` to `frontend/src/assets/canopy-logo.png` to update the favicon and the title bar logo.

---

## Usage

1. Click **`+ add`**, or run **Open folder in panel** from the command palette, and pick a project folder.
2. The folder appears as a new panel showing its file tree, git branch and dirty state.
3. Click folders to expand or collapse them.
4. Right-click any file or folder, or hold **Ctrl** while hovering over it, to open the context menu.
5. Close a panel with the **×** in its header. Your open panels are restored the next time you start Canopy.

### Keyboard Shortcuts

Canopy can be used entirely from the keyboard. On macOS, use `⌘` instead of `Ctrl`.

Press **`F1`** for the shortcuts guide. To **change any app shortcut**, open Settings → **Shortcuts**, click a shortcut and press the new keys. Conflicts are detected, and bindings need `Ctrl`/`⌘` or `Alt`, or must be a function key. Tooltips and the command palette always show your current bindings.

**App**

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+P` | Go to file (fuzzy search across all panels) |
| `Ctrl+,` | Settings |
| `Ctrl+O` | Open a folder in a new panel |
| `Ctrl+W` | Close the active panel |
| `Ctrl+\` | Toggle split direction of the focused panel |
| `Ctrl+1` … `Ctrl+9` | Jump to panel 1–9 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous panel |
| `F1` | Keyboard shortcuts guide |
| `Esc` | Close the palette, dialog or context menu |

**Tiling** *(experimental: `experimental/tiling` branch)*

| Shortcut | Action |
|----------|--------|
| `Alt+H/J/K/L` or `Alt+Arrows` | Focus the panel left / down / up / right |
| `Alt+Shift+H/J/K/L` or `Alt+Shift+Arrows` | Swap with that panel |
| `Alt+Ctrl+Arrows` | Resize (move the nearest divider) |
| `Alt+F` | Fullscreen the focused panel |
| `Alt+E` (or `Ctrl+\`) | Toggle split direction |
| `Alt+1` … `Alt+9` | Switch workspace |
| `Alt+Shift+1` … `Alt+Shift+9` | Send the focused panel to a workspace |

New panels split the focused panel (wider panels split side by side, taller ones split top/bottom). You can also drag the dividers. Layouts and workspaces are saved per folder and restored on launch. `Ctrl+1…9` and `Ctrl+Tab` work within the current workspace. On macOS, `Alt` is `Option`, and keys are matched by physical position, so `Option+H` works even though it types `˙`.

**File tree** (active panel)

| Key | Action |
|-----|--------|
| `↑` `↓` or `K` `J` | Move the selection |
| `→` or `L` | Expand a folder, or move to its first child |
| `←` or `H` | Collapse a folder, or move to its parent |
| `Enter` / `Space` | Toggle a folder, or open the file in VS Code |
| `Home` / `End` | First / last item |
| `Y` | Copy the full path |
| `T` | Open a terminal in that folder |
| `E` | Reveal in the file manager |
| `Ctrl` + hover | Open the context menu on an item |

**Go to file** (`Ctrl+P`): `Enter` opens the file in VS Code, and `Shift+Enter` reveals it in the file manager. Search covers every file in open panels, including folders that haven't loaded in the tree yet (up to 20,000 files per panel).

### Command Palette

| Command                | Description                                      |
|------------------------|--------------------------------------------------|
| Open folder in panel   | Pick a folder and add it as a new panel          |
| Open in VSCode         | Open the current panel's folder in VS Code       |
| Open terminal here     | Open a terminal at the location                  |
| Open in Explorer / Finder / file manager | Open the containing folder  |
| Reveal in Explorer / Finder / file manager | Show the item selected in its folder |
| Toggle split direction | Flip the focused split horizontal ↔ vertical (also the title bar button) |
| Fullscreen panel       | Show only the focused panel (`Alt+F`) |
| Settings               | Open the settings dialog (also the ⚙ title bar button) |

### Context Menu

Right-click (or `Ctrl`+hover) on a tree node to:

- Open it in **VS Code**
- Open a **terminal** in that location
- Open it, or **reveal it**, in the file manager
- **Copy its full path** to the clipboard

### Git Status Colors

If a panel's root folder is a git repository, each file in its tree is colored by its status:

| Color        | Status      |
|--------------|-------------|
| 🟠 Orange    | Modified    |
| 🟢 Green     | Staged      |
| 🟣 Faded purple | Untracked |
| 🔴 Red       | Conflict / Deleted |

---

## How It Works

### Architecture

React components never talk to Rust directly. Every call goes through `services/tauri.ts`, and the backend responds through Tauri's IPC bridge:

```mermaid
sequenceDiagram
    participant User
    participant UI as React Component
    participant Ctx as AppContext
    participant Svc as services/tauri.ts
    participant Rs as Rust (lib.rs)
    participant OS as Operating System

    User->>UI: Click / shortcut
    UI->>Ctx: action (e.g. addPanel)
    Ctx->>Svc: wrapper function
    Svc->>Rs: invoke("command", args)
    Rs->>OS: fs read / spawn process / git
    OS-->>Rs: result
    Rs-->>Svc: Result<T, String> (JSON)
    Svc-->>Ctx: typed data
    Ctx-->>UI: re-render
    Rs--)Ctx: "file_changed" event (watcher)
```

**What happens when you add a project:**

1. `pickFolder()` opens the native folder dialog through `tauri-plugin-dialog`.
2. `read_directory` scans the folder up to the configured **scan depth** (default 3) and returns a compacted JSON tree. Folders beyond that come back marked `unloaded`, and expanding one calls `read_directory` again on just that folder (lazy loading).
3. `get_git_info` runs `git status --porcelain=v1 -b`, which gives both the branch and the status of each file. It also works in worktrees and submodules. If git isn't installed, the panel simply shows no git info.
4. `watch_directory` starts a recursive `notify` watcher. It ignores changes inside skipped folders (`node_modules`, `target`, `.git/objects`, …), but reacts to `.git/index` and `.git/HEAD` so the git colors update when you stage or switch branches. It emits `file_changed` at most every 200ms, and the frontend debounces that and re-reads the panel.
5. The panel's path is saved to `localStorage` under the key `canopy_panels`.

### Backend Commands (Rust API)

All commands live in `src-tauri/src/lib.rs` and return `Result<T, String>`.

| Command | Arguments | Returns | Description |
|---------|-----------|---------|-------------|
| `read_directory` | `path`, `depth?`, `showHidden?`, `skipDirs?` | `FileNode[]` | Scan `depth` levels (default 3, max 12), sorted and compacted. Deeper and skipped folders return `unloaded: true` |
| `default_skip_dirs` | – | `string[]` | The built-in list of skipped folders |
| `list_files` | `path`, `showHidden?`, `skipDirs?`, `limit?` | `{ files, truncated }` | Every file under `path` (relative paths), breadth-first, for Go to file. Runs on a worker thread |
| `get_git_info` | `path` | `GitStatus \| null` | Branch, dirty flag and per-file status. Returns `null` if the folder isn't a repository |
| `watch_directory` | `panelId`, `path` | `()` | Starts a recursive watcher that emits `file_changed` |
| `unwatch_directory` | `panelId` | `()` | Stops the panel's watcher |
| `open_in_vscode` | `path` | `()` | Opens VS Code (see the per-OS table above) |
| `open_terminal` | `path` | `()` | Opens a terminal in that folder |
| `open_in_explorer` | `path` | `()` | Opens the folder in the system file manager |
| `reveal_in_explorer` | `path` | `()` | Shows the item selected in the file manager |
| `copy_to_clipboard` | `text` | `()` | Writes the text to the system clipboard via `arboard` |

**Data shapes:**

```ts
type TreeNode = {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  iconType?: 'py' | 'cpp' | 'js' | 'ts' | 'rs' | 'json' | 'config' | 'doc' | 'web';
  compactPath?: string;   // e.g. "src / main / " when folders were compacted
};

type GitStatus = {
  branch: string;         // or "detached"
  is_dirty: boolean;
  files: { path: string; status: 'modified' | 'staged' | 'untracked' | 'deleted' | 'conflict' | 'unknown' }[];
};
```

### Directory Scanning Rules

- **Hidden entries**: anything whose name starts with `.` is skipped.
- **Skipped folders**: these are listed but only scanned when you expand them. The built-in list can be customized in Settings:
  `node_modules`, `target`, `.git`, `__pycache__`, `.venv`, `venv`, `.idea`, `.vscode`, `dist`, `build`, `.next`, `.cache`, `vendor`, `packages`, `.svn`, `obj`, `bin`
- **Unreadable folders** (for example, permission denied) appear empty instead of breaking the tree.
- **Scan depth**: 3 levels by default (configurable from 1 to 12). Deeper folders load on demand.
- **Compaction**: chains of single-folder directories (`a/b/c`) are shown as one row, `a / b / c`. A folder that hasn't loaded yet is never merged into such a chain.
- **Refresh**: when files change, the panel is rescanned. Folders you'd expanded deeper than the scan depth are fetched again, so they stay up to date.
- **Sorting**: folders first, then files, alphabetically and case-insensitive.
- **Icons**: the file extension determines `iconType` (for example `.py` → `py` and `.yml` → `config`).

### Permissions (Tauri Capabilities)

`src-tauri/capabilities/default.json` grants the webview only what it needs:

- `core:default`
- `core:window:allow-start-dragging`, `allow-minimize`, `allow-maximize`, `allow-close`, used by the custom title bar
- `dialog:default`, used by the native folder picker

A strict **Content Security Policy** is also set in `tauri.conf.json`. It allows only the app itself, the Tauri IPC channel and Google Fonts. `macOSPrivateApi` is enabled so the transparent, frameless window renders correctly on macOS; the trade-off is that the app can't be submitted to the Mac App Store.

---

## Development Notes

- **The only place to add backend calls is `services/tauri.ts`.** Each wrapper checks `isTauri` so the UI keeps working in a plain browser.
- **To add a new Rust command:** write a `#[tauri::command]` function in `lib.rs`, register it in `generate_handler![...]`, and add a typed wrapper in `tauri.ts`.
- **New window or plugin APIs** need a matching permission in `capabilities/default.json`.
- More detailed (Romanian) technical documentation is in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Roadmap / Known Limitations

- [x] Cross-platform support (Windows, macOS, Linux)
- [x] Layout toggle
- [x] CI on all three OSes, plus automated release builds
- [x] Settings panel (scan depth, hidden files, skipped folders)
- [x] Lazy loading of deep and skipped folders
- [x] Keyboard shortcuts, tree navigation and Go to file (`Ctrl+P`)
- [x] Signed auto-updates via GitHub Releases
- [ ] Sign and notarize the macOS builds.

---

## License

Canopy is dual-licensed under either of

- **Apache License, Version 2.0** ([`LICENSE-APACHE`](./LICENSE-APACHE))
- **MIT License** ([`LICENSE-MIT`](./LICENSE-MIT))

at your option.

Unless you explicitly state otherwise, any contribution you intentionally submit for inclusion in this project, as defined in the Apache-2.0 license, is dual-licensed as above, without any additional terms or conditions.
