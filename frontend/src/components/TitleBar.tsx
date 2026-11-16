import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppContext } from "../contexts/AppContext";
import { TbLayoutColumns, TbLayoutRows, TbSettings, TbMinus, TbX, TbSearch, TbMaximize, TbFolderPlus } from "react-icons/tb";
import { WORKSPACE_COUNT, occupiedWorkspaces, activeLayout } from "../tiling/workspaces";
import { leaves } from "../tiling/layout";
import { comboFor, formatCombo, type ShortcutId } from "../keymap";
import logoUrl from "../assets/canopy-logo.png";

// Guard: Tauri APIs are only available inside Tauri webview, not in plain browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const safeCall = (fn: () => void) => {
  if (isTauri) fn();
};

export function TitleBar() {
  const {
    state, toggleCommandPalette, toggleSplitDir, toggleSettings, toggleFullscreen, switchWorkspace, addPanel,
  } = useAppContext();
  const occupied = new Set(occupiedWorkspaces(state.workspaces));
  /** "Label (Ctrl+X)" with the user's current binding, for tooltips. */
  const tip = (label: string, id: ShortcutId) =>
    `${label} (${formatCombo(comboFor(id, state.settings.keybindings))})`;

  // Fullscreen / split only make sense with 2+ panels on this workspace
  const panelCount = leaves(activeLayout(state.workspaces)).length;
  const canTile = panelCount >= 2;
  const needTwo = 'Needs at least 2 panels on this workspace';

  // Drag the window from empty title bar space only. Starting a native drag
  // on a button swallows its click (this broke the palette pill).
  const handleDrag = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    if ((e.target as HTMLElement).closest('button, a, input, [data-no-drag]')) return;
    safeCall(() => getCurrentWindow().startDragging());
  };

  return (
    <div className="titlebar" onPointerDown={handleDrag}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className="logo" style={{ pointerEvents: "none" }}>
          <img className="logo-img" src={logoUrl} alt="" draggable={false} />
          canopy
        </div>
        <button
          className="shortcut-pill"
          onClick={() => toggleCommandPalette()}
          aria-label="Command palette"
          title={tip('Command palette: search every command', 'palette')}
        >
          <TbSearch style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          {formatCombo(comboFor('palette', state.settings.keybindings)).toLowerCase()}
        </button>
        <div className="ws-indicator" aria-label="Workspaces">
          {Array.from({ length: WORKSPACE_COUNT }, (_, i) => i + 1)
            .filter(n => occupied.has(n) || n === state.workspaces.active)
            .map(n => (
              <button
                key={n}
                className={`ws-dot ${n === state.workspaces.active ? 'active' : ''}`}
                onClick={() => switchWorkspace(n)}
                aria-label={`Workspace ${n}`}
                title={`Workspace ${n} (Alt+${n}) · Alt+Shift+${n} sends the focused panel here`}
              >
                {n}
              </button>
            ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        <button className="tb-btn" aria-label="Open folder" title={tip('Open a folder in a new panel', 'addPanel')} onClick={() => addPanel()}>
          <TbFolderPlus />
        </button>
        <button
          className={`tb-btn ${state.workspaces.fullscreen ? 'on' : ''}`}
          aria-label="Fullscreen panel"
          title={canTile || state.workspaces.fullscreen
            ? tip(state.workspaces.fullscreen ? 'Show all panels again' : 'Fullscreen the focused panel', 'tileFullscreen')
            : needTwo}
          disabled={!canTile && !state.workspaces.fullscreen}
          onClick={() => toggleFullscreen()}
        >
          <TbMaximize />
        </button>
        <button
          className="tb-btn"
          aria-label="Toggle split direction"
          title={canTile ? tip('Flip the focused split: side by side ↔ stacked', 'tileToggleSplit') : needTwo}
          disabled={!canTile || state.workspaces.fullscreen}
          onClick={() => toggleSplitDir()}
        >
          <TbLayoutColumns /><TbLayoutRows style={{ marginLeft: -4, opacity: 0.6 }} />
        </button>
        <button className="tb-btn" aria-label="Settings" title={tip('Settings', 'settings')} onClick={() => toggleSettings()}>
          <TbSettings />
        </button>
        <button
          className="tb-btn"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => safeCall(() => getCurrentWindow().minimize())}
        >
          <TbMinus />
        </button>
        <button
          className="tb-btn"
          aria-label="Close window"
          title="Close Canopy"
          onClick={() => safeCall(() => getCurrentWindow().close())}
          style={{ padding: '4px 6px', marginLeft: '2px' }}
        >
          <TbX />
        </button>
      </div>
    </div>
  );
}
