import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  insert, remove, leaves, layoutRects, neighbor, swap, resize, setRatio, toggleSplit,
  serialize, deserialize, leaf, type LayoutNode,
} from './layout.ts';

/** a | b, with c under b:   [ a | b ]
 *                           [   | c ] */
const abc = (): LayoutNode => insert(insert(insert(null, 'a'), 'b', 'a'), 'c', 'b');

test('dwindle: first split is side by side, then the right half splits vertically', () => {
  const t = abc();
  assert.deepEqual(leaves(t), ['a', 'b', 'c']);
  const r = layoutRects(t);
  assert.deepEqual(r.a, { x: 0, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(r.b, { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  assert.deepEqual(r.c, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
});

test('insert without a target splits the last leaf', () => {
  assert.deepEqual(leaves(insert(abc(), 'd')), ['a', 'b', 'c', 'd']);
});

test('remove lets the sibling take the space', () => {
  const t = remove(abc(), 'b')!;
  assert.deepEqual(leaves(t), ['a', 'c']);
  assert.deepEqual(layoutRects(t).c, { x: 0.5, y: 0, w: 0.5, h: 1 });
  assert.equal(remove(leaf('x'), 'x'), null);
  const t0 = abc();
  assert.equal(remove(t0, 'nope'), t0, 'unknown id returns the same tree');
});

test('neighbor follows screen geometry', () => {
  const t = abc();
  assert.equal(neighbor(t, 'a', 'right'), 'b', 'tie on distance goes to first by overlap order');
  assert.equal(neighbor(t, 'c', 'left'), 'a');
  assert.equal(neighbor(t, 'b', 'down'), 'c');
  assert.equal(neighbor(t, 'c', 'up'), 'b');
  assert.equal(neighbor(t, 'a', 'left'), null);
  assert.equal(neighbor(t, 'b', 'up'), null);
});

test('swap exchanges positions', () => {
  const t = swap(abc(), 'a', 'c')!;
  assert.deepEqual(leaves(t), ['c', 'b', 'a']);
  assert.deepEqual(layoutRects(t).c, { x: 0, y: 0, w: 0.5, h: 1 });
});

test('resize moves the nearest divider on that axis, clamped', () => {
  let t = resize(abc(), 'c', 'up')!;               // b/c divider moves up
  assert.equal(layoutRects(t).c.h.toFixed(2), '0.55');
  t = resize(t, 'c', 'left')!;                      // a | (b,c) divider moves left
  assert.equal(layoutRects(t).a.w.toFixed(2), '0.45');
  for (let i = 0; i < 30; i++) t = resize(t, 'a', 'left')!;
  assert.equal(layoutRects(t).a.w.toFixed(2), '0.15', 'clamped to MIN_RATIO');
  const solo = leaf('solo');
  assert.equal(resize(solo, 'solo', 'left'), solo, 'no split to move');
});

test('setRatio by path and toggleSplit', () => {
  const t = setRatio(abc(), ['b'], 0.3)!;
  assert.equal(layoutRects(t).b.h.toFixed(2), '0.30', 'b/c split spans the full height');
  const flipped = toggleSplit(abc(), 'c')!;
  assert.deepEqual(layoutRects(flipped).c, { x: 0.75, y: 0, w: 0.25, h: 1 });
});

test('serialize / deserialize by path survives new ids and dropped folders', () => {
  const t = abc();
  const paths: Record<string, string> = { a: '/p/a', b: '/p/b', c: '/p/c' };
  const saved = JSON.parse(JSON.stringify(serialize(t, id => paths[id])));
  // Next launch: new ids, and /p/b no longer exists
  const newIds: Record<string, string> = { '/p/a': 'A', '/p/c': 'C' };
  const back = deserialize(saved, p => newIds[p])!;
  assert.deepEqual(leaves(back), ['A', 'C']);
  assert.equal(deserialize({ type: 'bogus' }, () => 'x'), null);
  assert.equal(deserialize('junk', () => 'x'), null);
});
