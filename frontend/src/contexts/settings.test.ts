import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, DEFAULT_SETTINGS } from './settings.ts';

test('normalizeSettings falls back to defaults on junk', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('nope'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ scanDepth: 'x', showHidden: 1 }), DEFAULT_SETTINGS);
});

test('normalizeSettings clamps depth and cleans skip list', () => {
  const s = normalizeSettings({ scanDepth: 99, showHidden: true, skipDirs: [' dist ', 'dist', '', 3, 'out'] });
  assert.equal(s.scanDepth, 12);
  assert.equal(s.showHidden, true);
  assert.deepEqual(s.skipDirs, ['dist', 'out']);
  assert.equal(normalizeSettings({ scanDepth: 0 }).scanDepth, 1);
});
