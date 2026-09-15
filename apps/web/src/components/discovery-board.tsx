"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ExternalLink, LoaderCircle, MapPin, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { DISCOVERY_SOURCES, LOCAL_SEARCHES } from "@/lib/discovery/sources";
import { TARGET_ROLES } from "@/lib/discovery/types";
import type { DiscoveryPreferences, Opening, ScanSummary } from "@/lib/discovery/types";
import { formatInTimeZone } from "date-fns-tz";
import { shiftDate } from "@/lib/accountability";

export type Posting = Omit<Opening, "postedAt"> & {
  id: string; postedAt: string | null; distanceMiles: number | null; score: number; matchReasons: string[]; cautions: string[]; qualified: boolean;
  active: boolean; excluded: boolean; firstSeenAt: string; lastSeenAt: string; dismissedAt: string | null; approvedApplicationId: string | null;
};
export type DiscoveryData = { postings: Posting[]; preferences: DiscoveryPreferences; scan: ScanSummary | null };
type Tab = "all" | "matches" | "review" | "approved" | "dismissed";

export function DiscoveryBoard({ initial }: { initial: DiscoveryData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [period, setPeriod] = useState("active");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState(initial.preferences);
  const [showPreferences, setShowPreferences] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const scanRunning = data.scan?.status === "running" && now.getTime() - new Date(data.scan.startedAt).getTime() < 180_000;
  useEffect(() => {
    // Observe searches started on Today or another device; server remains authoritative.
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/discovery", { cache: "no-store" });
        if (response.ok) { setData(await response.json()); setNow(new Date()); }
      } catch { /* Keep the last successfully loaded feed. */ }
    }, scanRunning ? 4000 : 30000);
    return () => window.clearInterval(timer);
  }, [scanRunning]);

  async function reload() {
    const response = await fetch("/api/discovery", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not reload saved openings. Try again.");
    setData(await response.json()); setNow(new Date());
  }
  async function refresh() {
    setBusy(true); setError(""); setMessage("Checking employer career pages. Your saved decisions will stay in place.");
    try {
      const response = await fetch("/api/discovery/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Search failed. Try again.");
      await reload();
      setMessage(result.reason === "running" ? "A search is already running. Results will appear here automatically." : result.reason === "fresh" ? "These results were checked less than a minute ago." : result.scan?.status === "failed" ? "Sources could not be reached. Previous results are still available; check source status below." : `Search complete. ${result.scan?.found ?? 0} relevant openings found across the checked sources.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Search unavailable."); setMessage(""); }
    finally { setBusy(false); }
  }
  async function act(posting: Posting, action: "approve" | "dismiss" | "restore", tailor = false) {
    setActionId(posting.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/discovery/${posting.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, tailor }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this decision.");
      if (action === "approve" && tailor && result.id) {
        router.push(`/applications/${result.id}`);
        return;
      }
      await reload();
      setMessage(action === "approve" ? result.duplicate ? "This job is already in Applications. No duplicate was created." : tailor ? "Approved. Tailoring is queued; the local worker will process it when running." : "Approved and saved to Applications. You can tailor it when ready." : action === "dismiss" ? "Hidden from your feed. You can restore it from Dismissed." : "Restored to your feed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your decision."); }
    finally { setActionId(null); }
  }
  async function savePreferences() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/discovery/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save preferences.");
      await reload(); setShowPreferences(false); setMessage("Preferences saved. Refresh openings to check additional locations or remote roles.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save preferences."); }
    finally { setBusy(false); }
  }

  const assessed = data.postings;
  const eligible = assessed.filter((p) => p.active && !p.excluded && !p.dismissedAt && !p.approvedApplicationId);
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const tabCounts = { all: eligible.length, matches: eligible.filter((p) => p.qualified).length, review: eligible.filter((p) => !p.qualified).length, approved: assessed.filter((p) => p.approvedApplicationId).length, dismissed: assessed.filter((p) => p.dismissedAt).length };
  const today = formatInTimeZone(now, "America/Los_Angeles", "yyyy-MM-dd");
  const weekStart = shiftDate(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const visible = assessed.filter((p) => {
    if (tab === "dismissed" ? !p.dismissedAt : tab === "approved" ? !p.approvedApplicationId : !eligibleIds.has(p.id)) return false;
    if (tab === "matches" && !p.qualified || tab === "review" && p.qualified) return false;
    if (query && !`${p.company} ${p.title} ${p.location}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (period === "today" && formatInTimeZone(new Date(p.firstSeenAt), "America/Los_Angeles", "yyyy-MM-dd") !== today) return false;
    if (period === "week" && formatInTimeZone(new Date(p.firstSeenAt), "America/Los_Angeles", "yyyy-MM-dd") < weekStart) return false;
    return true;
  }).sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.score - a.score);
  const failures = data.scan?.sources.filter((s) => s.status !== "ok").length ?? 0;

  return <>
    <div className="page-heading heading-row"><div><div className="eyebrow">Your next opportunity</div><h1 className="page-title">Discover</h1><p className="page-copy">Local openings with a reason to look closer. You decide what gets tailored.</p></div><button className="button button-primary" type="button" disabled={busy || scanRunning} onClick={refresh}>{busy || scanRunning ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}{busy || scanRunning ? "Checking openings…" : "Refresh openings"}</button></div>
    <section className="search-brief panel"><div className="search-brief-main"><MapPin size={19} /><div><strong>Seal Beach, 90740 <span>· {data.preferences.radiusMiles}-mile radius</span></strong><p>Full-time · ${(data.preferences.minimumSalary / 1000).toFixed(0)}k+ / year · ${(data.preferences.minimumSalary / 2080).toFixed(2)}+ / hour{data.preferences.includeRemote ? " · Remote included" : " · Local & hybrid"}</p></div><button className="button button-quiet" onClick={() => setShowPreferences(!showPreferences)} aria-expanded={showPreferences} aria-controls="discovery-preferences"><SlidersHorizontal size={15} />Preferences</button></div><div className="target-roles">{TARGET_ROLES.map((role) => <span key={role}>{role}</span>)}</div><p className="field-help">Distances use city centres, not driving routes. Check the exact worksite and commute before approving.</p></section>
    {showPreferences ? <section className="panel discovery-preferences" id="discovery-preferences"><h2 className="panel-title">Search preferences</h2><div className="preference-fields"><label>Minimum annual salary<input className="input" type="number" min={60000} max={300000} step={1000} value={preferences.minimumSalary} onChange={(e) => setPreferences({ ...preferences, minimumSalary: Number(e.target.value) })} /></label><label>Radius from Seal Beach<input className="input" type="number" min={1} max={30} value={preferences.radiusMiles} onChange={(e) => setPreferences({ ...preferences, radiusMiles: Number(e.target.value) })} /></label><label className="checkbox-label"><input type="checkbox" checked={preferences.includeRemote} onChange={(e) => setPreferences({ ...preferences, includeRemote: e.target.checked })} />Include remote roles</label></div><button className="button button-primary" disabled={busy} onClick={savePreferences}>Save preferences</button></section> : null}
    <div className="discovery-status"><span>{scanRunning ? "Searching employer boards…" : data.scan?.completedAt ? `Last checked ${formatInTimeZone(new Date(data.scan.completedAt), "America/Los_Angeles", "MMM d, h:mm a")} Pacific` : "No search completed yet"}</span><span>{DISCOVERY_SOURCES.length} employer boards · {failures ? `${failures} need attention` : "Four hiring platforms"}</span></div>
    {message ? <div className="notice" role="status">{message}</div> : null}{error ? <div className="notice notice-error" role="alert">{error}</div> : null}
    <div className="discovery-toolbar"><div className="filter-row" role="group" aria-label="Filter discovered jobs">{([["all", "All openings"], ["matches", "Matches"], ["review", "Needs a closer look"], ["approved", "Approved"], ["dismissed", "Dismissed"]] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" className={tab === key ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}<span>{tabCounts[key]}</span></button>)}</div><div className="discovery-search"><label className="search-field"><Search size={15} /><span className="sr-only">Search discovered jobs</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Role, company, or city" />{query ? <button type="button" aria-label="Clear job search" onClick={() => setQuery("")}><X size={14} /></button> : null}</label><select className="select" aria-label="Discovery time period" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="active">All active openings</option><option value="today">First found today</option><option value="week">First found this week</option></select></div></div>
    <div className="discovery-results" aria-live="polite">{visible.length} {visible.length === 1 ? "opening" : "openings"}{tab === "review" ? " · Verify the flagged requirements before tailoring." : " · Ranked by documented resume overlap."}</div>
    <div className="opening-list">{visible.map((posting) => {
      const stale = now.getTime() - new Date(posting.lastSeenAt).getTime() > 48 * 3600000;
      return <article className="panel opening-card" key={posting.id}><div className="opening-heading"><div><span className="opening-company">{posting.company}</span><h2>{posting.title}</h2></div><span className={`status ${posting.qualified ? "status-green" : "status-amber"}`}>{posting.qualified ? "Matches your criteria" : "Check requirements"}</span></div><div className="opening-meta"><span><MapPin size={13} />{posting.location || "Location not listed"}{posting.distanceMiles !== null ? ` · ≈${posting.distanceMiles} mi` : ""}</span><span>{posting.salaryText || "Pay not listed"}</span><span>{posting.employmentType}</span></div><div className="opening-overlap"><span>Resume overlap</span>{posting.matchReasons.map((reason) => <span key={reason} className="skill-tag">{reason}</span>)}</div>{posting.cautions.length ? <ul className="opening-cautions">{posting.cautions.map((c) => <li key={c}>{c}</li>)}</ul> : null}{stale || !posting.active ? <p className="error-text">{!posting.active ? "No longer listed by the source." : "Last check is over two days old. Refresh before approving."}</p> : null}<details className="posting-description"><summary>Read the job description<ChevronDown size={14} /></summary><div>{posting.description}</div></details><div className="opening-footer"><a className="text-link" href={posting.sourceUrl} target="_blank" rel="noopener noreferrer">Employer posting <ExternalLink size={13} /></a><div className="opening-actions">{posting.approvedApplicationId ? <Link className="button button-primary" href={`/applications/${posting.approvedApplicationId}`}>Open application<ArrowRight size={14} /></Link> : posting.dismissedAt ? <button className="button button-quiet" disabled={actionId !== null} onClick={() => act(posting, "restore")}>Restore opening</button> : <><button className="button button-quiet" disabled={actionId !== null} onClick={() => act(posting, "dismiss")}>Dismiss</button><button className="button button-quiet" disabled={actionId !== null || stale || !posting.active} onClick={() => act(posting, "approve")}>Approve & save</button><button className="button button-primary" disabled={actionId !== null || stale || !posting.active} onClick={() => act(posting, "approve", true)}>{actionId === posting.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Approve & tailor</button></>}</div></div><p className="posting-date">{posting.postedAt ? `Posted ${formatInTimeZone(new Date(posting.postedAt), "America/Los_Angeles", "MMM d, yyyy")} · ` : "Posting date not supplied · "}First found {formatInTimeZone(new Date(posting.firstSeenAt), "America/Los_Angeles", "MMM d")} · Checked {formatInTimeZone(new Date(posting.lastSeenAt), "America/Los_Angeles", "MMM d, h:mm a")}</p></article>;
    })}</div>
    {!visible.length ? <div className="panel discovery-empty"><Search size={27} /><h2>{scanRunning ? "Checking your local job market" : "No openings in this view"}</h2><p>{scanRunning ? "The first search can take a minute. Results will appear here as sources finish." : "Try another filter or refresh the employer boards. Jobs with missing salary or employment details appear under Needs a closer look."}</p><button type="button" className="button button-quiet" onClick={() => { setTab("all"); setPeriod("active"); setQuery(""); }}>Show all openings</button></div> : null}
    <section className="discovery-sources"><h2 className="section-title">Look beyond the usual boards</h2><p className="secondary">These local employers and staffing services require a manual search. Paste any promising posting into Capture job.</p><div className="local-sources">{LOCAL_SEARCHES.map((source) => <a className="panel local-source" href={source.url} key={source.name} target="_blank" rel="noopener noreferrer"><span className="eyebrow">{source.category}</span><strong>{source.name}<ExternalLink size={14} /></strong><p>{source.note}</p><span className="text-link">Browse careers <ArrowRight size={14} /></span></a>)}</div></section>
    <details className="panel source-health"><summary>Automated sources & search coverage<ChevronDown size={15} /></summary><p className="field-help">This is a curated set of employer boards, not every opening in the area. The app checks once daily when you open Today or Discover. Manual refresh is also available. Searches do not run while the app is closed.</p><div>{DISCOVERY_SOURCES.map((source) => { const result = data.scan?.sources.find((s) => s.sourceKey === source.key); return <div className="source-health-row" key={source.key}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.company}<small>{source.provider}</small></a><span>{result ? result.status === "ok" ? `${result.checked} checked · ${result.found} relevant` : result.message : "Not checked yet"}</span></div>; })}</div></details>
  </>;
}
