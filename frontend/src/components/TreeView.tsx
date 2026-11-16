import React from 'react';
import type { TreeNode } from '../contexts/AppContext';
import { useAppContext } from '../contexts/AppContext';
import {
  TbChevronRight,
  TbChevronDown,
  TbFolder,
  TbFolderOpen,
  TbFileCode,
  TbLoader2,
} from 'react-icons/tb';
import { realSegmentsOf } from '../contexts/tree';

type TreeViewProps = {
  nodes: TreeNode[];
  panelId: string;
  level?: number;
  path?: string[];
  realParent?: string[];
};

// Map file extensions/iconType to a color accent
const getFileIconStyle = (iconType?: string): React.CSSProperties => {
  switch (iconType) {
    case 'py':  return { color: 'rgba(80,200,100,0.7)' };
    case 'cpp': return { color: 'rgba(240,120,50,0.7)' };
    case 'js':  return { color: 'rgba(80,140,255,0.7)' };
    default:    return { color: 'rgba(180,140,255,0.35)' };
  }
};



export function TreeView({ nodes, panelId, level = 0, path = [], realParent = [] }: TreeViewProps) {
  const { state, setSelection, toggleNodeCollapse, openContextMenu } = useAppContext();

  const panel = state.panels.find(p => p.id === panelId);
  const gitFiles = panel?.gitFiles || [];  

  // `nodePath` is "<root>/<rel/path>"; git paths are relative to the repo root,
  // which is the panel root (get_git_info only runs when .git is in the panel root).
  const getGitStatus = (nodePath: string): string | null => {
    const rel = nodePath.split('/').slice(1).join('/');
    if (!rel) return null;
    return gitFiles.find(f => f.path.replace(/\\/g, '/') === rel)?.status || null;
  };

  const handleRightClick = (e: React.MouseEvent, nodePath: string, isFolder: boolean) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, nodePath, panel?.path, isFolder);
  };

  const handleMouseEnter = (e: React.MouseEvent, nodePath: string, isFolder: boolean) => {
    if (e.ctrlKey) {
      openContextMenu(e.clientX, e.clientY, nodePath, panel?.path, isFolder);
    }
  };

  const getGitColor = (status: string | null): string | undefined => {
    switch (status) {
      case 'modified': return '#f09060'; // Orange
      case 'staged': return '#7dd49a'; // Green
      case 'untracked': return 'rgba(180, 140, 255, 0.5)'; // Gray/Purple
      case 'conflict': return '#ff6b6b'; // Red
      case 'deleted': return '#ff6b6b'; // Red
      default: return undefined;
    }
  };

  return (
    <div className="tree-children">
      {nodes.map((node) => {
        // `currentPath` = node names, used to find the node in the tree (collapse toggling).
        // `realPath` = actual filesystem segments: compacted folders ("models / bert")
        // hide intermediate directories in `compactPath`, which must be included.
        const currentPath = [...path, node.name];
        const realPath = realSegmentsOf(realParent, node);
        const pathStr = realPath.join('/');
        const isFolder = node.type === 'folder';
        const isSelected = state.selection?.panelId === panelId && state.selection.path === pathStr;
        const gitStatus = node.type === 'file' ? getGitStatus(pathStr) : null;
        const gitColor = getGitColor(gitStatus);

        return (
          <div key={node.name} className="tree-node">
            <div
              className={`tree-item ${isSelected ? 'sel' : ''}`}
              data-selected={isSelected || undefined}
              style={{ paddingLeft: `${10 + level * 14}px` }}
              onClick={() => {
                setSelection({ panelId, path: pathStr, namePath: currentPath, isFolder });
                if (isFolder) toggleNodeCollapse(panelId, currentPath, realPath);
              }}
              onContextMenu={(e) => handleRightClick(e, pathStr, isFolder)}
              onMouseEnter={(e) => handleMouseEnter(e, pathStr, isFolder)}
            >
              {node.type === 'folder' ? (
                <>
                  {node.loading
                    ? <TbLoader2 className="spin" style={{ flexShrink: 0 }} />
                    : node.collapsed
                      ? <TbChevronRight style={{ flexShrink: 0 }} />
                      : <TbChevronDown style={{ flexShrink: 0 }} />
                  }
                  {node.collapsed
                    ? <TbFolder style={{ flexShrink: 0, color: 'rgba(240,120,50,0.4)' }} />
                    : <TbFolderOpen style={{ flexShrink: 0, color: 'rgba(240,120,50,0.5)' }} />
                  }
                  {node.compactPath && (
                    <span className="compact-path">{node.compactPath}</span>
                  )}
                  <span>{node.name}</span>
                </>
              ) : (
                <>
                  <span style={{ width: '14px', flexShrink: 0, display: 'inline-block' }} />
                  <TbFileCode style={{ flexShrink: 0, ...getFileIconStyle(node.iconType) }} />
                <span style={gitColor ? { color: gitColor } : (!node.iconType ? { color: 'rgba(180,140,255,0.3)' } : {})}>
                  {node.name}
                </span>
                </>
              )}
            </div>

            {node.type === 'folder' && !node.collapsed && node.children?.length === 0 && (
              <div className="tree-empty" style={{ paddingLeft: `${10 + (level + 1) * 14 + 19}px` }}>empty</div>
            )}
            {node.type === 'folder' && !node.collapsed && node.children && (
              <TreeView
                nodes={node.children}
                panelId={panelId}
                level={level + 1}
                path={currentPath}
                realParent={realPath}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
