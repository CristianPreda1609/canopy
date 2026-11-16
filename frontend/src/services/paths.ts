/**
 * Cross-platform path helpers.
 *
 * Tree paths in the UI are always "<rootName>/<rel/path>" with `/`.
 * Panel roots are native absolute paths (`C:\proj` on Windows, `/home/u/proj`
 * elsewhere), so the separator is taken from the root.
 */

const platform = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isMac = /Mac/i.test(platform);
export const isWindows = /Win/i.test(platform);

/** Name of the OS file manager, for menu labels. */
export const fileManagerName = isWindows ? 'Explorer' : isMac ? 'Finder' : 'file manager';

function separatorOf(root: string): string {
  return root.includes('\\') && !root.startsWith('/') ? '\\' : '/';
}

/** Turn a tree path ("<root>/a/b.txt") into an absolute path under `panelRoot`. */
export function resolveTreePath(panelRoot: string, treePath: string): string {
  const rel = treePath.split(/[/\\]/).slice(1).filter(Boolean);
  if (rel.length === 0) return panelRoot;
  const sep = separatorOf(panelRoot);
  const root = panelRoot.endsWith(sep) ? panelRoot.slice(0, -1) : panelRoot;
  return [root, ...rel].join(sep);
}

/** Parent directory of an absolute path (returns the path itself at the root). */
export function parentDir(absPath: string): string {
  const idx = Math.max(absPath.lastIndexOf('/'), absPath.lastIndexOf('\\'));
  if (idx <= 0) return absPath.startsWith('/') ? '/' : absPath;
  const parent = absPath.slice(0, idx);
  return /^[A-Za-z]:$/.test(parent) ? parent + '\\' : parent; // keep "C:\" a valid root
}
