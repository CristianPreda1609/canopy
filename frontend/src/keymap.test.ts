import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesCombo, formatCombo, panelIndexFromEvent, type KeyLike } from './keymap.ts';
import { fuzzyMatch, fuzzyFilter } from './fuzzy.ts';

const codeFor = (key: string) =>
  /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : key;
const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike =>
  ({ key, code: codeFor(key), ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

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

test('Alt combos match the physical key (macOS Option produces symbols)', async () => {
  const { pressedKey } = await import('./keymap.ts');
  // Option+H on macOS: key is "˙" but code is "KeyH"
  assert.equal(pressedKey({ ...ev('˙', { altKey: true }), code: 'KeyH' }), 'h');
  assert.ok(matchesCombo({ ...ev('ƒ', { altKey: true }), code: 'KeyF' }, 'Alt+F', true));
  assert.equal(pressedKey({ ...ev('#', { altKey: true, shiftKey: true }), code: 'Digit3' }), '3');
  assert.equal(pressedKey(ev('ArrowLeft', { altKey: true })), 'ArrowLeft');
});

/** Shaped like a real KeyboardEvent: fields are getters on the prototype, not own properties. */
class FakeKeyboardEvent {
  #init: KeyLike;
  constructor(init: KeyLike) { this.#init = init; }
  get key() { return this.#init.key; }
  get code() { return this.#init.code; }
  get ctrlKey() { return this.#init.ctrlKey; }
  get metaKey() { return this.#init.metaKey; }
  get shiftKey() { return this.#init.shiftKey; }
  get altKey() { return this.#init.altKey; }
}

test('comboFromEvent works with real (getter-based) events', async () => {
  const { comboFromEvent } = await import('./keymap.ts');
  assert.equal({ ...new FakeKeyboardEvent(ev('k')) }.key, undefined, 'spreading loses the fields');
  assert.equal(comboFromEvent(new FakeKeyboardEvent(ev('k', { ctrlKey: true })), false), 'Mod+K');
  assert.equal(comboFromEvent(new FakeKeyboardEvent(ev('F5')), false), 'F5');
});

test('custom bindings: recording, validation and conflicts', async () => {
  const { comboFromEvent, isValidBinding, findConflict, comboFor } = await import('./keymap.ts');
  assert.equal(comboFromEvent(ev('k', { ctrlKey: true, shiftKey: true }), false), 'Mod+Shift+K');
  assert.equal(comboFromEvent(ev('k', { metaKey: true }), true), 'Mod+K');
  assert.equal(comboFromEvent(ev('Control', { ctrlKey: true }), false), null, 'only a modifier so far');
  assert.equal(comboFromEvent(ev('F2'), false), 'F2');
  // macOS Option+K types "˚", but the binding is recorded by physical key
  assert.equal(comboFromEvent({ ...ev('˚', { altKey: true }), code: 'KeyK' }, true), 'Alt+K');

  assert.ok(isValidBinding('Mod+K'));
  assert.ok(isValidBinding('Alt+G'));
  assert.ok(isValidBinding('F5'));
  assert.ok(!isValidBinding('K'), 'plain letters would steal tree navigation');
  assert.ok(!isValidBinding('Shift+K'));

  assert.equal(findConflict('settings', 'Mod+P'), 'quickOpen');
  assert.equal(findConflict('settings', 'mod+p'), 'quickOpen', 'case-insensitive');
  assert.equal(findConflict('settings', 'Mod+K'), null);
  // Once quickOpen is moved, Mod+P is free
  assert.equal(findConflict('settings', 'Mod+P', { quickOpen: 'Mod+K' }), null);
  assert.equal(comboFor('quickOpen', { quickOpen: 'Mod+K' }), 'Mod+K');
  assert.equal(comboFor('focusPanel', { focusPanel: 'Mod+X' }), 'Mod+1…9', 'fixed shortcuts ignore overrides');
});
