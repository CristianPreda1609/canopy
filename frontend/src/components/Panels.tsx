import { PanelHeader } from "./PanelHeader";
import { TreeView } from "./TreeView";
import { useAppContext } from "../contexts/AppContext";
import { TbPlus } from "react-icons/tb";

type PanelItem = { id: string; title: string; badge?: string; gitBranch?: string; gitDirty?: boolean; gitFiles?: { path: string; status: string }[] };
type PanelsProps = { items: PanelItem[] };

export function Panels({ items }: PanelsProps) {
  const { state, setActivePanelId, addPanel } = useAppContext();
  
  return (
    <div className="panels">
      {items.map((panel) => (
        <div 
          key={panel.id} 
          className="panel"
          onClick={() => setActivePanelId(panel.id)}
        >
          <PanelHeader title={panel.title} badge={panel.badge} id={panel.id} gitBranch={panel.gitBranch} gitDirty={panel.gitDirty} />
          <div className="panel-body">
            {state.treeData[panel.id] ? (
              <TreeView nodes={state.treeData[panel.id]} panelId={panel.id} />
            ) : (
              <div style={{ padding: '10px', color: 'var(--color-text-dim)', textAlign: 'center' }}>
                Empty Panel
              </div>
            )}
          </div>
        </div>
      ))}
      <button 
        className="panel-add" 
        onClick={addPanel}
        aria-label="add panel"
      >
        <TbPlus style={{ fontSize: '15px' }} />
        <span>add</span>
      </button>
    </div>
  );
}
