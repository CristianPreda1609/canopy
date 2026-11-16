import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { targetPaths, fileManagerName } from '../services/paths';
import { openInVSCode, openTerminal, openInExplorer, revealInExplorer, copyToClipboard } from '../services/tauri';
import { KEYMAP, formatCombo, type ShortcutId } from '../keymap';
import { fuzzyFilter } from '../fuzzy';
import {
  TbFolderPlus,
  TbBrandVscode,
  TbTerminal,
  TbFolderOpen,
  TbLayoutColumns,
  TbSettings,
  TbExternalLink,
  TbFileSearch,
  TbCopy,
  TbSquareX,
} from 'react-icons/tb';

type CommandItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  /** Shortcut to show next to the command */
  shortcut?: ShortcutId;
};

export function CommandPalette() {
  const {
    state, toggleCommandPalette, addPanel, toggleLayout, toggleSettings, toggleQuickOpen, removePanel,
  } = useAppContext();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Commands act on the selected item of the active panel (or its root)
  const panel = state.panels.find(p => p.id === state.activePanelId);
  const sel = state.selection?.panelId === panel?.id ? state.selection : null;
  const targets = panel?.path ? targetPaths(panel.path, sel?.path ?? null, sel?.isFolder ?? true) : null;
  const run = (fn: (path: string) => Promise<void>, which: 'full' | 'folder' | 'root') => () => {
    const path = which === 'root' ? panel?.path : targets?.[which];
    if (path) fn(path).catch(console.error);
  };

  const commands: CommandItem[] = [
    { id: 'quick-open', label: 'Go to file…', icon: <TbFileSearch />, action: toggleQuickOpen, shortcut: 'quickOpen' },
    { id: 'add-folder', label: 'Open folder in panel', icon: <TbFolderPlus />, action: () => addPanel(), shortcut: 'addPanel' },
    { id: 'open-vscode', label: 'Open project in VS Code', icon: <TbBrandVscode />, action: run(openInVSCode, 'root') },
    { id: 'open-terminal', label: 'Open terminal here', icon: <TbTerminal />, action: run(openTerminal, 'folder') },
    { id: 'open-explorer', label: `Open in ${fileManagerName}`, icon: <TbFolderOpen />, action: run(openInExplorer, 'folder') },
    { id: 'reveal-explorer', label: `Reveal in ${fileManagerName}`, icon: <TbExternalLink />, action: run(revealInExplorer, 'full') },
    { id: 'copy-path', label: 'Copy path', icon: <TbCopy />, action: run(copyToClipboard, 'full') },
    { id: 'toggle-layout', label: 'Toggle layout', icon: <TbLayoutColumns />, action: toggleLayout, shortcut: 'toggleLayout' },
    { id: 'close-panel', label: 'Close panel', icon: <TbSquareX />, action: () => { if (panel) removePanel(panel.id); }, shortcut: 'closePanel' },
    { id: 'settings', label: 'Settings', icon: <TbSettings />, action: toggleSettings, shortcut: 'settings' },
  ];

  const filteredCommands = search.trim()
    ? fuzzyFilter(search, commands, c => c.label).map(r => r.item)
    : commands;

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
      // Close first: some commands (Settings) open another overlay
      toggleCommandPalette();
      filteredCommands[selectedIndex].action();
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
                toggleCommandPalette();
                cmd.action();
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && <kbd className="cmd-kbd">{formatCombo(KEYMAP[cmd.shortcut].combo)}</kbd>}
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
