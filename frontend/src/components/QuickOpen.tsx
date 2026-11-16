import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TbFileCode, TbLoader2 } from 'react-icons/tb';
import { useAppContext } from '../contexts/AppContext';
import { listFiles, openInVSCode, revealInExplorer } from '../services/tauri';
import { resolveTreePath, fileManagerName } from '../services/paths';
import { fuzzyFilter } from '../fuzzy';

type Entry = { panelId: string; panelTitle: string; panelPath: string; rel: string };

/** Render `text` with the matched character positions highlighted. */
function Highlighted({ text, positions, offset = 0 }: { text: string; positions: number[]; offset?: number }) {
  const set = new Set(positions.map(p => p - offset));
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <mark key={i} className="qo-hit">{ch}</mark> : ch))}
    </>
  );
}

/**
 * "Go to file" (Mod+P): fuzzy search over every file in every open panel.
 * Enter opens the file in VS Code; Shift+Enter reveals it in the file manager.
 * Rendered only while open (see App.tsx), so state starts fresh each time.
 */
export function QuickOpen() {
  const { state, toggleQuickOpen } = useAppContext();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load the file lists of all panels once when opened
  useEffect(() => {
    let cancelled = false;
    const { showHidden, skipDirs } = state.settings;
    Promise.all(state.panels.filter(p => p.path).map(async p => {
      try {
        const list = await listFiles(p.path!, { showHidden, skipDirs });
        return { panel: p, list };
      } catch (err) {
        console.error('listFiles failed:', p.path, err);
        return { panel: p, list: { files: [], truncated: false } };
      }
    })).then(results => {
      if (cancelled) return;
      setTruncated(results.some(r => r.list.truncated));
      setEntries(results.flatMap(({ panel, list }) =>
        list.files.map(rel => ({ panelId: panel.id, panelTitle: panel.title, panelPath: panel.path!, rel }))));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const multiPanel = state.panels.length > 1;
  const results = useMemo(() => {
    if (!entries) return [];
    if (!query.trim()) return entries.slice(0, 50).map(item => ({ item, match: { score: 0, positions: [] as number[] } }));
    return fuzzyFilter(query, entries, e => e.rel, 50);
  }, [entries, query]);

  // Keep the highlighted row visible
  useEffect(() => {
    listRef.current?.querySelector('.cmd-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const open = (entry: Entry, reveal: boolean) => {
    toggleQuickOpen();
    const abs = resolveTreePath(entry.panelPath, `${entry.panelTitle}/${entry.rel}`);
    (reveal ? revealInExplorer : openInVSCode)(abs).catch(console.error);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[index]) {
      e.preventDefault();
      open(results[index].item, e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleQuickOpen();
    }
  };

  return (
    <div className="cmd-palette-overlay" onClick={toggleQuickOpen}>
      <div className="cmd-palette" role="dialog" aria-label="Go to file" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder={state.panels.length ? 'Search files by name…' : 'Open a folder first (Ctrl+O)'}
          value={query}
          onChange={e => { setQuery(e.target.value); setIndex(0); }}
          onKeyDown={onKeyDown}
        />
        <div className="cmd-list" ref={listRef}>
          {entries === null && (
            <div className="cmd-item qo-muted"><TbLoader2 className="spin" /> Indexing files…</div>
          )}
          {entries !== null && results.length === 0 && (
            <div className="cmd-item qo-muted">No matching files.</div>
          )}
          {results.map(({ item, match }, i) => {
            const nameStart = item.rel.lastIndexOf('/') + 1;
            const name = item.rel.slice(nameStart);
            const dir = item.rel.slice(0, Math.max(0, nameStart - 1)); // without trailing slash
            return (
              <div
                key={`${item.panelId}:${item.rel}`}
                className={`cmd-item ${i === index ? 'selected' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={(e) => open(item, e.shiftKey)}
                title={`Enter: open in VS Code · Shift+Enter: reveal in ${fileManagerName}`}
              >
                <TbFileCode />
                <span className="qo-name"><Highlighted text={name} positions={match.positions} offset={nameStart} /></span>
                <span className="qo-dir">
                  {multiPanel && <span className="qo-panel">{item.panelTitle}{dir ? ' · ' : ''}</span>}
                  <Highlighted text={dir} positions={match.positions.filter(p => p < nameStart)} />
                </span>
              </div>
            );
          })}
        </div>
        <div className="qo-footer">
          <span>↵ open in VS Code</span>
          <span>⇧↵ reveal in {fileManagerName}</span>
          {truncated && <span className="qo-warn">Large project: showing the first 20,000 files</span>}
        </div>
      </div>
    </div>
  );
}
