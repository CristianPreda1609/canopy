import { createContext, useState, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  pickFolder, readDirectory, isTauri, getGitInfo, watchDirectory, unwatchDirectory, checkForUpdate, setBackgroundOptions,
  type ScanOptions, type AvailableUpdate,
} from "../services/tauri";
import { resolveTreePath } from "../services/paths";
import { listen } from "@tauri-apps/api/event";
import {
  addCollapseState, mergeTreeState, detectBadge, updateNodeAt, findNode,
  type TreeNode, type StaleFolder,
} from "./tree";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { comboFor } from "../keymap";

export type { TreeNode } from "./tree";

const STORAGE_KEY = 'canopy_panels';
const LAYOUT_KEY = 'canopy_layout';

export type Layout = 'grid' | 'row';

function loadLayout(): Layout {
  try { return localStorage.getItem(LAYOUT_KEY) === 'row' ? 'row' : 'grid'; } catch { return 'grid'; }
}

function savePanels(panels: PanelItem[]) {
  const paths = panels.map(p => p.path).filter(Boolean);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(paths)); } catch { /* storage unavailable */ }
}

function loadSavedPaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

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
  isFolder?: boolean;
} | null;

/** The highlighted tree row. `path` is the real tree path ("<root>/a/b.ts"). */
export type Selection = {
  panelId: string;
  path: string;
  namePath: string[];
  isFolder: boolean;
} | null;

/** Auto-update status shown in the status bar. */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'installing'; version: string; progress: number | null }
  | { status: 'error'; message: string };

export type SettingsTab = 'general' | 'git' | 'shortcuts';

export type AppState = {
  panels: PanelItem[];
  activePanelId: string;
  status: string;
  selection: Selection;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  quickOpenOpen: boolean;
  contextMenu: ContextMenuState;
  treeData: Record<string, TreeNode[]>;
  layout: Layout;
  settings: Settings;
  update: UpdateState;
  /** Short message for the status bar (e.g. a shortcut that couldn't be registered) */
  notice: string | null;
};

type AppContextType = {
  state: AppState;
  setActivePanelId: (id: string) => void;
  removePanel: (id: string) => void;
  addPanel: () => void;
  setSelection: (sel: Selection) => void;
  toggleCommandPalette: () => void;
  /** Open/close settings. With a tab: open on that tab (switching tabs if already open). */
  toggleSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  toggleQuickOpen: () => void;
  /** Focus the panel at `index` (0-based); also moves the selection there. */
  focusPanel: (index: number) => void;
  /** Focus the next (+1) or previous (-1) panel, wrapping around. */
  cyclePanel: (delta: number) => void;
  updateSettings: (s: Settings) => void;
  openContextMenu: (x: number, y: number, targetPath: string, panelPath?: string, isFolder?: boolean) => void;
  closeContextMenu: () => void;
  /** `namePath` locates the node; `realPath` is its real filesystem path (for lazy loading). */
  toggleNodeCollapse: (panelId: string, namePath: string[], realPath: string[]) => void;
  toggleLayout: () => void;
  /** `manual`: report "up to date" / errors in the status bar (startup checks stay quiet). */
  checkUpdates: (manual: boolean) => void;
  installUpdate: () => void;
};

// ─── Mock data (used when running in browser without Tauri) ─────────

const f = (name: string, iconType?: string): TreeNode => ({ name, type: 'file', iconType });
const dir = (name: string, children: TreeNode[], opts: Partial<TreeNode> = {}): TreeNode =>
  ({ name, type: 'folder', collapsed: true, children, ...opts });

