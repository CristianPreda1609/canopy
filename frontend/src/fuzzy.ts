/**
 * Small fuzzy matcher for "Go to file", in the spirit of VS Code / fzf:
 * query characters must appear in order; consecutive runs, matches at word
 * starts (after / _ - . or a camelCase hump) and matches in the file name
 * score higher. Returns null when the query doesn't match.
 */

export type FuzzyMatch = { score: number; positions: number[] };

const isBoundary = (text: string, i: number) => {
  if (i === 0) return true;
  const prev = text[i - 1];
  const cur = text[i];
  return '/\\_-. '.includes(prev) || (prev === prev.toLowerCase() && cur !== cur.toLowerCase());
};

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.replace(/\s+/g, '').toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const nameStart = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1;

  // Greedy matching from the start of the path can "waste" letters on
  // directory names (the s of src/ for "settings"), so also try matching
  // within the file name alone and keep the better alignment.
  const inName = nameStart > 0 ? matchFrom(q, text, nameStart, nameStart) : null;
  const whole = matchFrom(q, text, 0, nameStart);
  if (!inName) return whole;
  if (!whole) return inName;
  return inName.score >= whole.score ? inName : whole;
}

function matchFrom(q: string, text: string, from: number, nameStart: number): FuzzyMatch | null {
  const t = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let ti = from;
  let prevMatch = -2;

  for (const ch of q) {
    // Prefer the next occurrence that sits on a word boundary, if any
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] !== ch) continue;
      if (found === -1) found = i;
      if (isBoundary(text, i) || i === prevMatch + 1) { found = i; break; }
    }
    if (found === -1) return null;

    score += 1;
    if (found === prevMatch + 1) score += 5;          // consecutive
    if (isBoundary(text, found)) score += 4;          // word start
    if (found >= nameStart) score += 2;               // inside the file name
    positions.push(found);
    prevMatch = found;
    ti = found + 1;
  }

  // Exact file-name prefix is a strong signal; shorter paths win ties
  if (t.slice(nameStart).startsWith(q)) score += 10;
  score -= text.length * 0.01;
  return { score, positions };
}

/** Rank `items` by fuzzy score against `query`, best first. */
export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string, limit = 50) {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) out.push({ item, match });
  }
  out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
