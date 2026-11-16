/** User settings, persisted in localStorage. */

export type Settings = {
  /** Levels loaded per scan; deeper folders load when expanded. */
  scanDepth: number;
  /** Show dotfiles and dot-folders (.env, .github, …). */
  showHidden: boolean;
  /** Folders listed but not scanned until expanded. `null` = built-in list. */
  skipDirs: string[] | null;
};

export const DEFAULT_SETTINGS: Settings = {
  scanDepth: 3,
  showHidden: false,
  skipDirs: null,
};

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
  };
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
