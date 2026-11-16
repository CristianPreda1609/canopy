/**
 * Tauri IPC Service Layer
 * 
 * All communication with the Rust backend goes through this file.
 * The React components/contexts NEVER call `invoke()` directly.
 * When running in browser (no Tauri), functions gracefully degrade.
 */

import type { TreeNode } from '../contexts/AppContext';
import type { GitStatus } from '../contexts/AppContext';
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Read a directory from the filesystem via Rust */
export async function readDirectory(path: string): Promise<TreeNode[]> {
  if (!isTauri) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TreeNode[]>('read_directory', { path });
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