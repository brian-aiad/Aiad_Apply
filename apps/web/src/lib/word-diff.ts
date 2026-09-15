export type DiffToken = { text: string; changed: boolean };

// Bound the comparison for malformed historical reports; preserve all original text.
export function wordDiff(before: string, after: string): { before: DiffToken[]; after: DiffToken[] } {
  if (before === after) return { before: [{ text: before, changed: false }], after: [{ text: after, changed: false }] };
  const a = before.match(/\s+|[^\s]+/g) || [], b = after.match(/\s+|[^\s]+/g) || [];
  if (a.length * b.length > 250_000) return { before: [{ text: before, changed: true }], after: [{ text: after, changed: true }] };
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const old: DiffToken[] = [], next: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { old.push({ text: a[i++], changed: false }); next.push({ text: b[j++], changed: false }); }
    else if (i < a.length && (j === b.length || rows[i + 1][j] >= rows[i][j + 1])) old.push({ text: a[i++], changed: true });
    else next.push({ text: b[j++], changed: true });
  }
  return { before: old, after: next };
}
