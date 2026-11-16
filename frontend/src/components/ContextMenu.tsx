import { useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { openInVSCode, openTerminal, openInExplorer, revealInExplorer, copyToClipboard } from '../services/tauri';
import { resolveTreePath, parentDir, fileManagerName } from '../services/paths';
import { formatCombo } from '../keymap';
import {
  TbBrandVscode,
  TbTerminal,
  TbFolderOpen,
  TbCopy,
  TbExternalLink
} from 'react-icons/tb';

export function ContextMenu() {
  const { state, closeContextMenu } = useAppContext();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    // Keys shown as hints in the menu: Esc, Enter (open project), Ctrl/Cmd+C (copy path)
    const handleKeyDown = (e: KeyboardEvent) => {
      const menu = state.contextMenu;
      if (!menu) return;
      const full = menu.panelPath ? resolveTreePath(menu.panelPath, menu.targetPath) : menu.targetPath;
      if (e.key === 'Escape') {
        closeContextMenu();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openInVSCode(menu.panelPath || full).catch(console.error);
        closeContextMenu();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyToClipboard(full).catch(console.error);
        closeContextMenu();
      }
    };

    if (state.contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.contextMenu, closeContextMenu]);

  if (!state.contextMenu) return null;

  const { x, y, targetPath, panelPath, isFolder } = state.contextMenu;

  // Resolve absolute path if panelPath exists (for Tauri)
  // If no panelPath (browser mock), just use targetPath
  const fullPath = panelPath ? resolveTreePath(panelPath, targetPath) : targetPath;

  // Terminal / file manager open the folder itself, or the file's containing folder
  const folderPath = isFolder ? fullPath : parentDir(fullPath);

  const wrapAction = (action: (p: string) => Promise<void>) => () => {
  action(fullPath).catch(err => console.error(err));
  closeContextMenu();
  };

  return (
    <div className="context-menu-overlay" onContextMenu={e => e.preventDefault()}>
      <div 
        ref={menuRef} 
        className="ctx-menu"
        style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 190) }}
      >
        <div className="ctx-item accent" onClick={() => { 
        openInVSCode(panelPath || fullPath).catch(console.error); 
        closeContextMenu(); 
        }}>
          <TbBrandVscode /> open project in VS Code <span className="ctx-sh">↵</span>
        </div>
        <div className="ctx-item" onClick={() => { 
          openTerminal(folderPath).catch(console.error);
          closeContextMenu();
        }}>
        <TbTerminal /> open terminal here
        </div>
        <div className="ctx-item" onClick={() => {
          openInExplorer(folderPath).catch(console.error);
          closeContextMenu();
          }}>
          <TbFolderOpen /> open in {fileManagerName}
        </div>
        
        <div className="ctx-sep" />
        
        <div className="ctx-item" onClick={wrapAction(copyToClipboard)}>
          <TbCopy /> copy path <span className="ctx-sh">{formatCombo('Mod+C').toLowerCase()}</span>
        </div>
        <div className="ctx-item" onClick={() => { 
          revealInExplorer(fullPath).catch(console.error);
          closeContextMenu();
          }}>
          <TbExternalLink /> reveal in {fileManagerName}
        </div>
      </div>
    </div>
  );
}
