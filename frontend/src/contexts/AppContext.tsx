import { createContext, useState, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { pickFolder, readDirectory, isTauri, getGitInfo, watchDirectory, unwatchDirectory} from "../services/tauri";
import {listen} from "@tauri-apps/api/event";

const STORAGE_KEY = 'canopy_panels';

function savePanels(panels: PanelItem[]) {
  const paths = panels.map(p => p.path).filter(Boolean);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}

function loadSavedPaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export type TreeNode = {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  collapsed?: boolean;
  compactPath?: string;
  iconType?: string;
};
export type GitFileInfo = {
  path: string;
  status: string;
};
export type GitStatus = {
  branch: string;
  is_dirty: boolean;
  files: GitFileInfo[];
};


export type PanelItem = { id: string; title: string; badge?: string; path?: string; gitBranch?: string; gitDirty?: boolean; gitFiles?: GitFileInfo[] };

export type ContextMenuState = {
  x: number;
  y: number;
  targetPath: string;
  panelPath?: string; // the root path of the panel (for resolving full filesystem path)
} | null;

export type AppState = {
  panels: PanelItem[];
  activePanelId: string;
  status: string;
  selectedFile: string | null;
  commandPaletteOpen: boolean;
  contextMenu: ContextMenuState;
  treeData: Record<string, TreeNode[]>;
};

type AppContextType = {
  state: AppState;
  setActivePanelId: (id: string) => void;
  removePanel: (id: string) => void;
  addPanel: () => void;
  setSelectedFile: (path: string | null) => void;
  toggleCommandPalette: () => void;
  openContextMenu: (x: number, y: number, targetPath: string, panelPath?: string) => void;
  closeContextMenu: () => void;
  toggleNodeCollapse: (panelId: string, path: string[]) => void;
};

// ─── Mock data (used when running in browser without Tauri) ─────────

const mockTreeData: Record<string, TreeNode[]> = {
  "1": [
    {
      name: "ml_thesis", type: "folder", collapsed: false, children: [
        {
          name: "bert_finetune", type: "folder", compactPath: "models / ", collapsed: false, children: [
            { name: "bert_finetune.py", type: "file", iconType: "py" },
            { name: "train.py", type: "file", iconType: "py" },
            { name: "eval.py", type: "file", iconType: "py" }
          ]
        },
        { name: "notebooks", type: "folder", collapsed: true, children: [] },
        { name: "data", type: "folder", collapsed: true, children: [] },
        { name: "requirements.txt", type: "file" }
      ]
    }
  ],
  "2": [
    {
      name: "platformio_proj", type: "folder", collapsed: false, children: [
        { name: "src", type: "folder", collapsed: true, children: [] },
        { name: "lib", type: "folder", collapsed: true, children: [] },
        { name: "include", type: "folder", collapsed: true, children: [] },
        { name: "platformio.ini", type: "file" },
        { name: "CMakeLists.txt", type: "file" }
      ]
    }
  ],
  "3": [
    {
      name: "web_app", type: "folder", collapsed: false, children: [
        { name: "components", type: "folder", compactPath: "src / ", collapsed: true, children: [] },
        { name: "public", type: "folder", collapsed: true, children: [] },
        { name: "package.json", type: "file" },
        { name: "vite.config.ts", type: "file" }
      ]
    }
  ]
};

const mockPanels: PanelItem[] = [
  { id: "1", title: "ml_thesis", badge: "Python" },
  { id: "2", title: "embedded", badge: "C++" },
  { id: "3", title: "web_app", badge: "JS" },
];

// ─── Badge detection from tree ──────────────────────────────────────

function detectBadge(nodes: TreeNode[]): string | undefined {
  const counts: Record<string, number> = {};
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === 'file' && n.iconType) {
        counts[n.iconType] = (counts[n.iconType] || 0) + 1;
      }
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) return undefined;
  
  const top = sorted[0][0];
  const badgeMap: Record<string, string> = {
    py: 'Python', cpp: 'C++', js: 'JS', ts: 'TS', rs: 'Rust',
    web: 'Web', json: 'Config', config: 'Config', doc: 'Docs'
  };
  return badgeMap[top] || top;
}

