import { useEffect, useRef } from 'react';
import { useAppContext, type TreeNode } from '../contexts/AppContext';
import { openInVSCode, openTerminal, openInExplorer, copyToClipboard } from '../services/tauri';
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
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

  const { x, y, targetPath, panelPath } = state.contextMenu;

  // Resolve absolute path if panelPath exists (for Tauri)
  // If no panelPath (browser mock), just use targetPath
  const fullPath = (() => {
      if (!panelPath) return targetPath;
      const parts = targetPath.replace(/\//g, '\\').split('\\');
      const withoutRoot = parts.slice(1).join('\\');
      return withoutRoot ? `${panelPath}\\${withoutRoot}` : panelPath;
  })();

  const targetNode = (() => {
    if (!panelPath) return null;
    const panel = state.panels.find(p => p.path === panelPath);
    if (!panel || !state.treeData[panel.id]) return null;
    
    const findNode = (nodes: TreeNode[], pathParts: string[]): TreeNode | null => {
      if (pathParts.length === 0) return null;
      const node = nodes.find(n => n.name === pathParts[0]);
      if (!node) return null;
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
      return null;
    };
    
    const pathParts = targetPath.split('/');
    return findNode(state.treeData[panel.id], pathParts);
  })();

  const isFolder = targetNode?.type === 'folder';

  const terminalPath = isFolder ? fullPath : (
    fullPath.includes('\\') 
      ? fullPath.substring(0, fullPath.lastIndexOf('\\')) 
      : fullPath
  );

  const explorerPath = terminalPath;

  const wrapAction = (action: (p: string) => Promise<void>) => () => {
  action(fullPath).catch(err => console.error(err));
  closeContextMenu();
  };

  return (
    <div className="context-menu-overlay" onContextMenu={e => e.preventDefault()}>
      <div 
        ref={menuRef} 
        className="ctx-menu"
        style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 150) }}
      >
        <div className="ctx-item accent" onClick={() => { 
        openInVSCode(panelPath || fullPath).catch(console.error); 
        closeContextMenu(); 
        }}>
          <TbBrandVscode /> open in VSCode <span className="ctx-sh">↵</span>
        </div>
        <div className="ctx-item" onClick={() => { 
          openTerminal(terminalPath).catch(console.error); 
          closeContextMenu(); 
        }}>
        <TbTerminal /> open terminal here
        </div>
        <div className="ctx-item" onClick={() => { 
          openInExplorer(explorerPath).catch(console.error); 
          closeContextMenu(); 
          }}>
          <TbFolderOpen /> open in Explorer
        </div>
        
        <div className="ctx-sep" />
        
        <div className="ctx-item" onClick={wrapAction(copyToClipboard)}>
          <TbCopy /> copy path <span className="ctx-sh">ctrl+c</span>
        </div>
        <div className="ctx-item" onClick={() => { 
          openInExplorer(fullPath).catch(console.error); 
          closeContextMenu(); 
          }}>
          <TbExternalLink /> reveal in Explorer
        </div>
      </div>
    </div>
  );
}
