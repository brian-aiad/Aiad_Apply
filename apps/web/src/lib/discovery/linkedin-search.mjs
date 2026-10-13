// Shared by the browser collector and dashboard: retain search filters, not attribution.
export function normalizeLinkedInSearch(value) {
  if (typeof value !== 'string' || value.length > 4000) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !/^(?:www\.)?linkedin\.com$/i.test(url.hostname)
      || url.port || url.username || url.password || !/^\/jobs\/search(?:-results)?\/?$/.test(url.pathname)) return null;
    const clean = new URL(`https://www.linkedin.com${url.pathname}`);
    for (const [key, item] of url.searchParams) {
      if (['keywords', 'geoId', 'location', 'distance', 'sortBy'].includes(key) || /^f_[A-Za-z0-9_]+$/.test(key)) clean.searchParams.set(key, item);
    }
    if (!clean.searchParams.get('keywords')?.trim()) return null;
    clean.searchParams.sort();
    return clean.href;
  } catch { return null; }
}

export function linkedInSearchForWindow(value, window) {
  const normalized = normalizeLinkedInSearch(value);
  if (!normalized || !['day', 'week'].includes(window)) return null;
  const url = new URL(normalized);
  url.searchParams.set('f_TPR', window === 'day' ? 'r86400' : 'r604800');
  return url.href;
}
