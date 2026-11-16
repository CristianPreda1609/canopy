/** User settings, persisted in localStorage. */
import { KEYMAP, isRebindable, isValidBinding, type KeyBindings, type ShortcutId } from '../keymap.ts';

export type GitColorKey = 'modified' | 'staged' | 'untracked' | 'conflict' | 'deleted';

/** Default colors for git status in the tree (match the app's sunset palette). */
export const DEFAULT_GIT_COLORS: Record<GitColorKey, string> = {
  modified: '#f09060',
  staged: '#7dd49a',
  untracked: '#9f86d4',
  conflict: '#ff6b6b',
  deleted: '#d9606e',
};

export const GIT_COLOR_LABELS: Record<GitColorKey, string> = {
  modified: 'Modified',
  staged: 'Staged',
  untracked: 'Untracked',
  conflict: 'Conflict',
  deleted: 'Deleted',
};

export type Settings = {
  /** Levels loaded per scan; deeper folders load when expanded. */
  scanDepth: number;
  /** Show dotfiles and dot-folders (.env, .github, …). */
  showHidden: boolean;
  /** Folders listed but not scanned until expanded. `null` = built-in list. */
  skipDirs: string[] | null;
  /** Overrides of DEFAULT_GIT_COLORS (#rrggbb). */
  gitColors: Partial<Record<GitColorKey, string>>;
  /** Overrides of the default shortcuts in KEYMAP. */
  keybindings: KeyBindings;
};

export const DEFAULT_SETTINGS: Settings = {
  scanDepth: 3,
  showHidden: false,
  skipDirs: null,
  gitColors: {},
  keybindings: {},
};

/** The color in effect for a git status. */
export const gitColor = (s: Settings, key: GitColorKey) => s.gitColors[key] ?? DEFAULT_GIT_COLORS[key];

export const SCAN_DEPTH_MIN = 1;
export const SCAN_DEPTH_MAX = 12;

const SETTINGS_KEY = 'canopy_settings';

/** Coerce anything (e.g. old or hand-edited storage) into valid settings. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const depth = Number(r.scanDepth);
  return {
    scanDepth: Number.isFinite(depth)
      ? Math.min(SCAN_DEPTH_MAX, Math.max(SCAN_DEPTH_MIN, Math.round(depth)))
      : DEFAULT_SETTINGS.scanDepth,
    showHidden: typeof r.showHidden === 'boolean' ? r.showHidden : DEFAULT_SETTINGS.showHidden,
    skipDirs: Array.isArray(r.skipDirs)
      ? [...new Set(r.skipDirs.filter((d): d is string => typeof d === 'string').map(d => d.trim()).filter(Boolean))]
      : null,
    gitColors: pickValid(r.gitColors, (k, v) =>
      k in DEFAULT_GIT_COLORS && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)),
    keybindings: pickValid(r.keybindings, (k, v) =>
      k in KEYMAP && isRebindable(k as ShortcutId) && typeof v === 'string' && isValidBinding(v)),
  };
}

/** Keep only the entries of an object that pass `ok`. */
function pickValid<T extends string>(raw: unknown, ok: (k: string, v: unknown) => boolean): Partial<Record<T, string>> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => ok(k, v))) as Partial<Record<T, string>>;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
