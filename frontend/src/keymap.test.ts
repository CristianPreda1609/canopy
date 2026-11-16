import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesCombo, formatCombo, panelIndexFromEvent, type KeyLike } from './keymap.ts';
import { fuzzyMatch, fuzzyFilter } from './fuzzy.ts';

const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test('matchesCombo uses Ctrl on Windows/Linux and Cmd on macOS', () => {
  assert.ok(matchesCombo(ev('p', { ctrlKey: true }), 'Mod+P', false));
  assert.ok(!matchesCombo(ev('p', { metaKey: true }), 'Mod+P', false));
  assert.ok(matchesCombo(ev('p', { metaKey: true }), 'Mod+P', true));
  assert.ok(!matchesCombo(ev('p', { ctrlKey: true }), 'Mod+P', true));
});

test('matchesCombo is strict about extra modifiers', () => {
  assert.ok(!matchesCombo(ev('P', { ctrlKey: true, shiftKey: true }), 'Mod+P', false));
  assert.ok(matchesCombo(ev('P', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+P', false));
  assert.ok(matchesCombo(ev(',', { ctrlKey: true }), 'Mod+,', false));
  assert.ok(matchesCombo(ev('\\', { ctrlKey: true }), 'Mod+\\', false));
});

test('panelIndexFromEvent maps Mod+1..9', () => {
  assert.equal(panelIndexFromEvent(ev('1', { ctrlKey: true }), false), 0);
  assert.equal(panelIndexFromEvent(ev('9', { ctrlKey: true }), false), 8);
  assert.equal(panelIndexFromEvent(ev('0', { ctrlKey: true }), false), null);
  assert.equal(panelIndexFromEvent(ev('1'), false), null);
});

test('formatCombo per platform', () => {
  assert.equal(formatCombo('Mod+Shift+P', false), 'Ctrl+Shift+P');
  assert.equal(formatCombo('Mod+Shift+P', true), '⌘⇧P');
});

test('fuzzyMatch requires in-order characters', () => {
  assert.ok(fuzzyMatch('apc', 'src/AppContext.tsx'));
  assert.equal(fuzzyMatch('xyz', 'src/AppContext.tsx'), null);
  assert.equal(fuzzyMatch('cpa', 'src/AppContext.tsx'), null);
});

test('fuzzyFilter ranks file-name and word-start matches first', () => {
  const files = [
    'docs/old/settings-archive.md',
    'src/contexts/settings.ts',
    'src/components/SettingsPanel.tsx',
    'test/fixtures/a_set_of_things.txt',
  ];
  const ranked = fuzzyFilter('settings', files, f => f).map(r => r.item);
  assert.equal(ranked[0], 'src/contexts/settings.ts');
  assert.equal(ranked.at(-1), 'test/fixtures/a_set_of_things.txt');

  // camelCase humps count as word starts
  assert.deepEqual(fuzzyMatch('sp', 'SettingsPanel')!.positions, [0, 8]);
});
