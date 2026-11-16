import { useEffect, useState } from 'react';
import { TbSettings, TbX, TbRefresh, TbKeyboard, TbGitBranch, TbAdjustments } from 'react-icons/tb';
import { useAppContext, type SettingsTab } from '../contexts/AppContext';
import {
  DEFAULT_SETTINGS, SCAN_DEPTH_MIN, SCAN_DEPTH_MAX, DEFAULT_GIT_COLORS, GIT_COLOR_LABELS,
  normalizeSettings, gitColor, type Settings, type GitColorKey,
} from '../contexts/settings';
import {
  KEYMAP, REFERENCE_SECTIONS, comboFor, comboFromEvent, findConflict, formatCombo, isRebindable,
  isValidBinding, shortcutRecorder, type ShortcutId,
} from '../keymap';
import { defaultSkipDirs } from '../services/tauri';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <TbAdjustments /> },
  { id: 'git', label: 'Git colors', icon: <TbGitBranch /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <TbKeyboard /> },
];

/**
 * Settings dialog. Rendered only while open (see App.tsx), so the draft
 * state starts fresh from the saved settings every time it opens. Nothing is
 * applied until Save.
 */
export function SettingsPanel() {
  const { state, toggleSettings, setSettingsTab, updateSettings } = useAppContext();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const close = () => toggleSettings();

  // Esc closes, unless a shortcut is being recorded (then Esc cancels recording)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !shortcutRecorder.active) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [skipText, setSkipText] = useState<string | null>(
    state.settings.skipDirs ? state.settings.skipDirs.join('\n') : null,
  );

  const save = () => {
    updateSettings(normalizeSettings({
      ...draft,
      skipDirs: skipText === null ? null : skipText.split(/[\n,]/),
    }));
    close();
  };

  const resetAll = () => {
    setDraft(DEFAULT_SETTINGS);
    setSkipText(null);
  };

  return (
    <div className="cmd-palette-overlay" onClick={close}>
      <div className="cmd-palette settings-panel" role="dialog" aria-label="Settings" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span><TbSettings /> Settings</span>
          <button className="tb-btn" aria-label="Close settings" title="Close (Esc)" onClick={close}><TbX /></button>
        </div>

        <div className="settings-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={state.settingsTab === t.id}
              className={`settings-tab ${state.settingsTab === t.id ? 'active' : ''}`}
              onClick={() => setSettingsTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {state.settingsTab === 'general' && (
            <GeneralTab draft={draft} setDraft={setDraft} skipText={skipText} setSkipText={setSkipText} />
          )}
          {state.settingsTab === 'git' && <GitColorsTab draft={draft} setDraft={setDraft} />}
          {state.settingsTab === 'shortcuts' && <ShortcutsTab draft={draft} setDraft={setDraft} />}
        </div>

        <div className="settings-footer">
          <button className="settings-btn" onClick={resetAll} title="Reset every setting on every tab (applied when you save)">
            <TbRefresh /> Reset all to defaults
          </button>
          <div style={{ flex: 1 }} />
          <button className="settings-btn" onClick={close} title="Discard changes (Esc)">Cancel</button>
          <button className="settings-btn primary" onClick={save} title="Apply and save these settings">Save</button>
        </div>
      </div>
    </div>
  );
}

type TabProps = { draft: Settings; setDraft: (s: Settings) => void };

// ─── General ────────────────────────────────────────────────────────

function GeneralTab({ draft, setDraft, skipText, setSkipText }: TabProps & {
  skipText: string | null; setSkipText: (t: string | null) => void;
}) {
  const [builtinSkips, setBuiltinSkips] = useState<string[]>([]);
  useEffect(() => { defaultSkipDirs().then(setBuiltinSkips).catch(console.error); }, []);

  return (
    <>
      <label className="settings-row">
        <div>
          <div className="settings-label">Scan depth</div>
          <div className="settings-hint">Levels loaded up front. Deeper folders load when you expand them.</div>
        </div>
        <input
          type="number" className="settings-input settings-number"
          min={SCAN_DEPTH_MIN} max={SCAN_DEPTH_MAX} value={draft.scanDepth}
          onChange={e => setDraft({ ...draft, scanDepth: Number(e.target.value) })}
        />
      </label>

      <label className="settings-row">
        <div>
          <div className="settings-label">Show hidden files</div>
          <div className="settings-hint">Dotfiles and dot-folders such as .env or .github.</div>
        </div>
        <input
          type="checkbox" className="settings-checkbox" checked={draft.showHidden}
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
            <button className="settings-link" onClick={() => setSkipText(null)} title="Discard your list and use the built-in one">
              use built-in list
            </button>
          )}
        </div>
        <textarea
          className="settings-input settings-textarea" rows={6} spellCheck={false}
          value={skipText ?? builtinSkips.join('\n')}
          onChange={e => setSkipText(e.target.value)}
        />
        {skipText === null && <div className="settings-hint">Using the built-in list. Edit to customize.</div>}
      </div>
    </>
  );
}