/** Made-up demo projects for browser mode (UI work, screenshots). Never real data. */
const mockTreeData: Record<string, TreeNode[]> = {
  "1": [dir("ml-thesis", [
    dir("bert_finetune", [f("bert_finetune.py", "py"), f("train.py", "py"), f("eval.py", "py")],
      { compactPath: "models / ", collapsed: false }),
    dir("notebooks", [f("explore.ipynb"), f("results.ipynb")], { collapsed: false }),
    dir("configs", [f("default.yaml", "config"), f("sweep.yaml", "config")]),
    dir("data", [], { unloaded: true, children: undefined }),
    f("README.md", "doc"), f("requirements.txt", "doc"),
  ], { collapsed: false })],
  "2": [dir("firmware", [
    dir("src", [f("main.cpp", "cpp"), f("sensors.cpp", "cpp"), f("sensors.h", "cpp"), f("radio.cpp", "cpp")], { collapsed: false }),
    dir("include", [f("config.h", "cpp"), f("pins.h", "cpp")]),
    dir("lib", [], { unloaded: true, children: undefined }),
    f("platformio.ini", "config"), f("CMakeLists.txt", "doc"),
  ], { collapsed: false })],
  "3": [dir("web-dashboard", [
    dir("components", [f("App.tsx", "ts"), f("Chart.tsx", "ts"), f("Sidebar.tsx", "ts"), f("StatCard.tsx", "ts")],
      { compactPath: "src / ", collapsed: false }),
    dir("node_modules", [], { unloaded: true, children: undefined }),
    dir("public", [f("favicon.svg"), f("logo.png")]),
    f("index.html", "web"), f("package.json", "json"), f("tsconfig.json", "json"), f("vite.config.ts", "ts"),
  ], { collapsed: false })],
};

const mockPanels: PanelItem[] = [
  // Fake paths so path-based UI (Go to file, context menu) works in browser mode
  {
    id: "1", title: "ml-thesis", badge: "Python", path: "/demo/ml-thesis", gitBranch: "main", gitDirty: true,
    gitFiles: [
      { path: "models/bert_finetune/train.py", status: "modified" },
      { path: "models/bert_finetune/eval.py", status: "staged" },
      { path: "notebooks/results.ipynb", status: "untracked" },
      { path: "requirements.txt", status: "modified" },
    ],
  },
  {
    id: "2", title: "firmware", badge: "C++", path: "/demo/firmware", gitBranch: "feature/lora", gitDirty: true,
    gitFiles: [
      { path: "src/radio.cpp", status: "conflict" },
      { path: "src/sensors.cpp", status: "staged" },
    ],
  },
  { id: "3", title: "web-dashboard", badge: "TS", path: "/demo/web-dashboard", gitBranch: "main", gitDirty: false, gitFiles: [] },
];

// ─── Helpers ────────────────────────────────────────────────────────

const folderNameOf = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() || p;

const scanOptions = (s: Settings): ScanOptions => ({
  depth: s.scanDepth, showHidden: s.showHidden, skipDirs: s.skipDirs,
});

const gitFields = (g: GitStatus | null) => ({
  gitBranch: g?.branch, gitDirty: g?.is_dirty, gitFiles: g?.files || [],
});

/** Scan a folder and build its panel + root tree node. */
async function loadPanel(folderPath: string, id: string, settings: Settings) {
  const folderName = folderNameOf(folderPath);
  const rawTree = await readDirectory(folderPath, scanOptions(settings));
  const rootNode: TreeNode = {
    name: folderName, type: 'folder', collapsed: false, children: addCollapseState(rawTree, 1),
  };
  const panel: PanelItem = {
    id, title: folderName, badge: detectBadge(rawTree), path: folderPath,
    ...gitFields(await getGitInfo(folderPath)),
  };
  return { panel, rootNode };
}

