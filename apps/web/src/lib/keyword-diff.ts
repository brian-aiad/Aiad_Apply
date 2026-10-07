import type { DiffToken } from "./word-diff";

export type KeywordDiffToken = DiffToken & { keyword?: string };

// Match against the complete paragraph so phrases can cross unchanged/added words.
// Only the audited added terms belong here; model targets are not additions.
export function highlightAddedKeywords(parts: DiffToken[], addedTerms: readonly string[]): KeywordDiffToken[] {
  const text = parts.map(part => part.text).join("");
  const ranges: { start: number; end: number; term: string }[] = [];
  for (const term of new Set(addedTerms.map(term => term.trim()).filter(Boolean))) {
    const escaped = term.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(pattern)) ranges.push({ start: match.index!, end: match.index! + match[0].length, term });
  }
  // The longest phrase at each location owns its box; never duplicate overlapping text.
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const selected: typeof ranges = [];
  for (const range of ranges) {
    if (!selected.length || selected[selected.length - 1].end <= range.start) selected.push(range);
  }
  const result: KeywordDiffToken[] = [];
  let offset = 0;
  for (const part of parts) {
    const end = offset + part.text.length;
    let cursor = offset;
    for (const range of selected) {
      if (range.end <= cursor || range.start >= end) continue;
      if (range.start > cursor) result.push({ text: text.slice(cursor, range.start), changed: part.changed });
      const start = Math.max(cursor, range.start), stop = Math.min(end, range.end);
      const previous = result[result.length - 1];
      if (start > range.start && previous?.keyword === range.term) previous.text += text.slice(start, stop);
      else result.push({ text: text.slice(start, stop), changed: true, keyword: range.term });
      cursor = stop;
    }
    if (cursor < end) result.push({ text: text.slice(cursor, end), changed: part.changed });
    offset = end;
  }
  return result;
}

export function isSkillsReorder(before: string, after: string): boolean {
  const parse = (text: string) => {
    const colon = text.indexOf(":");
    return { heading: text.slice(0, colon).trim(), items: text.slice(colon + 1).split(",").map(item => item.trim()).filter(Boolean), colon };
  };
  const original = parse(before), tailored = parse(after);
  return original.colon > 0 && tailored.colon > 0 && original.heading === tailored.heading
    && original.items.length > 1 && original.items.join("\n") !== tailored.items.join("\n")
    && [...original.items].sort().join("\n") === [...tailored.items].sort().join("\n");
}
