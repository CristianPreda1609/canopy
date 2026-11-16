/**
 * Central keymap: the single source of truth for shortcuts. It drives the
 * key handler (useShortcuts), the hints in the command palette, and docs.
 *
 * Combos are written like "Mod+Shift+P". `Mod` is ⌘ on macOS, Ctrl elsewhere.
 */

export type ShortcutId =
  | 'palette' | 'quickOpen' | 'settings' | 'addPanel' | 'closePanel'
  | 'toggleLayout' | 'nextPanel' | 'prevPanel' | 'focusPanel' | 'shortcutsHelp'
  | 'tileFullscreen' | 'tileToggleSplit';

export const KEYMAP: Record<ShortcutId, { combo: string; label: string }> = {
  palette:      { combo: 'Mod+Shift+P', label: 'Command palette' },
  quickOpen:    { combo: 'Mod+P',       label: 'Go to file' },
  settings:     { combo: 'Mod+,',       label: 'Settings' },
  addPanel:     { combo: 'Mod+O',       label: 'Open folder in panel' },
  closePanel:   { combo: 'Mod+W',       label: 'Close panel' },
  toggleLayout: { combo: 'Mod+\\',      label: 'Toggle split direction (alternate key)' },
  nextPanel:    { combo: 'Mod+Tab',     label: 'Next panel' },
  prevPanel:    { combo: 'Mod+Shift+Tab', label: 'Previous panel' },
  focusPanel:   { combo: 'Mod+1…9',     label: 'Go to panel 1–9' },
  tileFullscreen:  { combo: 'Alt+F', label: 'Fullscreen panel' },
  tileToggleSplit: { combo: 'Alt+E', label: 'Toggle split direction' },
  shortcutsHelp: { combo: 'F1',         label: 'Keyboard shortcuts' },
};

/**
 * Tiling keys (Hyprland style). Alt-based so they never clash with the
 * Mod shortcuts above. Documented here, handled in useShortcuts.
 */
export const TILING_KEYS: { keys: string; label: string }[] = [
  { keys: 'Alt+H/J/K/L or Alt+Arrows', label: 'Focus panel left / down / up / right' },
  { keys: 'Alt+Shift+H/J/K/L or Arrows', label: 'Swap with that panel' },
  { keys: 'Alt+Ctrl+Arrows', label: 'Resize (move the divider)' },
  { keys: 'Alt+F', label: 'Fullscreen the focused panel' },
  { keys: 'Alt+E', label: 'Toggle split direction' },
  { keys: 'Alt+1…9', label: 'Switch workspace' },
  { keys: 'Alt+Shift+1…9', label: 'Send panel to workspace' },
];

/** Keys handled by the focused tree (no modifiers). Shown in docs/palette. */
export const TREE_KEYS: { keys: string; label: string }[] = [
  { keys: '↑ ↓ / J K', label: 'Move' },
  { keys: '→ / L', label: 'Expand folder / go to first child' },
  { keys: '← / H', label: 'Collapse folder / go to parent' },
  { keys: 'Enter / Space', label: 'Toggle folder / open file in VS Code' },
  { keys: 'Home / End', label: 'First / last item' },
  { keys: 'Y', label: 'Copy path' },
  { keys: 'T', label: 'Open terminal here' },
  { keys: 'E', label: 'Reveal in file manager' },
];

/** Mouse tips shown in the shortcuts guide. */
export const MOUSE_TIPS: { keys: string; label: string }[] = [
  { keys: 'Right-click', label: 'Context menu for a file or folder' },
  { keys: 'Ctrl + hover', label: 'Context menu without clicking' },
  { keys: 'Click folder', label: 'Expand / collapse (loads on demand)' },
  { keys: 'Drag a gap', label: 'Resize the panels on either side' },
  { keys: 'Click a pill', label: 'Switch workspace (title bar)' },
];

/** Read-only sections of the shortcuts guide (Settings → Shortcuts). */
export const REFERENCE_SECTIONS: { title: string; keys: { keys: string; label: string }[] }[] = [
  { title: 'Tiling (Hyprland style)', keys: TILING_KEYS },
  { title: 'File tree (active panel)', keys: TREE_KEYS },
  { title: 'Mouse', keys: MOUSE_TIPS },
];

