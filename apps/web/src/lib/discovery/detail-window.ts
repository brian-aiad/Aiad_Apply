/** Shared, bounded detail progress. Numeric source IDs are ordered independently
 * of feed order so a restarted worker resumes the same cycle. */
export function detailWindow(values: string[], state: unknown, limit = 12) {
  const ids = [...new Set(values.filter(id => /^\d{1,20}$/.test(id)))].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const saved = state && typeof state === "object" && "lastId" in state && "version" in state && state.version === 1 ? state.lastId : null;
  const last = typeof saved === "string" && /^\d{1,20}$/.test(saved) ? saved : null;
  const remaining = last ? ids.filter(id => id.length > last.length || id.length === last.length && id > last) : ids;
  const selected = remaining.slice(0, limit);
  const moreDetails = remaining.length > selected.length;
  return { ids: selected, moreDetails, nextState: moreDetails ? { version: 1, lastId: selected.at(-1)! } : null };
}

export function isSourceAccessError(error: unknown) {
  return error instanceof Error && /HTTP\s*(?:401|403|429)|captcha|access (?:denied|restricted)|sign[ -]?in required/i.test(error.message);
}
