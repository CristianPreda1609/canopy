import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaves } from './layout.ts';
import {
  emptyWorkspaces, addPanel, removePanel, moveToWorkspace, switchWorkspace, workspaceOf,
  occupiedWorkspaces, serializeWorkspaces, restoreWorkspaces, activeLayout,
} from './workspaces.ts';

test('panels are added to the active workspace', () => {
  let ws = addPanel(emptyWorkspaces(), 'a');
  ws = addPanel(ws, 'b', 'a');
  ws = switchWorkspace(ws, 2);
  ws = addPanel(ws, 'c');
  assert.deepEqual(leaves(ws.layouts[1]), ['a', 'b']);
  assert.deepEqual(leaves(activeLayout(ws)), ['c']);
  assert.equal(workspaceOf(ws, 'b'), 1);
  assert.deepEqual(occupiedWorkspaces(ws), [1, 2]);
});

test('moveToWorkspace and removePanel', () => {
  let ws = addPanel(addPanel(emptyWorkspaces(), 'a'), 'b', 'a');
  ws = moveToWorkspace(ws, 'b', 3);
  assert.deepEqual(leaves(ws.layouts[1]), ['a']);
  assert.deepEqual(leaves(ws.layouts[3]), ['b']);
  assert.equal(ws.active, 1, 'moving a panel does not follow it');
  assert.equal(moveToWorkspace(ws, 'b', 10), ws, 'out of range is a no-op');
  ws = removePanel(ws, 'b');
  assert.deepEqual(occupiedWorkspaces(ws), [1]);
});

test('switchWorkspace clamps and leaves fullscreen', () => {
  const ws = { ...emptyWorkspaces(), fullscreen: true };
  assert.equal(switchWorkspace(ws, 0), ws);
  const two = switchWorkspace(ws, 2);
  assert.equal(two.active, 2);
  assert.equal(two.fullscreen, false);
});

test('save and restore by path, placing unknown panels on workspace 1', () => {
  let ws = addPanel(addPanel(emptyWorkspaces(), 'a'), 'b', 'a');
  ws = moveToWorkspace(ws, 'b', 2);
  ws = switchWorkspace(ws, 2);
  const paths: Record<string, string> = { a: '/x/a', b: '/x/b' };
  const saved = JSON.parse(JSON.stringify(serializeWorkspaces(ws, id => paths[id])));

  const restored = restoreWorkspaces(saved, [
    { id: 'A', path: '/x/a' }, { id: 'B', path: '/x/b' }, { id: 'N', path: '/x/new' },
  ]);
  assert.equal(restored.active, 2);
  assert.deepEqual(leaves(restored.layouts[1]), ['A', 'N']);
  assert.deepEqual(leaves(restored.layouts[2]), ['B']);

  const fromJunk = restoreWorkspaces('garbage', [{ id: 'A', path: '/x/a' }]);
  assert.deepEqual(leaves(fromJunk.layouts[1]), ['A']);
  assert.equal(fromJunk.active, 1);
});

test('balanced mode re-arranges on add, remove and move', async () => {
  const { layoutRects } = await import('./layout.ts');
  const { relayoutAll } = await import('./workspaces.ts');
  let ws = emptyWorkspaces();
  for (const id of ['a', 'b', 'c', 'd']) ws = addPanel(ws, id, undefined, 'balanced');
  const grid = layoutRects(activeLayout(ws));
  assert.ok(['a', 'b', 'c', 'd'].every(k => grid[k].w === 0.5 && grid[k].h === 0.5), '4 panels -> 2x2, nothing tiny');
  ws = removePanel(ws, 'd', 'balanced');
  assert.equal(layoutRects(activeLayout(ws)).c.w, 1, '3 panels -> last row full width');
  ws = moveToWorkspace(ws, 'c', 2, 'balanced');
  assert.deepEqual(layoutRects(ws.layouts[1]).a, { x: 0, y: 0, w: 0.5, h: 1 });
  const master = relayoutAll(ws, 'master');
  assert.equal(layoutRects(master.layouts[1]).a.w, 0.55);
});