function mergeTreeState(oldNodes: TreeNode[], newNodes: TreeNode[]): TreeNode[] {
  const oldNodeMap = new Map<string, TreeNode>();
  for (const node of oldNodes) oldNodeMap.set(node.name, node);

  return newNodes.map(newNode => {
    if (newNode.type === 'folder') {
      const oldNode = oldNodeMap.get(newNode.name);
      if (oldNode) {
        return {
          ...newNode,
          collapsed: oldNode.collapsed,
          children: oldNode.children && newNode.children
            ? mergeTreeState(oldNode.children, newNode.children)
            : newNode.children
        };
      }
    }
    return newNode;
  });
}

// ─── Add `collapsed: true` to all folder nodes from Rust ────────────

function addCollapseState(nodes: TreeNode[], depth = 0): TreeNode[] {
  return nodes.map(node => {
    if (node.type !== 'folder') return node;
    return {
      ...node,
      collapsed: depth > 0, // root folder expanded, rest collapsed
      children: node.children ? addCollapseState(node.children, depth + 1) : []
    };
  });
}

// ─── Context ────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    panels: isTauri ? [] : mockPanels,
    activePanelId: isTauri ? "" : "1",
    status: "✓ running",
    selectedFile: null,
    commandPaletteOpen: false,
    contextMenu: null,
    treeData: isTauri ? {} : mockTreeData,
  });
  
  useEffect(() => {
    if (!isTauri) return;
    const paths = loadSavedPaths();
    paths.forEach(async (folderPath) => {
      const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
      const id = Date.now().toString() + Math.random();
      try {
        const rawTree = await readDirectory(folderPath);
        const tree = addCollapseState(rawTree);
        const rootNode: TreeNode = { name: folderName, type: 'folder', collapsed: false, children: tree };
        const badge = detectBadge(rawTree);
        const gitInfo = await getGitInfo(folderPath);
        
        setState(prev => ({
          ...prev,
          panels: [...prev.panels, { 
            id, 
            title: folderName, 
            badge, 
            path: folderPath,
            gitBranch: gitInfo?.branch,
            gitDirty: gitInfo?.is_dirty,
            gitFiles: gitInfo?.files || [],
        }],
          treeData: { ...prev.treeData, [id]: [rootNode] },
        }));

        watchDirectory(id, folderPath).catch(console.error);
      } catch (err) {
        console.error('Failed to restore panel:', err);
      }
    });
  }, []);

  // 2. PENTRU WATCHER (Ca să știm path-ul în timp real)
  const panelsRef = useRef(state.panels);
  useEffect(() => { panelsRef.current = state.panels; }, [state.panels]);

  // 3. FILE WATCHER LISTENER (Ascultă evenimentele de la Rust)
  useEffect(() => {
    if (!isTauri) return;
    let debounceTimers: Record<string, number> = {};

    const setupListener = async () => {
      const unlisten = await listen<string>('file_changed', (event) => {
        const panelId = event.payload;
        if (debounceTimers[panelId]) clearTimeout(debounceTimers[panelId]);

        debounceTimers[panelId] = setTimeout(async () => {
          const panel = panelsRef.current.find(p => p.id === panelId);
          if (!panel || !panel.path) return;

          try {
            const rawTree = await readDirectory(panel.path);
            const newChildren = addCollapseState(rawTree);
            const gitInfo = await getGitInfo(panel.path);

            setState(prev => {
              const oldTree = prev.treeData[panelId];
              let finalRootNode: TreeNode = { 
                name: panel.title, type: 'folder', collapsed: false, children: newChildren 
              };

              if (oldTree && oldTree.length > 0 && oldTree[0].children) {
                finalRootNode = {
                  ...finalRootNode,
                  children: mergeTreeState(oldTree[0].children, newChildren)
                };
              }

              return {
                ...prev,
                treeData: { ...prev.treeData, [panelId]: [finalRootNode] },
                panels: prev.panels.map(p => p.id === panelId ? {
                  ...p, gitBranch: gitInfo?.branch, gitDirty: gitInfo?.is_dirty, gitFiles: gitInfo?.files || []
                } : p)
              };
            });
          } catch (err) {
            console.error('Watcher refresh failed:', err);
          }
        }, 500);
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupListener().then(fn => { unlistenFn = fn; });

    return () => {
      if (unlistenFn) unlistenFn();
      Object.values(debounceTimers).forEach(clearTimeout);
    };
  }, []);

  const setActivePanelId = (id: string) =>
    setState(prev => ({ ...prev, activePanelId: id }));

  const removePanel = (id: string) =>{
    if (isTauri) unwatchDirectory(id).catch(console.error);
    setState(prev => {
      const updated = prev.panels.filter(p => p.id !== id);
      savePanels(updated);
      return { ...prev, panels: updated };
  });
};


  const addPanel = async () => {
    if (isTauri) {
      const folderPath = await pickFolder();
      if (!folderPath) return;

      const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
      const id = Date.now().toString();

      try {
        const rawTree = await readDirectory(folderPath);
        const tree = addCollapseState(rawTree);
        const rootNode: TreeNode = {
          name: folderName,
          type: 'folder',
          collapsed: false,
          children: tree,
        };
        const badge = detectBadge(rawTree);
        const gitInfo = await getGitInfo(folderPath);
        
        const newPanel = { 
          id, 
          title: folderName, 
          badge, 
          path: folderPath,
          gitBranch: gitInfo?.branch,
          gitDirty: gitInfo?.is_dirty,
          gitFiles: gitInfo?.files || [],
        };

        setState(prev => {
          const updated = [...prev.panels, newPanel];
          savePanels(updated);
          return {
            ...prev,
            panels: updated,
            treeData: { ...prev.treeData, [id]: [rootNode] },
            activePanelId: id,
          };
        });
        watchDirectory(id, folderPath).catch(console.error);
      } catch (err) {
        console.error('Failed to read directory:', err);
      }
    } else {
      setState(prev => ({
        ...prev,
        panels: [...prev.panels, { id: Date.now().toString(), title: "new_panel" }],
      }));
    }
  };

  const setSelectedFile = (path: string | null) =>
    setState(prev => ({ ...prev, selectedFile: path }));

  const toggleCommandPalette = () =>
    setState(prev => ({ ...prev, commandPaletteOpen: !prev.commandPaletteOpen }));

  const openContextMenu = (x: number, y: number, targetPath: string, panelPath?: string) =>
    setState(prev => ({ ...prev, contextMenu: { x, y, targetPath, panelPath } }));

  const closeContextMenu = () =>
    setState(prev => ({ ...prev, contextMenu: null }));

  const toggleNodeCollapse = (panelId: string, nodePath: string[]) => {
    setState(prev => {
      const newTreeData = { ...prev.treeData };
      if (!newTreeData[panelId]) return prev;

      const treeClone = JSON.parse(JSON.stringify(newTreeData[panelId])) as TreeNode[];

      let currentNodes = treeClone;
      let targetNode: TreeNode | undefined;

      for (const name of nodePath) {
        targetNode = currentNodes.find(n => n.name === name);
        if (targetNode && targetNode.children) {
          currentNodes = targetNode.children;
        } else {
          break;
        }
      }

      if (targetNode && targetNode.type === 'folder') {
        targetNode.collapsed = !targetNode.collapsed;
      }

      newTreeData[panelId] = treeClone;
      return { ...prev, treeData: newTreeData };
    });
  };

  return (
    <AppContext.Provider value={{
      state, setActivePanelId, removePanel, addPanel,
      setSelectedFile, toggleCommandPalette, openContextMenu, closeContextMenu,
      toggleNodeCollapse
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}