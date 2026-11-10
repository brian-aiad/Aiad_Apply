import type { ScanSummary, SourceResult } from "./types";

const RETRY_MS = 15 * 60_000;

function retryable(source: SourceResult) {
  return source.status !== "ok" && source.continuationPending !== false && !/HTTP\s*(?:401|403|429)|captcha|access (?:denied|restricted)|sign[ -]?in required/i.test(source.message || "");
}

/** The oldest source check owns the regular schedule; partial retries cannot
 * postpone successful boards indefinitely. */
export function nextRegularDiscoveryAt(previous:ScanSummary|null,intervalHours:number){
 if(!previous)return null;
 const fallback=Date.parse(previous.completedAt||previous.startedAt);
 const checked=previous.sources.map(s=>Date.parse(s.checkedAt||previous.completedAt||previous.startedAt)).filter(Number.isFinite);
 const first=checked.length?Math.min(...checked):fallback;
 return Number.isFinite(first)?first+intervalHours*3600000:null;
}

export function discoveryScanDue(previous: ScanSummary | null, intervalHours: number, force: boolean, now = Date.now()) {
  if (!previous) return true;
  const age = now - Date.parse(previous.startedAt);
  if (!Number.isFinite(age)) return true;
  if (previous.status === "running") return age >= 180_000;
  if (force) return age >= 60_000;
  const next=nextRegularDiscoveryAt(previous,intervalHours);
  if(next!==null&&now>=next)return true;
  if (age >= intervalHours * 3_600_000) return true;
  return age >= RETRY_MS && (previous.sources.some(retryable) || previous.status === "failed" && !previous.sources.length);
}

/** Resume incomplete public scans without re-fetching successful boards or bypassing access holds. */
export function discoverySourceDue(key: string, previous: ScanSummary | null, intervalHours: number, force: boolean, now = Date.now()) {
  if (!previous) return true;
  const source = previous.sources.find(s => s.sourceKey === key);
  if (!source) return true;
  const checked = Date.parse(source.checkedAt || previous.completedAt || previous.startedAt);
  if (!Number.isFinite(checked) || now - checked >= intervalHours * 3_600_000) return true;
  // Explicit refresh can revisit healthy feeds, but cannot bypass a provider
  // access/rate hold within its normal collection interval.
  if (/HTTP\s*(?:401|403|429)|captcha|access (?:denied|restricted)|sign[ -]?in required/i.test(source.message || "")) return false;
  return force || previous.status === "running" || retryable(source);
}
