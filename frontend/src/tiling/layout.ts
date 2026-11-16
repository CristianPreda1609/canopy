/**
 * Hyprland-style "dwindle" tiling, as pure functions over a binary split tree.
 * No React here, so everything is unit-testable (layout.test.ts).
 *
 *   split(h): [ a | b ]      split(v): [ a ]
 *                                       [ b ]
 *
 * `ratio` is the share of the first child (a), 0..1.
 */

export type Dir = 'h' | 'v';
export type LayoutNode =
  | { type: 'leaf'; id: string }
  | { type: 'split'; dir: Dir; ratio: number; a: LayoutNode; b: LayoutNode };

export type Rect = { x: number; y: number; w: number; h: number };
export type Direction = 'left' | 'right' | 'up' | 'down';

export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;
const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

export const leaf = (id: string): LayoutNode => ({ type: 'leaf', id });

/** All leaf ids, in reading order (a before b). */
export function leaves(node: LayoutNode | null): string[] {
  if (!node) return [];
  return node.type === 'leaf' ? [node.id] : [...leaves(node.a), ...leaves(node.b)];
}

/**
 * Insert `id` by splitting the leaf `target` (dwindle). The new panel goes
 * after the target; the split is horizontal when the target is wider than
 * tall, vertical otherwise (like Hyprland's dwindle). With no target, the
 * last leaf is split.
 */
export function insert(root: LayoutNode | null, id: string, target?: string): LayoutNode {
  if (!root) return leaf(id);
  const rects = layoutRects(root);
  const ids = leaves(root);
  const at = target && ids.includes(target) ? target : ids[ids.length - 1];
  const r = rects[at];
  const dir: Dir = r.w * ASPECT >= r.h ? 'h' : 'v';
  return mapLeaf(root, at, l => ({ type: 'split', dir, ratio: 0.5, a: l, b: leaf(id) }));
}

/** The window is wider than tall; weight widths so first splits are side by side. */
const ASPECT = 16 / 10;

/** Remove a leaf; its sibling takes the parent's place. */
export function remove(root: LayoutNode | null, id: string): LayoutNode | null {
  if (!root) return null;
  if (root.type === 'leaf') return root.id === id ? null : root;
  if (root.a.type === 'leaf' && root.a.id === id) return root.b;
  if (root.b.type === 'leaf' && root.b.id === id) return root.a;
  const a = remove(root.a, id);
  const b = remove(root.b, id);
  if (a === root.a && b === root.b) return root;
  if (!a) return b;
  if (!b) return a;
  return { ...root, a, b };
}

