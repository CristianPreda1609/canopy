// Run with `npm test` (Node's built-in test runner; Node 22.18+ strips TS types natively).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTreePath, parentDir } from './paths.ts';

test('resolveTreePath: Windows root', () => {
  assert.equal(resolveTreePath('C:\\proj', 'proj/src/a.ts'), 'C:\\proj\\src\\a.ts');
  assert.equal(resolveTreePath('C:\\proj\\', 'proj/a.ts'), 'C:\\proj\\a.ts');
  assert.equal(resolveTreePath('C:\\proj', 'proj'), 'C:\\proj');
});

test('resolveTreePath: POSIX root', () => {
  assert.equal(resolveTreePath('/home/u/proj', 'proj/src/a.ts'), '/home/u/proj/src/a.ts');
  assert.equal(resolveTreePath('/Users/u/My Proj', 'My Proj/x/y.md'), '/Users/u/My Proj/x/y.md');
  assert.equal(resolveTreePath('/home/u/proj', 'proj'), '/home/u/proj');
});

test('resolveTreePath: compacted folder segments are kept', () => {
  // TreeView expands "models / bert" into real segments before calling this
  assert.equal(
    resolveTreePath('C:\\ml', 'ml/models/bert/train.py'),
    'C:\\ml\\models\\bert\\train.py',
  );
});

test('parentDir', () => {
  assert.equal(parentDir('C:\\proj\\src\\a.ts'), 'C:\\proj\\src');
  assert.equal(parentDir('C:\\a.ts'), 'C:\\');
  assert.equal(parentDir('/home/u/a.ts'), '/home/u');
  assert.equal(parentDir('/a.ts'), '/');
});

test('targetPaths: folder vs file vs nothing selected', async () => {
  const { targetPaths } = await import('./paths.ts');
  assert.deepEqual(targetPaths('C:\\p', 'p/src', true), { full: 'C:\\p\\src', folder: 'C:\\p\\src' });
  assert.deepEqual(targetPaths('C:\\p', 'p/a.ts', false), { full: 'C:\\p\\a.ts', folder: 'C:\\p' });
  assert.deepEqual(targetPaths('/home/u/p', 'p/src/a.ts', false), { full: '/home/u/p/src/a.ts', folder: '/home/u/p/src' });
  assert.deepEqual(targetPaths('/home/u/p', null, false), { full: '/home/u/p', folder: '/home/u/p' });
});
