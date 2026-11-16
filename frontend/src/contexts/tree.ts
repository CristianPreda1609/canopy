/**
 * Pure tree helpers (no React, no Tauri) so they can be unit-tested.
 *
 * Two kinds of paths are used:
 *  - name path: node names from the root, e.g. ["proj", "bert"]. Identifies a
 *    node in the (compacted) tree.
 *  - real path: actual filesystem segments, e.g. ["proj", "models", "bert"].
 *    Compacted folders hide intermediate dirs in `compactPath`, which the
 *    real path re-includes.
 */

export type TreeNode = {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  collapsed?: boolean;
  compactPath?: string;
  iconType?: string;
  /** Folder whose contents haven't been loaded yet (lazy loading). */
  unloaded?: boolean;
  /** A lazy load for this folder is in flight. */
  loading?: boolean;
};

/** "a / b / " -> ["a", "b"] */
export function compactSegments(node: TreeNode): string[] {
  return (node.compactPath ?? '').split('/').map(s => s.trim()).filter(Boolean);
}

/** Real filesystem segments of `node`, given its parent's real segments. */
export function realSegmentsOf(parentReal: string[], node: TreeNode): string[] {
  return [...parentReal, ...compactSegments(node), node.name];
}

/** Mark every folder collapsed, except at depth 0 (the panel root). */
export function addCollapseState(nodes: TreeNode[], depth = 0): TreeNode[] {
  return nodes.map(node => {
    if (node.type !== 'folder') return node;
    return {
      ...node,
      collapsed: depth > 0,
      children: node.children ? addCollapseState(node.children, depth + 1) : node.unloaded ? undefined : [],
    };
  });
}

/** Immutably replace the node at `namePath` with `fn(node)`. */
export function updateNodeAt(nodes: TreeNode[], namePath: string[], fn: (n: TreeNode) => TreeNode): TreeNode[] {
  const [head, ...rest] = namePath;
  return nodes.map(n => {
    if (n.name !== head) return n;
    if (rest.length === 0) return fn(n);
    return { ...n, children: n.children ? updateNodeAt(n.children, rest, fn) : n.children };
  });
}

export function findNode(nodes: TreeNode[], namePath: string[]): TreeNode | undefined {
  const [head, ...rest] = namePath;
  const n = nodes.find(x => x.name === head);
  if (!n || rest.length === 0) return n;
  return n.children ? findNode(n.children, rest) : undefined;
}

/** A folder that was expanded and loaded, but came back unloaded from a rescan. */
export type StaleFolder = { namePath: string[]; realPath: string[] };

/**
 * Merge a fresh scan into the existing tree, keeping UI state (collapsed).
 *
 * With lazy loading a rescan only reaches the scan depth, so folders the user
 * expanded deeper come back `unloaded`. Expanded ones keep their old children
 * for now and are reported in `stale` so the caller can re-fetch them;
 * collapsed ones simply become unloaded again and reload on next expand.
 */
export function mergeTreeState(
  oldNodes: TreeNode[],
  newNodes: TreeNode[],
  parentNames: string[] = [],
  parentReal: string[] = [],
  stale: StaleFolder[] = [],
): TreeNode[] {
  const oldByName = new Map(oldNodes.map(n => [n.name, n] as const));

  return newNodes.map(newNode => {
    const oldNode = oldByName.get(newNode.name);
    if (newNode.type !== 'folder' || !oldNode || oldNode.type !== 'folder') return newNode;

    const namePath = [...parentNames, newNode.name];
    const realPath = realSegmentsOf(parentReal, newNode);

    if (newNode.unloaded) {
      if (!oldNode.unloaded && !oldNode.collapsed && oldNode.children) {
        stale.push({ namePath, realPath });
        return { ...newNode, unloaded: false, collapsed: false, children: oldNode.children };
      }
      return { ...newNode, collapsed: true };
    }

    return {
      ...newNode,
      collapsed: oldNode.collapsed,
      children: oldNode.children && newNode.children
        ? mergeTreeState(oldNode.children, newNode.children, namePath, realPath, stale)
        : newNode.children,
    };
  });
}

const BADGES: Record<string, string> = {
  py: 'Python', cpp: 'C++', js: 'JS', ts: 'TS', rs: 'Rust',
  web: 'Web', json: 'Config', config: 'Config', doc: 'Docs',
};

/** Most common file type among loaded files, as a short badge label. */
export function detectBadge(nodes: TreeNode[]): string | undefined {
  const counts: Record<string, number> = {};
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === 'file' && n.iconType) counts[n.iconType] = (counts[n.iconType] || 0) + 1;
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  const top = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0];
  return top ? BADGES[top] || top : undefined;
}
