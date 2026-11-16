import { useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { KEYMAP, matchesCombo, panelIndexFromEvent, pressedKey } from '../keymap';
import type { Direction } from '../tiling/layout';
import { visibleNodes } from '../contexts/tree';
import { targetPaths } from '../services/paths';
import { openInVSCode, openTerminal, revealInExplorer, copyToClipboard } from '../services/tauri';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Scroll the selected tree row into view after React re-renders. */
const scrollSelectionIntoView = () =>
  requestAnimationFrame(() =>
    document.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' }));

/**
 * All keyboard shortcuts in one window listener:
 *  - app shortcuts from KEYMAP (work everywhere, even in inputs)
 *  - tree navigation keys (only when no overlay is open and not typing)
 */
export function useShortcuts() {
  const ctx = useAppContext();
  // One listener for the app's lifetime; read the latest context through a ref
  const ctxRef = useRef(ctx);
  useEffect(() => { ctxRef.current = ctx; });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const c = ctxRef.current;
      const { state } = c;

      // ── App shortcuts ───────────────────────────────────────────
      const app: [keyof typeof KEYMAP, () => void][] = [
        ['palette', c.toggleCommandPalette],
        ['quickOpen', c.toggleQuickOpen],
        ['settings', c.toggleSettings],
        ['addPanel', c.addPanel],
        ['closePanel', () => { if (state.activePanelId) c.removePanel(state.activePanelId); }],
        ['toggleLayout', c.toggleSplitDir],
        ['tileFullscreen', c.toggleFullscreen],
        ['tileToggleSplit', c.toggleSplitDir],
        ['prevPanel', () => { c.cyclePanel(-1); scrollSelectionIntoView(); }],
        ['nextPanel', () => { c.cyclePanel(1); scrollSelectionIntoView(); }],
      ];
      for (const [id, action] of app) {
        if (matchesCombo(e, KEYMAP[id].combo)) {
          e.preventDefault(); // also stops WebView defaults like Ctrl+P = print
          action();
          return;
        }
      }
      // ── Tiling (Alt-based, Hyprland style) ─────────────────────────
      if (e.altKey && !e.metaKey) {
        const k = pressedKey(e);
        const dirs: Record<string, Direction> = {
          h: 'left', j: 'down', k: 'up', l: 'right',
          ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'right',
        };
        const dir = dirs[k];
        // Alt+Ctrl+Arrows: resize (arrows only, so Ctrl+Alt letter combos / AltGr stay free)
        if (e.ctrlKey && dir && k.startsWith('Arrow')) { e.preventDefault(); c.tileResize(dir); return; }
        if (!e.ctrlKey && dir) {
          e.preventDefault();
          if (e.shiftKey) c.tileSwap(dir); else c.tileFocus(dir);
          scrollSelectionIntoView();
          return;
        }
        if (!e.ctrlKey && /^[1-9]$/.test(k)) {
          e.preventDefault();
          if (e.shiftKey) c.moveToWorkspace(Number(k)); else c.switchWorkspace(Number(k));
          return;
        }
      }

      const panelIndex = panelIndexFromEvent(e);
      if (panelIndex !== null) {
        e.preventDefault();
        c.focusPanel(panelIndex);
        scrollSelectionIntoView();
        return;
      }

      // ── Tree navigation ─────────────────────────────────────────
      const overlayOpen = state.commandPaletteOpen || state.settingsOpen || state.quickOpenOpen || state.contextMenu;
      if (overlayOpen || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      const panel = state.panels.find(p => p.id === state.activePanelId);
      const tree = panel && state.treeData[panel.id];
      if (!panel || !tree) return;

      const rows = visibleNodes(tree);
      if (rows.length === 0) return;
      const sel = state.selection?.panelId === panel.id ? state.selection : null;
      const cur = sel ? rows.findIndex(r => r.realPath.join('/') === sel.path) : -1;
      const row = cur >= 0 ? rows[cur] : undefined;

      const select = (i: number) => {
        const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
        c.setSelection({ panelId: panel.id, path: r.realPath.join('/'), namePath: r.namePath, isFolder: r.node.type === 'folder' });
        scrollSelectionIntoView();
      };
      const targets = () => panel.path && row
        ? targetPaths(panel.path, row.realPath.join('/'), row.node.type === 'folder')
        : null;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let handled = true;

      // No selection yet: any navigation key selects the first row
      if (!row && ['ArrowDown', 'ArrowUp', 'j', 'k', 'Home', 'End', 'ArrowRight', 'ArrowLeft', 'l', 'h'].includes(key)) {
        select(key === 'End' ? rows.length - 1 : 0);
        e.preventDefault();
        return;
      }
      if (!row) return;
      const isFolder = row.node.type === 'folder';

      switch (key) {
        case 'ArrowDown': case 'j': select(cur + 1); break;
        case 'ArrowUp': case 'k': select(cur - 1); break;
        case 'Home': select(0); break;
        case 'End': select(rows.length - 1); break;
        case 'ArrowRight': case 'l':
          if (isFolder && row.node.collapsed) c.toggleNodeCollapse(panel.id, row.namePath, row.realPath);
          else if (isFolder && rows[cur + 1]?.depth > row.depth) select(cur + 1);
          break;
        case 'ArrowLeft': case 'h':
          if (isFolder && !row.node.collapsed && row.depth > 0) {
            c.toggleNodeCollapse(panel.id, row.namePath, row.realPath);
          } else {
            const parent = rows.findIndex(r => r.namePath.join('\u0000') === row.namePath.slice(0, -1).join('\u0000'));
            if (parent >= 0) select(parent);
          }
          break;
        case 'Enter': case ' ':
          if (isFolder) c.toggleNodeCollapse(panel.id, row.namePath, row.realPath);
          else { const t = targets(); if (t) openInVSCode(t.full).catch(console.error); }
          break;
        case 'y': { const t = targets(); if (t) copyToClipboard(t.full).catch(console.error); break; }
        case 't': { const t = targets(); if (t) openTerminal(t.folder).catch(console.error); break; }
        case 'e': { const t = targets(); if (t) revealInExplorer(t.full).catch(console.error); break; }
        default: handled = false;
      }
      if (handled) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
