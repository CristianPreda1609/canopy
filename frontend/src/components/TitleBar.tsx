import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppContext } from "../contexts/AppContext";
import { TbLayoutColumns, TbSettings, TbMinus, TbX, TbSearch } from "react-icons/tb";

// Guard: Tauri APIs are only available inside Tauri webview, not in plain browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const safeCall = (fn: () => void) => {
  if (isTauri) fn();
};

export function TitleBar() {
  const { toggleCommandPalette } = useAppContext();

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
          <div className="logo-dot" />
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
        <button className="tb-btn" aria-label="layout">
          <TbLayoutColumns />
        </button>
        <button className="tb-btn" aria-label="settings">
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