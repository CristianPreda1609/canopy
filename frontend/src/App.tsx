import { TitleBar } from "./components/TitleBar";
import { Panels } from "./components/Panels";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAppContext } from "./contexts/AppContext";
import { useShortcuts } from "./hooks/useShortcuts";
import { QuickOpen } from "./components/QuickOpen";
import { leaves } from "./tiling/layout";
import { activeLayout, occupiedWorkspaces } from "./tiling/workspaces";

function App() {
  const { state } = useAppContext();
  useShortcuts();

  // Panels on the visible workspace, plus how many workspaces are in use
  const onWorkspace = leaves(activeLayout(state.workspaces)).length;
  const used = occupiedWorkspaces(state.workspaces).length;
  const panelSummary = `${onWorkspace} panel${onWorkspace === 1 ? '' : 's'}`
    + (used > 1 ? ` · workspace ${state.workspaces.active} of ${used}` : '');

  return (
    <div className="app-wrap">
      <div className="scene">
        <div className="sunset-orb" />
        <div className="sunset-orb2" />
        <div className="app">
          <TitleBar />
          <Panels />
          <StatusBar 
            infopans={panelSummary} 
            folder_files={state.selection?.path || "Nothing selected"} 
            state={state.status} 
          />
        </div>
      </div>
      <CommandPalette />
      <ContextMenu />
      {state.settingsOpen && <SettingsPanel />}
      {state.quickOpenOpen && <QuickOpen />}
    </div>
  );
}

export default App;