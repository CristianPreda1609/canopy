import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppContext } from "../contexts/AppContext";
import { TbLayoutColumns, TbLayoutRows, TbSettings, TbMinus, TbX, TbSearch, TbMaximize } from "react-icons/tb";
import { WORKSPACE_COUNT, occupiedWorkspaces } from "../tiling/workspaces";
import logoUrl from "../assets/canopy-logo.png";

// Guard: Tauri APIs are only available inside Tauri webview, not in plain browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const safeCall = (fn: () => void) => {
  if (isTauri) fn();
};

export function TitleBar() {
  const { state, toggleCommandPalette, toggleSplitDir, toggleSettings, toggleFullscreen, switchWorkspace } = useAppContext();
  const occupied = new Set(occupiedWorkspaces(state.workspaces));

  const handleDrag = (e: React.PointerEvent) => {
    if (e.buttons === 1) {
      safeCall(() => getCurrentWindow().startDragging());
    }
  };

  return (
    <div
      className="titlebar"
      onPointerDown={handleDrag}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className="logo" style={{ pointerEvents: "none" }}>
          <img className="logo-img" src={logoUrl} alt="" draggable={false} />
          canopy
        </div>
        <span
          className="shortcut-pill"
          onClick={(e) => {
            e.stopPropagation();
            toggleCommandPalette();
          }}
          title="Command Palette (Ctrl+Shift+P)"
        >
          <TbSearch style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          ctrl+shift+p
        </span>
        <div className="ws-indicator" onPointerDown={(e) => e.stopPropagation()} aria-label="workspaces">
          {Array.from({ length: WORKSPACE_COUNT }, (_, i) => i + 1)
            .filter(n => occupied.has(n) || n === state.workspaces.active)
            .map(n => (
              <button
                key={n}
                className={`ws-dot ${n === state.workspaces.active ? 'active' : ''}`}
                onClick={() => switchWorkspace(n)}
                title={`Workspace ${n} (Alt+${n})`}
              >
                {n}
              </button>
            ))}
        </div>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: "2px" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className={`tb-btn ${state.workspaces.fullscreen ? 'on' : ''}`}
          aria-label="fullscreen panel"
          title="Fullscreen panel (Alt+F)"
          onClick={toggleFullscreen}
        >
          <TbMaximize />
        </button>
        <button className="tb-btn" aria-label="toggle split" title="Toggle split direction (Alt+E)" onClick={toggleSplitDir}>
          <TbLayoutColumns /><TbLayoutRows style={{ marginLeft: -4, opacity: 0.6 }} />
        </button>
        <button className="tb-btn" aria-label="settings" title="Settings" onClick={toggleSettings}>
          <TbSettings />
        </button>
        <button
          className="tb-btn"
          aria-label="minimize"
          onClick={() => safeCall(() => getCurrentWindow().minimize())}
        >
          <TbMinus />
        </button>
        <button
          className="tb-btn"
          aria-label="close"
          onClick={() => safeCall(() => getCurrentWindow().close())}
          style={{ padding: '4px 6px', marginLeft: '2px' }}
        >
          <TbX />
        </button>
      </div>
    </div>
  );
}