import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Panels } from "./components/Panels";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { useAppContext } from "./contexts/AppContext";

function App() {
  const { state, toggleCommandPalette } = useAppContext();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [toggleCommandPalette]);

  return (
    <div className="app-wrap">
      <div className="scene">
        <div className="sunset-orb" />
        <div className="sunset-orb2" />
        <div className="app">
          <TitleBar />
          <Panels items={state.panels} />
          <StatusBar 
            infopans={`${state.panels.length} panels`} 
            folder_files={state.selectedFile || "No file selected"} 
            state={state.status} 
          />
        </div>
      </div>
      <CommandPalette />
      <ContextMenu />
    </div>
  );
}

export default App;