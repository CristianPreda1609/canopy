# CLAUDE.md

Canopy: a cross-platform desktop app (Tauri 2; Windows, macOS, Linux) that shows multiple project folders side by side as live file trees, with git status and quick actions (VS Code, terminal, file manager).

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
cd frontend; npm test            # node:test unit tests (src/**/*.test.ts)
cd src-tauri; cargo test --lib   # Rust unit tests (bottom of lib.rs)
cd src-tauri; cargo check         # fast Rust check; cargo clippy for lints
cd src-tauri; cargo tauri build   # release installers -> target/release/bundle/
```

Before finishing a change, run what CI runs for whatever you touched: `npm run lint && npm test && npm run build` (frontend) and `cargo clippy --all-targets -- -D warnings && cargo test` (backend). CI (`.github/workflows/ci.yml`) runs these on Windows, macOS and Linux.

## Rules

- **Adding a backend command takes 3 steps:** (1) a `#[tauri::command]` fn in `lib.rs`, (2) register it in `generate_handler![...]`, (3) a typed wrapper in `services/tauri.ts` that guards with `if (!isTauri)` and returns a mock or no-op. Components and contexts never import `@tauri-apps/api` for `invoke` directly.
- **Argument names:** Rust `snake_case` params are passed from JS as `camelCase` (`panel_id` ↔ `{ panelId }`).
- **New window or plugin APIs** need a matching permission in `capabilities/default.json`, or they fail silently at runtime.
- **CSP** in `tauri.conf.json` is strict. A new external resource (fonts, images, network) has to be allowed there.
- Commands return `Result<T, String>` and map errors with `format!`. Don't `unwrap()` on anything coming from the filesystem or a process.
- Spawn external programs with `.spawn()`, never `.output()`, unless the output is needed (as in `git status`). The UI must not block.
- Keep Rust types and TS types in sync: `FileNode` ↔ `TreeNode`, `GitStatus` ↔ `GitStatus` (note the serde renames `type`, `iconType`, `compactPath`).
- Styling is vanilla CSS with variables in `index.css`. Don't add a CSS framework. Icons come from `react-icons/tb` (Tabler).
- **Cross-platform:** OS-specific process spawning lives in the "Platform integration" section of `lib.rs`, uses `cfg!(target_os = ...)` with a fallback list via `spawn_first`. Never hardcode `\` or `/` in frontend paths; use `services/paths.ts` (`resolveTreePath`, `parentDir`, `fileManagerName`).
- The Rust toolchain is pinned in `src-tauri/rust-toolchain.toml` (CI uses the same file). To upgrade, bump it, then fix any new Clippy lints before pushing.
- `macOSPrivateApi` is on (Cargo feature `macos-private-api`) for the transparent window. Keep both in sync.

## Never commit

- Code dumps or snapshots (`CODE_DUMP*.md`, `dump_code.*`). These were already scrubbed from history once, and `.gitignore` blocks them.
- `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/schemas`.

## Known issues / TODO

- Icons: the source is `src-tauri/app-icon.png`. Regenerate with `cargo tauri icon app-icon.png`, then copy into `frontend/public/favicon.png` and `frontend/src/assets/canopy-logo.png`.
- macOS release builds are unsigned.
- The demo panels in `AppContext.tsx` are intentional: they only show in browser-only mode (`!isTauri`).

## Path conventions (frontend)

- **Shortcuts:** add new ones to `KEYMAP` in `src/keymap.ts` (it drives the handler in `hooks/useShortcuts.ts` and the palette hints), then document them in the README. Use `Mod`, never a raw `Ctrl`, so macOS gets `⌘`. Tree keys only fire when no overlay is open and focus isn't in an input.
- Pure tree logic lives in `contexts/tree.ts` (tested in `tree.test.ts`). Keep React and Tauri out of it.
- Lazy loading: folders beyond the scan depth or in the skip list arrive `unloaded` (no `children`). `toggleNodeCollapse` fetches them; `refreshPanel` re-fetches expanded deep folders via the `stale` list from `mergeTreeState`.
- Settings (`contexts/settings.ts`) are persisted in localStorage `canopy_settings` and always go through `normalizeSettings`.

- Tree paths are `"<rootName>/<rel/path>"` with `/` separators. Compacted folders hide intermediate dirs in `compactPath`, and TreeView adds them back into the real path (`realParent`). Never rebuild filesystem paths from `node.name` alone.
- Git file paths are relative to the panel root. Match them exactly against the tree path minus the root segment.