// ─── Context ────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    panels: isTauri ? [] : mockPanels,
    activePanelId: isTauri ? "" : "1",
    status: "✓ running",
    selection: null,
    commandPaletteOpen: false,
    settingsOpen: false,
    settingsTab: 'general',
    quickOpenOpen: false,
    contextMenu: null,
    treeData: isTauri ? {} : mockTreeData,
    layout: loadLayout(),
    settings: loadSettings(),
    update: { status: 'idle' },
    notice: null,
  });

  // Refs so async callbacks (watcher events, lazy loads) see current values
  const panelsRef = useRef(state.panels);
  const settingsRef = useRef(state.settings);
  useEffect(() => { panelsRef.current = state.panels; }, [state.panels]);
  useEffect(() => { settingsRef.current = state.settings; }, [state.settings]);

  /** Load one folder's contents into the node at `namePath`. */
  const fetchInto = async (panelId: string, panelPath: string, namePath: string[], realPath: string[]) => {
    const abs = resolveTreePath(panelPath, realPath.join('/'));
    let children: TreeNode[];
    try {
      children = addCollapseState(await readDirectory(abs, scanOptions(settingsRef.current)), 1);
    } catch (err) {
      console.error('Failed to load folder:', abs, err);
      children = [];
    }
    const stale: StaleFolder[] = [];
    setState(prev => {
      const tree = prev.treeData[panelId];
      if (!tree) return prev;
      return {
        ...prev,
        treeData: {
          ...prev.treeData,
          [panelId]: updateNodeAt(tree, namePath, n => ({
            ...n,
            unloaded: false,
            loading: false,
            // On a refresh the folder already has children: keep their expand state
            children: n.children ? mergeTreeState(n.children, children, namePath, realPath, stale) : children,
          })),
        },
      };
    });
    return stale;
  };

  /** Rescan a panel (after a file change or a settings change), keeping expand state. */
  const refreshPanel = async (panelId: string) => {
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel?.path) return;
    const rootName = panel.title;
    try {
      const rawTree = await readDirectory(panel.path, scanOptions(settingsRef.current));
      const freshChildren = addCollapseState(rawTree, 1);
      const gitInfo = await getGitInfo(panel.path);
      const stale: StaleFolder[] = [];

      setState(prev => {
        const old = prev.treeData[panelId]?.[0];
        const children = old?.children
          ? mergeTreeState(old.children, freshChildren, [rootName], [rootName], stale)
          : freshChildren;
        return {
          ...prev,
          treeData: { ...prev.treeData, [panelId]: [{ name: rootName, type: 'folder', collapsed: false, children }] },
          panels: prev.panels.map(p => p.id === panelId ? { ...p, ...gitFields(gitInfo) } : p),
        };
      });

      // Expanded folders deeper than the scan depth: re-fetch them (and theirs)
      const queue = [...stale];
      while (queue.length) {
        const { namePath, realPath } = queue.shift()!;
        queue.push(...await fetchInto(panelId, panel.path, namePath, realPath));
      }
    } catch (err) {
      console.error('Refresh failed:', panel.path, err);
    }
  };

  // Restore saved panels, in their saved order. Folders that no longer exist are skipped.
  useEffect(() => {
    if (!isTauri) return;
    const restore = async () => {
      const results = await Promise.all(loadSavedPaths().map((folderPath, i) =>
        loadPanel(folderPath, `${Date.now()}-${i}`, settingsRef.current).catch(err => {
          console.error('Failed to restore panel:', folderPath, err);
          return null;
        })
      ));
      const restored = results.filter((r): r is NonNullable<typeof r> => r !== null);
      setState(prev => ({
        ...prev,
        panels: [...prev.panels, ...restored.map(r => r.panel)],
        treeData: { ...prev.treeData, ...Object.fromEntries(restored.map(r => [r.panel.id, [r.rootNode]])) },
        activePanelId: prev.activePanelId || restored[0]?.panel.id || "",
      }));
      restored.forEach(r => watchDirectory(r.panel.id, r.panel.path!).catch(console.error));
    };
    restore();
  }, []);

  // File watcher: Rust emits `file_changed` with the panel id; debounce, then rescan
  const refreshRef = useRef(refreshPanel);
  useEffect(() => { refreshRef.current = refreshPanel; });
  useEffect(() => {
    if (!isTauri) return;
    const debounceTimers: Record<string, number> = {};
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<string>('file_changed', (event) => {
      const panelId = event.payload;
      clearTimeout(debounceTimers[panelId]);
      debounceTimers[panelId] = setTimeout(() => refreshRef.current(panelId), 500);
    }).then(fn => {
      // If we unmounted before the listener was ready, drop it right away
      if (cancelled) fn(); else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      Object.values(debounceTimers).forEach(clearTimeout);
    };
  }, []);

  // ─── Notices ──────────────────────────────────────────────────────
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = (notice: string) => {
    setState(prev => ({ ...prev, notice }));
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setState(prev => ({ ...prev, notice: null })), 8000);
  };

  // ─── Background mode (tray, window mode, summon shortcut, start at login) ──
  const bg = state.settings.background;
  const summonCombo = comboFor('summon', state.settings.keybindings);
  useEffect(() => {
    if (!isTauri) return;
    setBackgroundOptions({
      closeToTray: bg.closeToTray,
      windowMode: bg.windowMode,
      summonShortcut: summonCombo,
      launchAtLogin: bg.launchAtLogin,
    }).catch(err => showNotice(String(err)));
  }, [bg.closeToTray, bg.windowMode, bg.launchAtLogin, summonCombo]);

  // ─── Auto-update ──────────────────────────────────────────────────
  const pendingUpdate = useRef<AvailableUpdate | null>(null);
  const setUpdate = (update: UpdateState) => setState(prev => ({ ...prev, update }));
  const clearUpdateStatusLater = (status: UpdateState['status']) =>
    setTimeout(() => setState(prev => prev.update.status === status ? { ...prev, update: { status: 'idle' } } : prev), 4000);

  const checkUpdates = async (manual: boolean) => {
    if (!isTauri) {
      if (manual) { setUpdate({ status: 'up-to-date' }); clearUpdateStatusLater('up-to-date'); }
      return;
    }
    if (manual) setUpdate({ status: 'checking' });
    try {
      const update = await checkForUpdate();
      pendingUpdate.current = update;
      if (update) {
        setUpdate({ status: 'available', version: update.version });
      } else if (manual) {
        setUpdate({ status: 'up-to-date' });
        clearUpdateStatusLater('up-to-date');
      }
    } catch (err) {
      // Normal before the first signed release exists, or when offline
      console.warn('Update check failed:', err);
      if (manual) {
        setUpdate({ status: 'error', message: 'Update check failed' });
        clearUpdateStatusLater('error');
      }
    }
  };

  const installUpdate = async () => {
    const update = pendingUpdate.current;
    if (!update) return;
    setUpdate({ status: 'installing', version: update.version, progress: null });
    try {
      await update.install(progress =>
        setUpdate({ status: 'installing', version: update.version, progress }));
      // relaunch() restarts the app; nothing runs after this on success
    } catch (err) {
      console.error('Update install failed:', err);
      setUpdate({ status: 'error', message: 'Update failed' });
      clearUpdateStatusLater('error');
    }
  };

  // Quiet check shortly after startup, so it doesn't compete with panel loading
  const checkUpdatesRef = useRef(checkUpdates);
  useEffect(() => { checkUpdatesRef.current = checkUpdates; });
  useEffect(() => {
    if (!isTauri) return;
    const t = setTimeout(() => checkUpdatesRef.current(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const setActivePanelId = (id: string) =>
    setState(prev => ({ ...prev, activePanelId: id }));

  const removePanel = (id: string) => {
    if (isTauri) unwatchDirectory(id).catch(console.error);
    setState(prev => {
      const updated = prev.panels.filter(p => p.id !== id);
      savePanels(updated);
      const treeData = { ...prev.treeData };
      delete treeData[id];
      return {
        ...prev,
        panels: updated,
        treeData,
        activePanelId: prev.activePanelId === id ? (updated[0]?.id ?? "") : prev.activePanelId,
        selection: prev.selection?.panelId === id ? null : prev.selection,
      };
    });
  };

  const addPanel = async () => {
    if (!isTauri) {
      setState(prev => ({ ...prev, panels: [...prev.panels, { id: Date.now().toString(), title: "new_panel" }] }));
      return;
    }
    const folderPath = await pickFolder();
    if (!folderPath) return;
    const id = Date.now().toString();
    try {
      const { panel, rootNode } = await loadPanel(folderPath, id, settingsRef.current);
      setState(prev => {
        const updated = [...prev.panels, panel];
        savePanels(updated);
        return { ...prev, panels: updated, treeData: { ...prev.treeData, [id]: [rootNode] }, activePanelId: id };
      });
      watchDirectory(id, folderPath).catch(console.error);
    } catch (err) {
      console.error('Failed to read directory:', err);
    }
  };

  const toggleLayout = () =>
    setState(prev => {
      const layout: Layout = prev.layout === 'grid' ? 'row' : 'grid';
      try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* ignore */ }
      return { ...prev, layout };
    });

  const setSelection = (selection: Selection) =>
    setState(prev => ({
      ...prev,
      selection,
      activePanelId: selection?.panelId ?? prev.activePanelId,
    }));

  /** Only one overlay (palette, settings, quick open) is open at a time. */
  const NO_OVERLAYS = { commandPaletteOpen: false, settingsOpen: false, quickOpenOpen: false };

  const toggleCommandPalette = () =>
    setState(prev => ({ ...prev, ...NO_OVERLAYS, commandPaletteOpen: !prev.commandPaletteOpen }));

  const toggleSettings = (tab?: SettingsTab) =>
    setState(prev => {
      if (tab && prev.settingsOpen && prev.settingsTab !== tab) return { ...prev, settingsTab: tab };
      return { ...prev, ...NO_OVERLAYS, settingsOpen: !prev.settingsOpen, settingsTab: tab ?? 'general' };
    });

  const setSettingsTab = (settingsTab: SettingsTab) => setState(prev => ({ ...prev, settingsTab }));

  const toggleQuickOpen = () =>
    setState(prev => ({ ...prev, ...NO_OVERLAYS, quickOpenOpen: !prev.quickOpenOpen }));

  const focusPanelById = (prev: AppState, panelId: string): AppState => {
    if (prev.selection?.panelId === panelId) return { ...prev, activePanelId: panelId };
    const root = prev.treeData[panelId]?.[0];
    return {
      ...prev,
      activePanelId: panelId,
      selection: root ? { panelId, path: root.name, namePath: [root.name], isFolder: true } : null,
    };
  };

  const focusPanel = (index: number) =>
    setState(prev => {
      const panel = prev.panels[index];
      return panel ? focusPanelById(prev, panel.id) : prev;
    });

  const cyclePanel = (delta: number) =>
    setState(prev => {
      if (prev.panels.length === 0) return prev;
      const cur = Math.max(0, prev.panels.findIndex(p => p.id === prev.activePanelId));
      const next = (cur + delta + prev.panels.length) % prev.panels.length;
      return focusPanelById(prev, prev.panels[next].id);
    });

  /** Save settings and rescan every panel with them. */
  const updateSettings = (next: Settings) => {
    const prev = settingsRef.current;
    saveSettings(next);
    settingsRef.current = next;
    setState(s => ({ ...s, settings: next }));
    // Only scan settings require rescanning (colors / shortcuts don't)
    const rescan = prev.scanDepth !== next.scanDepth || prev.showHidden !== next.showHidden
      || JSON.stringify(prev.skipDirs) !== JSON.stringify(next.skipDirs);
    if (rescan) panelsRef.current.forEach(p => refreshPanel(p.id));
  };

  const openContextMenu = (x: number, y: number, targetPath: string, panelPath?: string, isFolder?: boolean) =>
    setState(prev => ({ ...prev, contextMenu: { x, y, targetPath, panelPath, isFolder } }));

  const closeContextMenu = () =>
    setState(prev => ({ ...prev, contextMenu: null }));

  /**
   * Expand/collapse a folder. Expanding an `unloaded` folder fetches its
   * contents first (lazy loading).
   */
  const toggleNodeCollapse = (panelId: string, namePath: string[], realPath: string[]) => {
    const tree = state.treeData[panelId];
    const node = tree && findNode(tree, namePath);
    if (!node || node.type !== 'folder' || node.loading) return;

    const panelPath = state.panels.find(p => p.id === panelId)?.path;
    if (node.unloaded && node.collapsed && panelPath) {
      setState(prev => ({
        ...prev,
        treeData: {
          ...prev.treeData,
          [panelId]: updateNodeAt(prev.treeData[panelId], namePath, n => ({ ...n, collapsed: false, loading: true })),
        },
      }));
      fetchInto(panelId, panelPath, namePath, realPath);
      return;
    }

    setState(prev => ({
      ...prev,
      treeData: {
        ...prev.treeData,
        [panelId]: updateNodeAt(prev.treeData[panelId], namePath, n => ({ ...n, collapsed: !n.collapsed })),
      },
    }));
  };

  return (
    <AppContext.Provider value={{
      state, setActivePanelId, removePanel, addPanel,
      setSelection, toggleCommandPalette, toggleSettings, setSettingsTab, toggleQuickOpen, updateSettings,
      focusPanel, cyclePanel,
      openContextMenu, closeContextMenu, toggleNodeCollapse, toggleLayout,
      checkUpdates, installUpdate,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook lives next to its provider on purpose; only affects HMR granularity.
// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
