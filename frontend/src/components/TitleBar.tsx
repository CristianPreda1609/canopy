import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppContext } from "../contexts/AppContext";
import { TbLayoutColumns, TbLayoutGrid, TbSettings, TbMinus, TbX, TbSearch, TbFolderPlus } from "react-icons/tb";
import { comboFor, formatCombo, type ShortcutId } from "../keymap";
import logoUrl from "../assets/canopy-logo.png";

// Guard: Tauri APIs are only available inside Tauri webview, not in plain browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const safeCall = (fn: () => void) => {
  if (isTauri) fn();
};

export function TitleBar() {
  const { state, toggleCommandPalette, toggleLayout, toggleSettings, addPanel } = useAppContext();
  /** "Label (Ctrl+X)" with the user's current binding, for tooltips. */
  const tip = (label: string, id: ShortcutId) =>
    `${label} (${formatCombo(comboFor(id, state.settings.keybindings))})`;

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
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        <button className="tb-btn" aria-label="Open folder" title={tip('Open a folder in a new panel', 'addPanel')} onClick={() => addPanel()}>
          <TbFolderPlus />
        </button>
        <button
          className="tb-btn"
          aria-label="Toggle layout"
          title={tip(state.layout === 'grid' ? 'Switch to a single row of panels' : 'Switch to a grid of panels', 'toggleLayout')}
          onClick={() => toggleLayout()}
        >
          {state.layout === 'grid' ? <TbLayoutColumns /> : <TbLayoutGrid />}
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
          title={state.settings.background.closeToTray ? 'Hide to the tray (Canopy keeps running)' : 'Close Canopy'}
          onClick={() => safeCall(() => getCurrentWindow().close())}
          style={{ padding: '4px 6px', marginLeft: '2px' }}
        >
          <TbX />
        </button>
      </div>
    </div>
  );
}
