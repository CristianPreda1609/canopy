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

export type BackgroundOptions = {
  closeToTray: boolean;
  windowMode: 'normal' | 'fullscreen' | 'background';
  /** Canopy combo format, e.g. "Mod+Shift+Space"; null disables it */
  summonShortcut: string | null;
  launchAtLogin: boolean;
};

/** Tray / window mode / global summon shortcut / start at login. Rejects with a readable message. */
export async function setBackgroundOptions(options: BackgroundOptions): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_background_options', { options });
}

/** Quit for real (the close button only hides to the tray). */
export async function quitApp(): Promise<void> {
  if (!isTauri) { console.log('[mock] Quit'); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('quit_app');
}

/** Every file under `path` (relative, `/`-separated), for "Go to file". */
export async function listFiles(path: string, opts: Omit<ScanOptions, 'depth'> = {}): Promise<FileList> {
  if (!isTauri) {
    const demo: Record<string, string[]> = {
      'ml-thesis': ['models/bert_finetune/bert_finetune.py', 'models/bert_finetune/train.py', 'models/bert_finetune/eval.py',
        'notebooks/explore.ipynb', 'notebooks/results.ipynb', 'configs/default.yaml', 'configs/sweep.yaml',
        'data/raw/train.csv', 'data/raw/test.csv', 'README.md', 'requirements.txt'],
      firmware: ['src/main.cpp', 'src/sensors.cpp', 'src/sensors.h', 'src/radio.cpp', 'include/config.h', 'include/pins.h',
        'lib/lora/LoRa.cpp', 'platformio.ini', 'CMakeLists.txt'],
      'web-dashboard': ['src/components/App.tsx', 'src/components/Chart.tsx', 'src/components/Sidebar.tsx',
        'src/components/StatCard.tsx', 'src/main.tsx', 'public/favicon.svg', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts'],
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

export type AvailableUpdate = {
  version: string;
  notes?: string;
  /** Download, install, and relaunch the app. */
  install: (onProgress?: (fraction: number | null) => void) => Promise<void>;
};

/**
 * Ask GitHub Releases (plugins.updater.endpoints) for a newer, signed version.
 * Resolves to null when up to date. Rejects on network errors or when no
 * release with update metadata exists yet.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body,
    install: async (onProgress) => {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          done += event.data.chunkLength;
          onProgress?.(total ? done / total : null);
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}
