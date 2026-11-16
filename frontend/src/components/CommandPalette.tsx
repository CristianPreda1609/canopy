import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { resolveTreePath, parentDir, fileManagerName } from '../services/paths';
import { openInVSCode, openTerminal, openInExplorer, revealInExplorer } from '../services/tauri';
import {
  TbFolderPlus,
  TbBrandVscode,
  TbTerminal,
  TbFolderOpen,
  TbLayoutColumns,
  TbSettings,
  TbExternalLink
} from 'react-icons/tb';

type CommandItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
};

export function CommandPalette() {
  const { state, toggleCommandPalette, addPanel, toggleLayout } = useAppContext();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const getTargetFullPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    if (!panel || !panel.path) return null;
    return state.selectedFile ? resolveTreePath(panel.path, state.selectedFile) : panel.path;
  };

  const getPanelPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    return panel?.path || null;
  };

  const getParentPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    if (!panel?.path) return null;
    
    // selectedFile is always a file (folders toggle instead of selecting),
    // so its containing folder is where the terminal / file manager should open
    return state.selectedFile ? parentDir(resolveTreePath(panel.path, state.selectedFile)) : panel.path;
  };
  const wrapAction = (action: (p: string) => Promise<void>) => () => {
    const path = getTargetFullPath();
    if (path) {
      action(path).catch(err => console.error(err));
    } else {
      console.warn("No active path to run command on");
    }
  };

  const commands: CommandItem[] = [
    { id: 'add-folder', label: 'Open folder in panel', icon: <TbFolderPlus />, action: () => addPanel() },
    { id: 'open-vscode', label: 'Open in VSCode', icon: <TbBrandVscode />, action: () => { const p = getPanelPath(); if (p) openInVSCode(p).catch(console.error); } },
    { id: 'open-terminal', label: 'Open terminal here', icon: <TbTerminal />, action: () => { const p = getParentPath(); if (p) openTerminal(p).catch(console.error); } },
    { id: 'open-explorer',  label: `Open in ${fileManagerName}`, icon: <TbFolderOpen />, action: () => { const p = getParentPath(); if (p) openInExplorer(p).catch(console.error); } },
    { id: 'reveal-explorer', label: `Reveal in ${fileManagerName}`, icon: <TbExternalLink />, action: wrapAction(revealInExplorer) },
    { id: 'toggle-layout', label: 'Toggle layout', icon: <TbLayoutColumns />, action: toggleLayout },
    { id: 'settings', label: 'Settings', icon: <TbSettings />, action: () => console.log('Settings') },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase())
  );

  // Reset the query each time the palette opens (adjust state during render,
  // instead of setState inside an effect, which causes a cascading render).
  const [wasOpen, setWasOpen] = useState(state.commandPaletteOpen);
  if (state.commandPaletteOpen !== wasOpen) {
    setWasOpen(state.commandPaletteOpen);
    if (state.commandPaletteOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }

  useEffect(() => {
    if (!state.commandPaletteOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [state.commandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
      e.preventDefault();
      filteredCommands[selectedIndex].action();
      toggleCommandPalette();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleCommandPalette();
    }
  };

  if (!state.commandPaletteOpen) return null;

  return (
    <div className="cmd-palette-overlay" onClick={() => toggleCommandPalette()}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="cmd-input"
          placeholder="Type a command or search..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="cmd-list">
          {filteredCommands.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`cmd-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                cmd.action();
                toggleCommandPalette();
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
            </div>
          ))}
          {filteredCommands.length === 0 && (
            <div className="cmd-item" style={{ color: 'var(--color-text-dim)' }}>
              No commands found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
