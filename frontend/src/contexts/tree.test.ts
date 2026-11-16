import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCollapseState, mergeTreeState, updateNodeAt, findNode, realSegmentsOf, detectBadge,
  type TreeNode, type StaleFolder,
} from './tree.ts';

test('realSegmentsOf includes compacted folders', () => {
  const node: TreeNode = { name: 'd', type: 'folder', compactPath: 'a / b / c / ' };
  assert.deepEqual(realSegmentsOf(['root'], node), ['root', 'a', 'b', 'c', 'd']);
  assert.deepEqual(realSegmentsOf(['root'], { name: 'x', type: 'file' }), ['root', 'x']);
});

test('addCollapseState keeps unloaded folders without children', () => {
  const out = addCollapseState([
    { name: 'src', type: 'folder', children: [{ name: 'lib', type: 'folder', unloaded: true }] },
  ]);
  assert.equal(out[0].collapsed, false);
  assert.equal(out[0].children![0].collapsed, true);
  assert.equal(out[0].children![0].children, undefined);
});

test('updateNodeAt / findNode work on name paths', () => {
  const tree: TreeNode[] = [{ name: 'r', type: 'folder', children: [{ name: 'a', type: 'folder', children: [] }] }];
  const updated = updateNodeAt(tree, ['r', 'a'], n => ({ ...n, collapsed: true }));
  assert.equal(findNode(updated, ['r', 'a'])!.collapsed, true);
  assert.equal(findNode(tree, ['r', 'a'])!.collapsed, undefined, 'original untouched');
});

test('mergeTreeState keeps collapse state', () => {
  const old: TreeNode[] = [{ name: 'a', type: 'folder', collapsed: false, children: [] }];
  const fresh: TreeNode[] = [{ name: 'a', type: 'folder', collapsed: true, children: [{ name: 'f', type: 'file' }] }];
  const merged = mergeTreeState(old, fresh);
  assert.equal(merged[0].collapsed, false);
  assert.equal(merged[0].children!.length, 1);
});

test('mergeTreeState reports expanded folders that came back unloaded', () => {
  const old: TreeNode[] = [{
    name: 'deep', type: 'folder', compactPath: 'src / ', collapsed: false,
    children: [{ name: 'x.ts', type: 'file' }],
  }];
  const fresh: TreeNode[] = [{ name: 'deep', type: 'folder', compactPath: 'src / ', unloaded: true, collapsed: true }];
  const stale: StaleFolder[] = [];
  const merged = mergeTreeState(old, fresh, ['root'], ['root'], stale);
  assert.equal(merged[0].unloaded, false);
  assert.equal(merged[0].children!.length, 1, 'old children kept until re-fetch');
  assert.deepEqual(stale, [{ namePath: ['root', 'deep'], realPath: ['root', 'src', 'deep'] }]);
});

test('mergeTreeState lets collapsed folders go back to unloaded', () => {
  const old: TreeNode[] = [{ name: 'lib', type: 'folder', collapsed: true, children: [{ name: 'a', type: 'file' }] }];
  const fresh: TreeNode[] = [{ name: 'lib', type: 'folder', unloaded: true }];
  const stale: StaleFolder[] = [];
  const merged = mergeTreeState(old, fresh, [], [], stale);
  assert.equal(merged[0].unloaded, true);
  assert.equal(stale.length, 0);
});

test('detectBadge picks the most common file type', () => {
  assert.equal(detectBadge([
    { name: 'a.py', type: 'file', iconType: 'py' },
    { name: 'b.py', type: 'file', iconType: 'py' },
    { name: 'c.rs', type: 'file', iconType: 'rs' },
  ]), 'Python');
  assert.equal(detectBadge([]), undefined);
});

test('visibleNodes lists only expanded rows, in display order', async () => {
  const { visibleNodes } = await import('./tree.ts');
  const tree: TreeNode[] = [{
    name: 'root', type: 'folder', collapsed: false, children: [
      { name: 'b', type: 'folder', compactPath: 'a / ', collapsed: false, children: [{ name: 'x.ts', type: 'file' }] },
      { name: 'closed', type: 'folder', collapsed: true, children: [{ name: 'hidden.ts', type: 'file' }] },
      { name: 'z.md', type: 'file' },
    ],
  }];
  const rows = visibleNodes(tree);
  assert.deepEqual(rows.map(r => r.realPath.join('/')), ['root', 'root/a/b', 'root/a/b/x.ts', 'root/closed', 'root/z.md']);
  assert.deepEqual(rows[2].namePath, ['root', 'b', 'x.ts']);
  assert.equal(rows[2].depth, 2);
});
