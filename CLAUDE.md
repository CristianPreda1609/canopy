# CLAUDE.md

Canopy: a Windows desktop app (Tauri 2) that shows multiple project folders side by side as live file trees, with git status and quick actions (VS Code, terminal, Explorer).

## Layout

- `frontend/`: React 19 + TypeScript + Vite UI
  - `src/services/tauri.ts`: the **only** file allowed to call `invoke()` or Tauri plugins
  - `src/contexts/AppContext.tsx`: global state (panels, trees, git info, watchers, localStorage persistence under `canopy_panels`)
  - `src/components/`: UI pieces (TreeView is recursive)
- `src-tauri/`: Rust backend
  - `src/lib.rs`: all `#[tauri::command]`s plus the `run()` builder
  - `capabilities/default.json`: permissions granted to the webview
  - `tauri.conf.json`: window config (frameless, transparent), CSP, build hooks
- `ARCHITECTURE.md`: deep technical doc (Romanian). `README.md`: user-facing doc.

## Commands

```powershell
cd frontend; npm install          # first time
cd src-tauri; cargo tauri dev     # full app (starts Vite on :5173 automatically)
cd frontend; npm run dev          # UI only, native calls are mocked
cd frontend; npm run build        # tsc -b + vite build (type-check gate)
cd frontend; npm run lint
cd src-tauri; cargo check         # fast Rust check; cargo clippy for lints
cd src-tauri; cargo tauri build   # release installers -> target/release/bundle/
```

Before finishing a change, run `npm run build` + `npm run lint` (frontend) and/or `cargo check` (backend) for whatever you touched.

## Rules

- **Adding a backend command takes 3 steps:** (1) a `#[tauri::command]` fn in `lib.rs`, (2) register it in `generate_handler![...]`, (3) a typed wrapper in `services/tauri.ts` that guards with `if (!isTauri)` and returns a mock or no-op. Components and contexts never import `@tauri-apps/api` for `invoke` directly.
- **Argument names:** Rust `snake_case` params are passed from JS as `camelCase` (`panel_id` ↔ `{ panelId }`).
- **New window or plugin APIs** need a matching permission in `capabilities/default.json`, or they fail silently at runtime.
- **CSP** in `tauri.conf.json` is strict. A new external resource (fonts, images, network) has to be allowed there.
- Commands return `Result<T, String>` and map errors with `format!`. Don't `unwrap()` on anything coming from the filesystem or a process.
- Spawn external programs with `.spawn()`, never `.output()`, unless the output is needed (as in `git status`). The UI must not block.
- Keep Rust types and TS types in sync: `FileNode` ↔ `TreeNode`, `GitStatus` ↔ `GitStatus` (note the serde renames `type`, `iconType`, `compactPath`).
- Styling is vanilla CSS with variables in `index.css`. Don't add a CSS framework. Icons come from `react-icons/tb` (Tabler).
- The app is Windows-only for now (`explorer`, `wt`, `cmd`). Gate any cross-platform work behind `cfg!(target_os = ...)`.

## Never commit

- Code dumps or snapshots (`CODE_DUMP*.md`, `dump_code.*`). These were already scrubbed from history once, and `.gitignore` blocks them.
- `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/schemas`.

## Known issues / TODO

- `build_tree` fails the whole tree if any subdirectory can't be read. It should skip the failing folder instead.
- The watcher emits `file_changed` on every event, including in `.git` and `node_modules`. It needs debouncing and path filtering.
- The git porcelain parser maps two-letter codes (`MM`, `AM`, …) to `unknown` and doesn't split rename paths (`old -> new`).
- `AppContext.tsx` still contains demo panels (`ml_thesis`, `embedded`, `web_app`) and a `new_panel` placeholder.
- The command palette's "Toggle layout" and "Settings" are placeholders.
- The bundle identifier is still `com.tauri.dev`, and the Cargo metadata is template defaults.
- There are no tests and no CI yet.
