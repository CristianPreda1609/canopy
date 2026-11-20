/**
 * Workspaces 1–9, each with its own tiling layout (Hyprland style).
 * Pure functions; tested in workspaces.test.ts.
 */
import {
  insert, remove, leaves, serialize, deserialize, relayout,
  type LayoutNode, type SavedLayout, type LayoutMode,
} from './layout.ts';

export const WORKSPACE_COUNT = 9;

export type Workspaces = {
  /** 1-based active workspace */
  active: number;
  layouts: Record<number, LayoutNode | null>;
  /** Focused panel shown alone ("monocle") */
  fullscreen: boolean;
  /** How panels are arranged (applies to every workspace) */
  mode: LayoutMode;
};

export const emptyWorkspaces = (): Workspaces => ({ active: 1, layouts: {}, fullscreen: false, mode: 'balanced' });

export const activeLayout = (ws: Workspaces): LayoutNode | null => ws.layouts[ws.active] ?? null;

/** Workspace number containing panel `id`, or null. */
export function workspaceOf(ws: Workspaces, id: string): number | null {
  for (const [n, layout] of Object.entries(ws.layouts)) {
    if (leaves(layout).includes(id)) return Number(n);
  }
  return null;
}

/** Add a new panel to the active workspace (after the focused one), then lay out for `mode`. */
export function addPanel(ws: Workspaces, id: string, focusedId?: string, mode: LayoutMode = ws.mode): Workspaces {
  return {
    ...ws,
    fullscreen: false,
    layouts: { ...ws.layouts, [ws.active]: relayout(insert(activeLayout(ws), id, focusedId), mode) },
  };
}

/** Remove a panel from whichever workspace has it, then lay out for `mode`. */
export function removePanel(ws: Workspaces, id: string, mode: LayoutMode = ws.mode): Workspaces {
  const n = workspaceOf(ws, id);
  if (n === null) return ws;
  return { ...ws, layouts: { ...ws.layouts, [n]: relayout(remove(ws.layouts[n], id), mode) } };
}

/** Switch layout mode and re-arrange every workspace for it. */
export function relayoutAll(ws: Workspaces, mode: LayoutMode): Workspaces {
  const layouts: Record<number, LayoutNode | null> = {};
  for (const [n, layout] of Object.entries(ws.layouts)) layouts[Number(n)] = relayout(layout, mode);
  return { ...ws, layouts, mode };
}

/** Send a panel to workspace `n` (appended there). Stays on the current workspace. */
export function moveToWorkspace(ws: Workspaces, id: string, n: number, mode: LayoutMode = ws.mode): Workspaces {
  const from = workspaceOf(ws, id);
  if (from === null || from === n || n < 1 || n > WORKSPACE_COUNT) return ws;
  const without = removePanel(ws, id, mode);
  return { ...without, layouts: { ...without.layouts, [n]: relayout(insert(without.layouts[n] ?? null, id), mode) } };
}

export function switchWorkspace(ws: Workspaces, n: number): Workspaces {
  if (n < 1 || n > WORKSPACE_COUNT || n === ws.active) return ws;
  return { ...ws, active: n, fullscreen: false };
}

/** Workspaces that have at least one panel (for the indicator). */
export function occupiedWorkspaces(ws: Workspaces): number[] {
  return Object.entries(ws.layouts).filter(([, l]) => l).map(([n]) => Number(n)).sort((a, b) => a - b);
}

/** Replace the active workspace's layout (resize, swap, …). */
export const withActiveLayout = (ws: Workspaces, layout: LayoutNode | null): Workspaces =>
  ({ ...ws, layouts: { ...ws.layouts, [ws.active]: layout } });

// ─── Persistence (by folder path) ───────────────────────────────────

export type SavedWorkspaces = { active: number; layouts: Record<number, SavedLayout>; mode?: LayoutMode };

export function serializeWorkspaces(ws: Workspaces, pathOf: (id: string) => string | undefined): SavedWorkspaces {
  const layouts: Record<number, SavedLayout> = {};
  for (const [n, layout] of Object.entries(ws.layouts)) {
    const saved = serialize(layout, pathOf);
    if (saved) layouts[Number(n)] = saved;
  }
  return { active: ws.active, layouts, mode: ws.mode };
}

/**
 * Rebuild workspaces after panels were restored with fresh ids. Panels that
 * aren't in any saved layout (new, or saved by an older version) go to
 * workspace 1.
 */
export function restoreWorkspaces(saved: unknown, panels: { id: string; path?: string }[]): Workspaces {
  const byPath = new Map(panels.filter(p => p.path).map(p => [p.path!, p.id]));
  const ws = emptyWorkspaces();
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<SavedWorkspaces>;
  if (s.layouts && typeof s.layouts === 'object') {
    for (const [n, layout] of Object.entries(s.layouts)) {
      const num = Number(n);
      if (num >= 1 && num <= WORKSPACE_COUNT) ws.layouts[num] = deserialize(layout, p => byPath.get(p));
    }
  }
  if (s.mode === 'balanced' || s.mode === 'master' || s.mode === 'dwindle') ws.mode = s.mode;
  const placed = new Set(Object.values(ws.layouts).flatMap(l => leaves(l)));
  const unplaced = panels.filter(p => !placed.has(p.id));
  for (const p of unplaced) ws.layouts[1] = insert(ws.layouts[1] ?? null, p.id);
  // Saved layouts keep their (possibly resized) shape; only re-arrange where panels were added
  if (unplaced.length) ws.layouts[1] = relayout(ws.layouts[1] ?? null, ws.mode);
  const active = Number(s.active);
  ws.active = active >= 1 && active <= WORKSPACE_COUNT ? active : 1;
  return ws;
}
