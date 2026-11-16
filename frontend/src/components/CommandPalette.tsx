import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
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
  const { state, toggleCommandPalette, addPanel } = useAppContext();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const getTargetFullPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    if (!panel || !panel.path) return null;
    if (state.selectedFile) {
      const parts = state.selectedFile.replace(/\//g, '\\').split('\\');
      const withoutRoot = parts.slice(1).join('\\');
      return withoutRoot ? `${panel.path}\\${withoutRoot}` : panel.path;
    }
    return panel.path;
  };

  const getPanelPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    return panel?.path || null;
  };

  const getParentPath = () => {
    const panel = state.panels.find(p => p.id === state.activePanelId);
    if (!panel?.path) return null;
    
    if (state.selectedFile) {
      // selectedFile contine "PyTorch-VAE/tests/file.py"
      // dar panel.path contine deja "...\PyTorch-VAE"
      // deci taiem primul segment din selectedFile
      const parts = state.selectedFile.replace(/\//g, '\\').split('\\');
      const withoutRoot = parts.slice(1).join('\\'); // scoatem "PyTorch-VAE" de la inceput
      
      if (!withoutRoot) return panel.path; // era doar fisier in radacina
      
      const full = `${panel.path}\\${withoutRoot}`;
      const lastSlash = full.lastIndexOf('\\');
      return lastSlash > 0 ? full.substring(0, lastSlash) : full;
    }
    
    return panel.path;
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
    { id: 'open-explorer',  label: 'Open in Explorer', icon: <TbFolderOpen />, action: () => { const p = getParentPath(); if (p) openInExplorer(p).catch(console.error); } },
    { id: 'reveal-explorer', label: 'Reveal in Explorer', icon: <TbExternalLink />, action: wrapAction(revealInExplorer) },
    { id: 'toggle-layout', label: 'Toggle layout', icon: <TbLayoutColumns />, action: () => console.log('Toggle layout') },
    { id: 'settings', label: 'Settings', icon: <TbSettings />, action: () => console.log('Settings') },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (state.commandPaletteOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
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