// ─── Git colors ─────────────────────────────────────────────────────

function GitColorsTab({ draft, setDraft }: TabProps) {
  const setColor = (key: GitColorKey, value: string | null) => {
    const gitColors = { ...draft.gitColors };
    if (value === null || value.toLowerCase() === DEFAULT_GIT_COLORS[key]) delete gitColors[key];
    else gitColors[key] = value;
    setDraft({ ...draft, gitColors });
  };

  return (
    <>
      <div className="settings-hint settings-intro">
        Colors used for file names in the tree, based on their git status.
      </div>
      {(Object.keys(DEFAULT_GIT_COLORS) as GitColorKey[]).map(key => {
        const color = gitColor(draft, key);
        const custom = key in draft.gitColors;
        return (
          <div className="settings-row" key={key}>
            <div className="git-color-preview">
              <span className="git-swatch" style={{ background: color }} />
              <div>
                <div className="settings-label">{GIT_COLOR_LABELS[key]}</div>
                <div className="settings-hint" style={{ color }}>src/example.ts</div>
              </div>
            </div>
            <div className="git-color-controls">
              {custom && (
                <button className="settings-link" onClick={() => setColor(key, null)} title="Back to the default color">
                  reset
                </button>
              )}
              <input
                type="color" className="settings-color" value={color}
                aria-label={`${GIT_COLOR_LABELS[key]} color`} title={`Pick the color for ${GIT_COLOR_LABELS[key].toLowerCase()} files`}
                onChange={e => setColor(key, e.target.value)}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Shortcuts guide + rebinding ────────────────────────────────────

function ShortcutsTab({ draft, setDraft }: TabProps) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setBinding = (id: ShortcutId, combo: string | null) => {
    const keybindings = { ...draft.keybindings };
    if (combo === null || combo.toLowerCase() === KEYMAP[id].combo.toLowerCase()) delete keybindings[id];
    else keybindings[id] = combo;
    setDraft({ ...draft, keybindings });
  };

  // While recording: capture the next combo before the global shortcut handler sees it
  useEffect(() => {
    if (!recording) return;
    shortcutRecorder.active = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setRecording(null); setError(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // only modifiers held so far
      if (!isValidBinding(combo)) {
        setError('Use Ctrl/⌘ or Alt together with a key, or a function key (F1–F12).');
        return;
      }
      const conflict = findConflict(recording, combo, draft.keybindings);
      if (conflict) {
        setError(`${formatCombo(combo)} is already used by "${KEYMAP[conflict].label}". Change that one first.`);
        return;
      }
      setBinding(recording, combo);
      setRecording(null);
      setError(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      shortcutRecorder.active = false;
    };
  });

  return (
    <>
      <div className="settings-hint settings-intro">
        Click a shortcut to change it, then press the new keys. <kbd className="cmd-kbd inline">Esc</kbd> cancels.
        Changes apply when you save.
      </div>

      <div className="shortcut-section">App</div>
      {(Object.keys(KEYMAP) as ShortcutId[]).map(id => {
        const combo = comboFor(id, draft.keybindings);
        const custom = id in draft.keybindings;
        const isRec = recording === id;
        return (
          <div className={`settings-row shortcut-row ${isRec ? 'recording' : ''}`} key={id}>
            <div className="settings-label">{KEYMAP[id].label}</div>
            <div className="git-color-controls">
              {custom && !isRec && (
                <button className="settings-link" onClick={() => setBinding(id, null)} title={`Back to ${formatCombo(KEYMAP[id].combo)}`}>
                  reset
                </button>
              )}
              {isRebindable(id) ? (
                <button
                  className={`shortcut-key ${isRec ? 'recording' : ''}`}
                  onClick={() => { setError(null); setRecording(isRec ? null : id); }}
                  title={isRec ? 'Press the new shortcut (Esc to cancel)' : 'Click to change'}
                >
                  {isRec ? 'Press keys…' : formatCombo(combo)}
                </button>
              ) : (
                <kbd className="shortcut-key fixed" title="This shortcut can't be changed">{formatCombo(combo)}</kbd>
              )}
            </div>
          </div>
        );
      })}
      {error && <div className="settings-error" role="alert">{error}</div>}

      {REFERENCE_SECTIONS.map(section => (
        <div key={section.title}>
          <div className="shortcut-section">{section.title}</div>
          {section.keys.map(k => (
            <div className="settings-row shortcut-row" key={k.keys}>
              <div className="settings-label">{k.label}</div>
              <kbd className="shortcut-key fixed">{k.keys}</kbd>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
