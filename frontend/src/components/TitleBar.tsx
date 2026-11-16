import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppContext } from "../contexts/AppContext";
import { TbLayoutColumns, TbLayoutGrid, TbSettings, TbMinus, TbX, TbSearch } from "react-icons/tb";
import logoUrl from "../assets/canopy-logo.png";

// Guard: Tauri APIs are only available inside Tauri webview, not in plain browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const safeCall = (fn: () => void) => {
  if (isTauri) fn();
};

export function TitleBar() {
  const { state, toggleCommandPalette, toggleLayout, toggleSettings } = useAppContext();

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
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: "2px" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="tb-btn"
          aria-label="toggle layout"
          title={state.layout === 'grid' ? 'Switch to row layout' : 'Switch to grid layout'}
          onClick={toggleLayout}
        >
          {state.layout === 'grid' ? <TbLayoutColumns /> : <TbLayoutGrid />}
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