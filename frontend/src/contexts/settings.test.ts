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

test('normalizeSettings keeps only valid git colors and key bindings', () => {
  const s = normalizeSettings({
    gitColors: { modified: '#AABBCC', staged: 'red', bogus: '#000000', untracked: '#12345' },
    keybindings: { settings: 'Mod+K', quickOpen: 'K', focusPanel: 'Mod+X', nope: 'Mod+J', palette: 'F2' },
  });
  assert.deepEqual(s.gitColors, { modified: '#AABBCC' });
  assert.deepEqual(s.keybindings, { settings: 'Mod+K', palette: 'F2' });
});

test('normalizeSettings validates background options', async () => {
  const { DEFAULT_BACKGROUND } = await import('./settings.ts');
  assert.deepEqual(normalizeSettings({}).background, DEFAULT_BACKGROUND);
  assert.deepEqual(
    normalizeSettings({ background: { windowMode: 'background', closeToTray: false, launchAtLogin: true } }).background,
    { windowMode: 'background', closeToTray: false, launchAtLogin: true },
  );
  assert.equal(normalizeSettings({ background: { windowMode: 'tiny' } }).background.windowMode, 'normal');
});

test('gitColor falls back to defaults', async () => {
  const { gitColor, DEFAULT_GIT_COLORS } = await import('./settings.ts');
  const s = normalizeSettings({ gitColors: { staged: '#010203' } });
  assert.equal(gitColor(s, 'staged'), '#010203');
  assert.equal(gitColor(s, 'modified'), DEFAULT_GIT_COLORS.modified);
});
