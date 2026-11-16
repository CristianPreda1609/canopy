import { useRef } from "react";
import { PanelHeader } from "./PanelHeader";
import { TreeView } from "./TreeView";
import { useAppContext, type PanelItem } from "../contexts/AppContext";
import { activeLayout } from "../tiling/workspaces";
import type { LayoutNode } from "../tiling/layout";
import { KEYMAP, formatCombo } from "../keymap";
import { TbPlus } from "react-icons/tb";

/** One tiled panel: header + file tree. */
function Panel({ panel }: { panel: PanelItem }) {
  const { state, setActivePanelId } = useAppContext();
  const active = state.activePanelId === panel.id;
  return (
    <div
      className={`panel tile-panel ${active ? 'active' : ''}`}
      onMouseDown={() => { if (!active) setActivePanelId(panel.id); }}
    >
      <PanelHeader title={panel.title} badge={panel.badge} id={panel.id} gitBranch={panel.gitBranch} gitDirty={panel.gitDirty} />
      <div className="panel-body">
        {state.treeData[panel.id] ? (
          <TreeView nodes={state.treeData[panel.id]} panelId={panel.id} />
        ) : (
          <div style={{ padding: '10px', color: 'var(--color-text-dim)', textAlign: 'center' }}>Empty Panel</div>
        )}
      </div>
    </div>
  );
}

/** Draggable divider between the two children of a split. */
function Divider({ dir, path }: { dir: 'h' | 'v'; path: ('a' | 'b')[] }) {
  const { setSplitRatio } = useAppContext();
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const container = ref.current?.parentElement;
    if (!container) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    container.classList.add('dragging');
    const rect = container.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const ratio = dir === 'h' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      setSplitRatio(path, ratio);
    };
    const up = () => {
      container.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return <div ref={ref} className={`tile-divider tile-divider-${dir}`} onPointerDown={onPointerDown} />;
}

/** Recursively render the layout tree as nested flex containers. */
function Tile({ node, path, panels }: { node: LayoutNode; path: ('a' | 'b')[]; panels: Map<string, PanelItem> }) {
  if (node.type === 'leaf') {
    const panel = panels.get(node.id);
    return panel ? <Panel panel={panel} /> : null;
  }
  return (
    <div className={`tile-split tile-split-${node.dir}`}>
      <div className="tile-child" style={{ flexGrow: node.ratio }}>
        <Tile node={node.a} path={[...path, 'a']} panels={panels} />
      </div>
      <Divider dir={node.dir} path={path} />
      <div className="tile-child" style={{ flexGrow: 1 - node.ratio }}>
        <Tile node={node.b} path={[...path, 'b']} panels={panels} />
      </div>
    </div>
  );
}

/** The active workspace, tiled (or just the focused panel in fullscreen). */
export function Panels() {
  const { state, addPanel } = useAppContext();
  const panels = new Map(state.panels.map(p => [p.id, p]));
  const layout = activeLayout(state.workspaces);
  const focused = panels.get(state.activePanelId);

  if (!layout) {
    return (
      <div className="panels tile-root">
        <button className="panel-add tile-empty" onClick={addPanel} aria-label="add panel">
          <TbPlus style={{ fontSize: '22px' }} />
          <span>Open a folder</span>
          <span className="tile-empty-hint">
            {formatCombo(KEYMAP.addPanel.combo)} to open · Alt+1…9 to switch workspace (now {state.workspaces.active})
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="panels tile-root">
      {state.workspaces.fullscreen && focused
        ? <Panel panel={focused} />
        : <Tile node={layout} path={[]} panels={panels} />}
    </div>
  );
}