/** The subset of KeyboardEvent we look at (makes this testable without a DOM). */
export type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/**
 * The key a user *pressed*, layout-independent for letters and digits.
 * With Alt/Option held, macOS reports e.key as a symbol (Option+H = "˙"),
 * so we read the physical key from e.code ("KeyH" -> "h", "Digit3" -> "3").
 */
export function pressedKey(e: KeyLike): string {
  if (e.altKey && e.code) {
    const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
    if (m) return (m[1] ?? m[2]).toLowerCase();
  }
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** Does the event match a combo like "Mod+Shift+P"? (Not for "Mod+1…9".) */
export function matchesCombo(e: KeyLike, combo: string, isMac = isMacPlatform()): boolean {
  const parts = combo.split('+');
  const key = parts.pop()!;
  const want = new Set(parts);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const otherMod = isMac ? e.ctrlKey : e.metaKey;
  if (want.has('Mod') !== mod || otherMod) return false;
  if (want.has('Shift') !== e.shiftKey) return false;
  if (want.has('Alt') !== e.altKey) return false;
  return pressedKey(e) === (key.length === 1 ? key.toLowerCase() : key);
}

/** "Mod+1"…"Mod+9" → 0…8, otherwise null. */
export function panelIndexFromEvent(e: KeyLike, isMac = isMacPlatform()): number | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.shiftKey || e.altKey || !/^[1-9]$/.test(e.key)) return null;
  return Number(e.key) - 1;
}

/** Human-readable combo for the current platform: "Ctrl+Shift+P" or "⌘⇧P". */
export function formatCombo(combo: string, isMac = isMacPlatform()): string {
  const parts = combo.split('+');
  if (!isMac) return parts.map(p => (p === 'Mod' ? 'Ctrl' : p)).join('+');
  const sym: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' };
  return parts.map(p => sym[p] ?? p).join('');
}

// ─── Custom key bindings ────────────────────────────────────────────

/**
 * Set while Settings is recording a new shortcut, so the global handler
 * doesn't act on the keys being recorded.
 */
export const shortcutRecorder = { active: false };

export type KeyBindings = Partial<Record<ShortcutId, string>>;

/** Shortcuts that can't be rebound (they're a family, not a single combo). */
export const FIXED_SHORTCUTS: ShortcutId[] = ['focusPanel'];

export const isRebindable = (id: ShortcutId) => !FIXED_SHORTCUTS.includes(id);

/** The combo in effect for `id`: the user's override, or the default. */
export function comboFor(id: ShortcutId, bindings: KeyBindings = {}): string {
  return (isRebindable(id) && bindings[id]) || KEYMAP[id].combo;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

/**
 * Turn a key press into a combo string ("Mod+Shift+K", "Alt+F2", "F1").
 * Returns null while only modifiers are held.
 */
export function comboFromEvent(e: KeyLike, isMac = isMacPlatform()): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  // Physical letters/digits regardless of layout. Build a plain object:
  // spreading a real KeyboardEvent copies nothing (its fields are prototype getters).
  const k = pressedKey({
    key: e.key, code: e.code, altKey: true, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
  });
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join('+');
}

/**
 * A binding must not steal plain typing or tree navigation keys: it needs
 * Mod or Alt, unless it's a function key (F1–F12).
 */
export function isValidBinding(combo: string): boolean {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  if (!key || ['Escape', 'Backspace', 'Enter', 'Tab'].includes(key) && parts.length === 1) return false;
  if (/^F([1-9]|1[0-2])$/.test(key)) return true;
  return parts.includes('Mod') || parts.includes('Alt');
}

const normalizeCombo = (c: string) => c.toLowerCase();

/** Another shortcut already using `combo` (with current bindings), if any. */
export function findConflict(id: ShortcutId, combo: string, bindings: KeyBindings = {}): ShortcutId | null {
  for (const other of Object.keys(KEYMAP) as ShortcutId[]) {
    if (other !== id && normalizeCombo(comboFor(other, bindings)) === normalizeCombo(combo)) return other;
  }
  return null;
}
