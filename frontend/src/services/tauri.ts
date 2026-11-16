/**
 * Tauri IPC Service Layer
 * 
 * All communication with the Rust backend goes through this file.
 * The React components/contexts NEVER call `invoke()` directly.
 * When running in browser (no Tauri), functions gracefully degrade.
 */

import type { TreeNode } from '../contexts/tree';
import type { GitStatus } from '../contexts/AppContext';
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type ScanOptions = {
  /** Levels to load now; deeper folders come back `unloaded`. */
  depth?: number;
  showHidden?: boolean;
  /** Folders to list but not scan. Omit for the built-in list. */
  skipDirs?: string[] | null;
};

/** Read a directory from the filesystem via Rust */
export async function readDirectory(path: string, opts: ScanOptions = {}): Promise<TreeNode[]> {
  if (!isTauri) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TreeNode[]>('read_directory', {
    path,
    depth: opts.depth,
    showHidden: opts.showHidden,
    skipDirs: opts.skipDirs ?? undefined,
  });
}

/** The built-in list of folders that are listed but not scanned. */
export async function defaultSkipDirs(): Promise<string[]> {
  if (!isTauri) {
    return ['node_modules', 'target', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'];
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('default_skip_dirs');
}

/** Open a folder in VSCode */
export async function openInVSCode(path: string): Promise<void> {
  if (!isTauri) { console.log('[mock] Open VSCode:', path); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_in_vscode', { path });
}

/** Open a terminal at the given path */
export async function openTerminal(path: string): Promise<void> {
  if (!isTauri) { console.log('[mock] Open Terminal:', path); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_terminal', { path });
}

/** Open a path in Windows Explorer */
export async function openInExplorer(path: string): Promise<void> {
  if (!isTauri) { console.log('[mock] Open Explorer:', path); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_in_explorer', { path });
}
/** Reveal a file or folder in Windows Explorer */
export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauri) { console.log('[mock] Reveal in Explorer:', path); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('reveal_in_explorer', { path });
}
/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<void> {
  if (!isTauri) {
    // Browser fallback
    await navigator.clipboard.writeText(text);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('copy_to_clipboard', { text });
}

/** Open native folder picker dialog, returns selected path or null */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) {
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === 'string') return selected;
  return null;
}

export async function getGitInfo(path: string): Promise<GitStatus | null> {
  if (!isTauri) {
    return null; // or return some mock data if you want
  }
    const{invoke} = await import('@tauri-apps/api/core');
    return invoke('get_git_info', { path });
}

export async function watchDirectory(panelId: string, path: string): Promise<void> {
  if (!isTauri) return;
  const {invoke} = await import('@tauri-apps/api/core');
  await invoke('watch_directory', { panelId, path });
}
export async function unwatchDirectory(panelId: string): Promise<void> {
  if (!isTauri) return;
  const {invoke} = await import('@tauri-apps/api/core');
  await invoke('unwatch_directory', { panelId });
}
export type FileList = { files: string[]; truncated: boolean };

/** Every file under `path` (relative, `/`-separated), for "Go to file". */
export async function listFiles(path: string, opts: Omit<ScanOptions, 'depth'> = {}): Promise<FileList> {
  if (!isTauri) {
    const demo: Record<string, string[]> = {
      ml_thesis: ['models/bert_finetune/bert_finetune.py', 'models/bert_finetune/train.py', 'models/bert_finetune/eval.py', 'notebooks/explore.ipynb', 'requirements.txt'],
      embedded: ['platformio_proj/src/main.cpp', 'platformio_proj/include/config.h', 'platformio_proj/platformio.ini'],
      web_app: ['web_app/src/components/App.tsx', 'web_app/src/components/AppContext.tsx', 'web_app/package.json', 'web_app/vite.config.ts'],
    };
    return { files: demo[path.split('/').pop() ?? ''] ?? [], truncated: false };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<FileList>('list_files', {
    path,
    showHidden: opts.showHidden,
    skipDirs: opts.skipDirs ?? undefined,
  });
}
