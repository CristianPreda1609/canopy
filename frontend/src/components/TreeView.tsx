import React from 'react';
import type { TreeNode } from '../contexts/AppContext';
import { useAppContext } from '../contexts/AppContext';
import {
  TbChevronRight,
  TbChevronDown,
  TbFolder,
  TbFolderOpen,
  TbFileCode,
} from 'react-icons/tb';

type TreeViewProps = {
  nodes: TreeNode[];
  panelId: string;
  level?: number;
  path?: string[];
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



export function TreeView({ nodes, panelId, level = 0, path = [] }: TreeViewProps) {
  const { state, setSelectedFile, toggleNodeCollapse, openContextMenu } = useAppContext();

  const panel = state.panels.find(p => p.id === panelId);
  const gitFiles = panel?.gitFiles || [];  

  const getGitStatus = (nodePath: string): string | null => {
    const treeSegments = nodePath.split('/');
    if (treeSegments.length < 2) return null;
    
    const fileInfo = gitFiles.find(f => {
      const gitSegments = f.path.split('/');
      
      // Compară ultimele N segmente (maxim 3, minim 1)
      const compareLength = Math.min(treeSegments.length - 1, gitSegments.length, 3);
      
      const treeEnd = treeSegments.slice(-compareLength).join('/');
      const gitEnd = gitSegments.slice(-compareLength).join('/');
      
      return treeEnd === gitEnd;
    });
    
    return fileInfo?.status || null;
  };
  const handleRightClick = (e: React.MouseEvent, nodePath: string) => {
    e.preventDefault();
    const panel = state.panels.find(p => p.id === panelId);
    openContextMenu(e.clientX, e.clientY, nodePath, panel?.path);
  };

  const handleMouseEnter = (e: React.MouseEvent, nodePath: string) => {
    if (e.ctrlKey) {
      const panel = state.panels.find(p => p.id === panelId);
      openContextMenu(e.clientX, e.clientY, nodePath, panel?.path);
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
        const currentPath = [...path, node.name];
        const pathStr = currentPath.join('/');
        const isSelected = state.selectedFile === pathStr;
        const gitStatus = node.type === 'file' ? getGitStatus(pathStr) : null;
        const gitColor = getGitColor(gitStatus);

        return (
          <div key={node.name} className="tree-node">
            <div
              className={`tree-item ${isSelected ? 'sel' : ''}`}
              style={{ paddingLeft: `${10 + level * 14}px` }}
              onClick={() => {
                if (node.type === 'folder') {
                  toggleNodeCollapse(panelId, currentPath);
                } else {
                  setSelectedFile(pathStr);
                }
              }}
              onContextMenu={(e) => handleRightClick(e, pathStr)}
              onMouseEnter={(e) => handleMouseEnter(e, pathStr)}
            >
              {node.type === 'folder' ? (
                <>
                  {node.collapsed
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

            {node.type === 'folder' && !node.collapsed && node.children && (
              <TreeView
                nodes={node.children}
                panelId={panelId}
                level={level + 1}
                path={currentPath}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
