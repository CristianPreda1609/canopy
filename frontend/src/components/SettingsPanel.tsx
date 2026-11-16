import { useEffect, useState } from 'react';
import { TbSettings, TbX, TbRefresh } from 'react-icons/tb';
import { useAppContext } from '../contexts/AppContext';
import {
  DEFAULT_SETTINGS, SCAN_DEPTH_MIN, SCAN_DEPTH_MAX, normalizeSettings, type Settings,
} from '../contexts/settings';
import { defaultSkipDirs } from '../services/tauri';

/**
 * Settings dialog. Rendered only while open (see App.tsx), so the draft
 * state starts fresh from the saved settings every time it opens.
 */
export function SettingsPanel() {
  const { state, toggleSettings, updateSettings } = useAppContext();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [builtinSkips, setBuiltinSkips] = useState<string[]>([]);
  // Skip list as edited text (one folder per line); null = using the built-in list
  const [skipText, setSkipText] = useState<string | null>(
    state.settings.skipDirs ? state.settings.skipDirs.join('\n') : null,
  );

  useEffect(() => {
    defaultSkipDirs().then(setBuiltinSkips).catch(console.error);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleSettings(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSettings]);

  const save = () => {
    updateSettings(normalizeSettings({
      ...draft,
      skipDirs: skipText === null ? null : skipText.split(/[\n,]/),
    }));
    toggleSettings();
  };

  const resetAll = () => {
    setDraft(DEFAULT_SETTINGS);
    setSkipText(null);
  };

  return (
    <div className="cmd-palette-overlay" onClick={toggleSettings}>
      <div
        className="cmd-palette settings-panel"
        role="dialog"
        aria-label="Settings"
        onClick={e => e.stopPropagation()}
      >
        <div className="settings-header">
          <span><TbSettings /> Settings</span>
          <button className="tb-btn" aria-label="close settings" onClick={toggleSettings}><TbX /></button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <div>
              <div className="settings-label">Scan depth</div>
              <div className="settings-hint">Levels loaded up front. Deeper folders load when you expand them.</div>
            </div>
            <input
              type="number"
              className="settings-input settings-number"
              min={SCAN_DEPTH_MIN}
              max={SCAN_DEPTH_MAX}
              value={draft.scanDepth}
              onChange={e => setDraft({ ...draft, scanDepth: Number(e.target.value) })}
            />
          </label>

          <label className="settings-row">
            <div>
              <div className="settings-label">Show hidden files</div>
              <div className="settings-hint">Dotfiles and dot-folders such as .env or .github.</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={draft.showHidden}
              onChange={e => setDraft({ ...draft, showHidden: e.target.checked })}
            />
          </label>

          <div className="settings-row settings-row-col">
            <div className="settings-row-head">
              <div>
                <div className="settings-label">Skipped folders</div>
                <div className="settings-hint">Listed but not scanned until expanded. One per line.</div>
              </div>
              {skipText !== null && (
                <button className="settings-link" onClick={() => setSkipText(null)}>use built-in list</button>
              )}
            </div>
            <textarea
              className="settings-input settings-textarea"
              rows={6}
              spellCheck={false}
              value={skipText ?? builtinSkips.join('\n')}
              onChange={e => setSkipText(e.target.value)}
            />
            {skipText === null && <div className="settings-hint">Using the built-in list. Edit to customize.</div>}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn" onClick={resetAll}><TbRefresh /> Reset to defaults</button>
          <div style={{ flex: 1 }} />
          <button className="settings-btn" onClick={toggleSettings}>Cancel</button>
          <button className="settings-btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