function mapLeaf(node: LayoutNode, id: string, fn: (l: LayoutNode) => LayoutNode): LayoutNode {
  if (node.type === 'leaf') return node.id === id ? fn(node) : node;
  const a = mapLeaf(node.a, id, fn);
  const b = mapLeaf(node.b, id, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Normalized rectangles (unit square) of every leaf. */
export function layoutRects(root: LayoutNode | null, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }): Record<string, Rect> {
  if (!root) return {};
  if (root.type === 'leaf') return { [root.id]: rect };
  const [ra, rb] = splitRect(rect, root.dir, root.ratio);
  return { ...layoutRects(root.a, ra), ...layoutRects(root.b, rb) };
}

function splitRect(r: Rect, dir: Dir, ratio: number): [Rect, Rect] {
  return dir === 'h'
    ? [{ ...r, w: r.w * ratio }, { ...r, x: r.x + r.w * ratio, w: r.w * (1 - ratio) }]
    : [{ ...r, h: r.h * ratio }, { ...r, y: r.y + r.h * ratio, h: r.h * (1 - ratio) }];
}

/**
 * The nearest leaf in `direction` from `from`: it must lie beyond the
 * current edge and overlap on the other axis; ties go to the most overlap,
 * then the closest one.
 */
export function neighbor(root: LayoutNode | null, from: string, direction: Direction): string | null {
  const rects = layoutRects(root);
  const a = rects[from];
  if (!a) return null;
  const EPS = 1e-6;
  let best: { id: string; dist: number; overlap: number } | null = null;
  for (const [id, b] of Object.entries(rects)) {
    if (id === from) continue;
    let dist: number;
    let overlap: number;
    if (direction === 'left' || direction === 'right') {
      dist = direction === 'right' ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
      overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    } else {
      dist = direction === 'down' ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
      overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    }
    if (dist < -EPS || overlap <= EPS) continue;
    if (!best || dist < best.dist - EPS || (Math.abs(dist - best.dist) <= EPS && overlap > best.overlap)) {
      best = { id, dist, overlap };
    }
  }
  return best?.id ?? null;
}

/** Swap the positions of two leaves. */
export function swap(root: LayoutNode | null, x: string, y: string): LayoutNode | null {
  if (!root || x === y) return root;
  const TMP = '\u0000swap';
  let r = mapLeaf(root, x, () => leaf(TMP));
  r = mapLeaf(r, y, () => leaf(x));
  return mapLeaf(r, TMP, () => leaf(y));
}

/**
 * Keyboard resize: move the divider of the nearest ancestor split on that
 * axis in the pressed direction (right/down = divider moves right/down).
 */
export function resize(root: LayoutNode | null, id: string, direction: Direction, step = 0.05): LayoutNode | null {
  if (!root) return root;
  const axis: Dir = direction === 'left' || direction === 'right' ? 'h' : 'v';
  const delta = direction === 'right' || direction === 'down' ? step : -step;
  const path = pathTo(root, id);
  const split = path?.slice().reverse().find(p => p.dir === axis);
  return split ? mapSplit(root, split, s => ({ ...s, ratio: clampRatio(s.ratio + delta) })) : root;
}

type SplitNode = Extract<LayoutNode, { type: 'split' }>;

/** Splits from the root down to the leaf `id` (null if not found). */
function pathTo(node: LayoutNode, id: string, acc: SplitNode[] = []): SplitNode[] | null {
  if (node.type === 'leaf') return node.id === id ? acc : null;
  return pathTo(node.a, id, [...acc, node]) ?? pathTo(node.b, id, [...acc, node]);
}

function mapSplit(node: LayoutNode, target: SplitNode, fn: (s: SplitNode) => SplitNode): LayoutNode {
  if (node === target) return fn(target);
  if (node.type === 'leaf') return node;
  const a = mapSplit(node.a, target, fn);
  const b = mapSplit(node.b, target, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Set the ratio of the split at `path` (list of 'a'/'b' from the root), e.g. from a divider drag. */
export function setRatio(root: LayoutNode | null, path: ('a' | 'b')[], ratio: number): LayoutNode | null {
  if (!root || root.type === 'leaf') return root;
  if (path.length === 0) return { ...root, ratio: clampRatio(ratio) };
  const [head, ...rest] = path;
  return { ...root, [head]: setRatio(root[head], rest, ratio) } as LayoutNode;
}

/** Flip the direction of the split that directly contains `id` (Hyprland "togglesplit"). */
export function toggleSplit(root: LayoutNode | null, id: string): LayoutNode | null {
  if (!root) return root;
  const parent = pathTo(root, id)?.at(-1);
  if (!parent) return root;
  return mapSplit(root, parent, s => ({ ...s, dir: s.dir === 'h' ? 'v' : 'h' }));
}

// ─── Persistence ────────────────────────────────────────────────────
// Panel ids change every launch, so layouts are saved by folder path.

export type SavedLayout =
  | { type: 'leaf'; path: string }
  | { type: 'split'; dir: Dir; ratio: number; a: SavedLayout; b: SavedLayout };

export function serialize(node: LayoutNode | null, pathOf: (id: string) => string | undefined): SavedLayout | null {
  if (!node) return null;
  if (node.type === 'leaf') {
    const path = pathOf(node.id);
    return path ? { type: 'leaf', path } : null;
  }
  const a = serialize(node.a, pathOf);
  const b = serialize(node.b, pathOf);
  if (!a) return b;
  if (!b) return a;
  return { type: 'split', dir: node.dir, ratio: node.ratio, a, b };
}

/** Rebuild a layout from saved paths. Unknown paths are dropped. */
export function deserialize(saved: unknown, idOf: (path: string) => string | undefined): LayoutNode | null {
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Partial<SavedLayout> & Record<string, unknown>;
  if (s.type === 'leaf' && typeof s.path === 'string') {
    const id = idOf(s.path);
    return id ? leaf(id) : null;
  }
  if (s.type === 'split' && (s.dir === 'h' || s.dir === 'v') && typeof s.ratio === 'number') {
    const a = deserialize(s.a, idOf);
    const b = deserialize(s.b, idOf);
    if (!a) return b;
    if (!b) return a;
    return { type: 'split', dir: s.dir, ratio: clampRatio(s.ratio), a, b };
  }
  return null;
}
