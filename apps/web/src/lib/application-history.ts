// Tracking parameters and Greenhouse's two public hosts must not create new jobs.
export function applicationIdentity(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (/^(boards|job-boards)\.greenhouse\.io$/.test(url.hostname)) {
      const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
      if (match) return `greenhouse:${match[1].toLowerCase()}:${match[2]}`;
    }
    // iCIMS embeds the same employer job with viewport/redirect display options.
    // Keep the tenant host and job path; do not discard unknown query parameters.
    if (url.hostname.endsWith(".icims.com") && /^\/jobs\/\d+\/[^/]+\/job\/?$/.test(url.pathname)) {
      for (const key of ["mobile", "width", "height", "bga", "needsRedirect", "jan1offset", "jun1offset"]) url.searchParams.delete(key);
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|gh_src|gh_jid|source|ref|referrer|trackingId)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch { return null; }
}
export function sameEmployer(a: string, b: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/\b(incorporated|inc|llc|corporation|corp|limited|ltd|industries)\b/g, "").replace(/[^a-z0-9]/g, "");
  return !!normalize(a) && normalize(a) === normalize(b);
}
