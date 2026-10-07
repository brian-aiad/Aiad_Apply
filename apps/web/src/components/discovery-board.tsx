"use client";
import { discoveryViewSearch, readDiscoveryView, type DiscoveryView } from "@/lib/discovery/view-state";
import { requiredQualifications } from "@/lib/discovery/requirements";
import { formatJobLocation } from "@/lib/format";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ExternalLink, LoaderCircle, MapPin, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { DISCOVERY_SOURCES, LOCAL_SEARCHES } from "@/lib/discovery/sources";
import { DEFAULT_AUTOMATION, TARGET_ROLES } from "@/lib/discovery/types";
import type { AutomationPreferences, DiscoveryPreferences, Opening, ScanSummary } from "@/lib/discovery/types";
import { formatInTimeZone } from "date-fns-tz";
import { postedWithin, postingDateLabel } from "@/lib/discovery/freshness";
import { shiftDate } from "@/lib/accountability";

export type Posting = Omit<Opening, "postedAt"> & {
  id: string; postedAt: string | null; distanceMiles: number | null; score: number; matchReasons: string[]; cautions: string[]; qualified: boolean;
  active: boolean; excluded: boolean; firstSeenAt: string; lastSeenAt: string; dismissedAt: string | null; approvedApplicationId: string | null;
};
export type DiscoveryData = { postings: Posting[]; preferences: DiscoveryPreferences; scan: ScanSummary | null; automation?: AutomationPreferences; automationState?: { checkedAt: string; queued: number; messages: string[] } | null; integrations?: { key: string; label: string; enabled: boolean; message: string; url: string }[] };
type Tab = "all" | "matches" | "review" | "approved" | "dismissed";

export function DiscoveryBoard({ initial, initialView = readDiscoveryView(new URLSearchParams()) }: { initial: DiscoveryData; initialView?: DiscoveryView }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [automation, setAutomation] = useState(initial.automation ?? DEFAULT_AUTOMATION);
  const [tab, setTab] = useState<Tab>(initialView.tab);
  const [period, setPeriod] = useState(initialView.period);
  const [rtxLocal, setRtxLocal] = useState(initialView.rtxLocal);
  const [rtxRemote, setRtxRemote] = useState(initialView.rtxRemote);
  const [sort, setSort] = useState<DiscoveryView["sort"]>(initialView.sort);
  const [channel, setChannel] = useState<"local" | "rtx">(initialView.channel);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(initialView.query);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState(initial.preferences);
  const [showPreferences, setShowPreferences] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const search = discoveryViewSearch({ channel, tab, period, sort, query, rtxLocal, rtxRemote });
    window.history.replaceState(window.history.state, "", `/discover${search ? `?${search}` : ""}`);
  }, [channel, tab, period, sort, query, rtxLocal, rtxRemote]);

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

  async function saveAutomation() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/discovery/automation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(automation) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save automation.");
      await reload(); setMessage("Automation saved. The running local worker checks the schedule every 15 minutes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save automation."); }
    finally { setBusy(false); }
  }

  async function processSelected(tailor: boolean) {
    const ids = visible.filter((p) => selected.includes(p.id) && !p.approvedApplicationId && !p.dismissedAt && !p.excluded).map((p) => p.id);
    if (!ids.length) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/discovery/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, tailor }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not queue selected jobs.");
      const results = payload.results as { postingId: string; duplicate?: boolean; error?: string }[];
      const errors = results.filter((r) => r.error);
      setSelected((previous) => previous.filter((id) => !results.some((r) => r.postingId === id && !r.error)));
      await reload();
      setMessage(`${results.filter((r) => !r.error && !r.duplicate).length} ${tailor ? "drafts queued" : "jobs saved"}. ${results.filter((r) => r.duplicate).length} already saved. Review progress in Applications.`);
      if (errors.length) setError(errors.map((r) => r.error).join(" "));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not queue selected jobs."); }
    finally { setBusy(false); }
  }
  async function copyReferrals() {
    const picks = referralPicks;
    if (!picks.length) return;
    try {
      await navigator.clipboard.writeText(picks.map((p) => `${p.externalId} — ${p.title}
${p.company} · ${p.location}
${p.sourceUrl}`).join("\n\n"));
      setMessage(`${picks.length} referral ${picks.length === 1 ? "opening" : "openings"} copied. Review the business unit with your connection.`);
    } catch { setError("Clipboard access failed. Copy the job IDs and employer links from the cards."); }
  }
  const today = formatInTimeZone(now, "America/Los_Angeles", "yyyy-MM-dd");
  const weekStart = shiftDate(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const assessed = data.postings.filter((p) => {
    if (channel === "rtx" ? p.sourceKey !== "rtx:california" || !postedWithin(p.postedAt, 21, now) : p.sourceKey === "rtx:california") return false;
    if (channel === "rtx" && rtxLocal && !(rtxRemote && p.workArrangement === "Remote") && (p.distanceMiles === null || p.distanceMiles > data.preferences.radiusMiles)) return false;
    if (query && !`${p.externalId} ${p.company} ${p.title} ${p.location} ${p.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (channel === "local" && /^\d+$/.test(period) && !postedWithin(p.postedAt, Number(period), now)) return false;
    if (channel === "local" && period === "undated" && p.postedAt) return false;
    if (channel === "local" && period === "today" && formatInTimeZone(new Date(p.firstSeenAt), "America/Los_Angeles", "yyyy-MM-dd") !== today) return false;
    if (channel === "local" && period === "week" && formatInTimeZone(new Date(p.firstSeenAt), "America/Los_Angeles", "yyyy-MM-dd") < weekStart) return false;
    return true;
  });
  const eligible = assessed.filter((p) => p.active && !p.excluded && !p.dismissedAt && !p.approvedApplicationId);
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const tabCounts = { all: eligible.length, matches: eligible.filter((p) => p.qualified).length, review: eligible.filter((p) => !p.qualified).length, approved: assessed.filter((p) => p.approvedApplicationId).length, dismissed: assessed.filter((p) => p.dismissedAt).length };
  const visible = assessed.filter((p) => {
    if (tab === "dismissed" ? !p.dismissedAt : tab === "approved" ? !p.approvedApplicationId : !eligibleIds.has(p.id)) return false;
    return !(tab === "matches" && !p.qualified || tab === "review" && p.qualified);
  }).sort((a, b) => {
    if (sort === "newest") return new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime() || b.score - a.score;
    if (sort === "nearest") return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) || b.score - a.score;
    return Number(b.qualified) - Number(a.qualified) || b.score - a.score || new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime();
  });
  const referralPicks = data.postings.filter((p) => selected.includes(p.id) && p.active && !p.excluded && !p.dismissedAt && p.sourceKey === "rtx:california" && postedWithin(p.postedAt, 21, now));
  const selectedVisible = visible.filter((p) => selected.includes(p.id) && !p.approvedApplicationId && !p.dismissedAt && !p.excluded);
  const failures = data.scan?.sources.filter((s) => s.status !== "ok").length ?? 0;

  return <div className="discovery-workspace">
    <div className="page-heading heading-row"><div><h1 className="page-title">Discover</h1><p className="page-copy">Review fresh openings, save promising roles, and prepare your next application.</p></div><button className="button button-quiet" type="button" disabled={busy || scanRunning} onClick={refresh}>{busy || scanRunning ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}{busy || scanRunning ? "Checking openings…" : "Refresh openings"}</button></div>
    <div className="discovery-channels" role="group" aria-label="Job search channel">
      <button className={channel === "local" ? "channel-active" : ""} aria-pressed={channel === "local"} onClick={() => { setChannel("local"); setTab("all"); setSelected([]); }}>Local opportunities<span>Support, IT & adjacent roles</span></button>
      <button className={channel === "rtx" ? "channel-active" : ""} aria-pressed={channel === "rtx"} onClick={() => { setChannel("rtx"); setTab("all"); setSelected([]); }}>Raytheon / RTX referrals<span>California · posted within 21 days</span></button>
    </div>
    {channel === "rtx" ? <section className="panel referral-brief"><div><div className="eyebrow">Your referral shortlist</div><h2>Entry routes worth a referral.</h2><p>Support, IT and adjacent analyst or operations roles. Experienced engineering and known eligibility barriers are filtered out. RTX includes Collins Aerospace and Pratt & Whitney; check which business your contact can refer into.</p><p className="field-help">Employer posting dates only · Applicant counts unavailable · {data.preferences.usCitizen ? "U.S. citizen confirmed" : "Citizenship unconfirmed"} · {data.preferences.clearance === "none" ? "No active clearance" : "Verify clearance requirements"}</p><label className="checkbox-label"><input type="checkbox" checked={rtxLocal} onChange={(e) => setRtxLocal(e.target.checked)} />Prioritize worksites within {data.preferences.radiusMiles} miles of Seal Beach</label><label className="checkbox-label"><input type="checkbox" checked={rtxRemote} onChange={(e) => setRtxRemote(e.target.checked)} />Also show California remote roles</label></div><div className="referral-actions"><button className="button button-primary" disabled={!referralPicks.length} onClick={copyReferrals}>Copy referral list ({referralPicks.length})</button>{selected.length ? <button className="button button-quiet" onClick={() => setSelected([])}>Clear shortlist</button> : null}</div></section> : null}
    {channel === "local" ? <section className="search-brief panel"><div className="search-brief-main"><MapPin size={19} /><div><strong>Seal Beach, 90740 <span>· {data.preferences.radiusMiles}-mile radius</span></strong><p>Full-time · ${(data.preferences.minimumSalary / 1000).toFixed(0)}k+ / year · ${(data.preferences.minimumSalary / 2080).toFixed(2)}+ / hour{data.preferences.includeRemote ? " · Remote included" : " · Local & hybrid"}</p></div><button className="button button-quiet" onClick={() => setShowPreferences(!showPreferences)} aria-expanded={showPreferences} aria-controls="discovery-preferences"><SlidersHorizontal size={15} />Preferences</button></div></section> : null}
    {showPreferences ? <section className="panel discovery-preferences" id="discovery-preferences"><h2 className="panel-title">Search preferences</h2><div className="target-roles">{TARGET_ROLES.map((role) => <span key={role}>{role}</span>)}</div><div className="preference-fields"><label>Minimum annual salary<input className="input" type="number" min={60000} max={300000} step={1000} value={preferences.minimumSalary} onChange={(e) => setPreferences({ ...preferences, minimumSalary: Number(e.target.value) })} /></label><label>Radius from Seal Beach<input className="input" type="number" min={1} max={30} value={preferences.radiusMiles} onChange={(e) => setPreferences({ ...preferences, radiusMiles: Number(e.target.value) })} /></label><label className="checkbox-label"><input type="checkbox" checked={preferences.includeRemote} onChange={(e) => setPreferences({ ...preferences, includeRemote: e.target.checked })} />Include remote roles</label></div><button className="button button-primary" disabled={busy} onClick={savePreferences}>Save preferences</button></section> : null}
    <div className="discovery-status"><span>{scanRunning ? "Searching employer boards…" : data.scan?.completedAt ? `Last checked ${formatInTimeZone(new Date(data.scan.completedAt), "America/Los_Angeles", "MMM d, h:mm a")} Pacific` : "No search completed yet"}</span><span>{DISCOVERY_SOURCES.length} employer boards · {failures ? `${failures} need attention` : "Direct employer feeds"}</span></div>
    {message ? <div className="notice" role="status">{message}</div> : null}{error ? <div className="notice notice-error" role="alert">{error}</div> : null}
    <div className="discovery-toolbar"><div className="filter-row" role="group" aria-label="Filter discovered jobs">{([["all", "All openings"], ["matches", "Matches"], ["review", "Needs a closer look"], ["approved", "Approved"], ["dismissed", "Dismissed"]] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" className={tab === key ? "filter-chip filter-chip-active" : "filter-chip"} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}<span>{tabCounts[key]}</span></button>)}</div><div className="discovery-search"><label className="search-field"><Search size={15} /><span className="sr-only">Search discovered jobs</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, company, city or skill" maxLength={200} />{query ? <button type="button" aria-label="Clear job search" onClick={() => setQuery("")}><X size={14} /></button> : null}</label><select className="select" aria-label="Discovery time period" disabled={channel === "rtx"} value={channel === "rtx" ? "21" : period} onChange={(e) => setPeriod(e.target.value)}><option value="21">Posted within 21 days</option><option value="7">Posted within 7 days</option><option value="3">Posted within 3 days</option><option value="undated">Posting date unknown</option><option value="active">All active openings</option><option value="today">First found today</option><option value="week">First found this week</option></select></div></div>
    <div className="discovery-results-row"><div className="discovery-results" aria-live="polite">{visible.length} {visible.length === 1 ? "opening" : "openings"}{tab === "review" ? " · Verify the flagged requirements before tailoring." : " · Prioritized by career fit. Applicant counts unavailable."}</div><select className="select discovery-sort" aria-label="Sort openings" value={sort} onChange={(e) => setSort(e.target.value as DiscoveryView["sort"])}><option value="fit">Best career fit</option><option value="newest">Newest posted</option><option value="nearest">Nearest worksite</option></select></div>
    {selected.length && (channel !== "rtx" || selectedVisible.length > 0) ? <div className="selection-bar"><span>{selected.length} selected · up to 10 per batch</span><div><button className="button button-quiet" onClick={() => setSelected([])}>Clear selection</button><button className="button button-quiet" disabled={busy || selectedVisible.length === 0 || selectedVisible.length > 10} onClick={() => processSelected(false)}>Save selected</button><button className="button button-primary" disabled={busy || selectedVisible.length === 0 || selectedVisible.length > 10} onClick={() => processSelected(true)}>Tailor selected ({selectedVisible.length})</button></div></div> : null}
    <div className="opening-list">{visible.map((posting) => {
      const excerpt = posting.sourceKey.startsWith("adzuna:");
      const qualifications = requiredQualifications(posting.description).slice(0, 5);
      const stale = now.getTime() - new Date(posting.lastSeenAt).getTime() > 48 * 3600000;
      return <article className="panel opening-card" key={posting.id}><div className="opening-heading"><div><span className="opening-company">{posting.company}</span>{(!posting.approvedApplicationId || channel === "rtx") && !posting.excluded && !posting.dismissedAt && !excerpt ? <label className="referral-pick"><input type="checkbox" checked={selected.includes(posting.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, posting.id] : selected.filter((id) => id !== posting.id))} />{channel === "rtx" ? `Shortlist · Job ${posting.externalId}` : "Select for tailoring"}</label> : null}<h2>{posting.title}</h2></div><span className={`status ${posting.qualified ? "status-green" : "status-amber"}`}>{posting.excluded ? "Outside current criteria" : posting.qualified ? "Matches your criteria" : "Check requirements"}</span></div><div className="opening-meta"><span><MapPin size={13} />{formatJobLocation(posting.location)}{posting.distanceMiles !== null ? ` · ≈${posting.distanceMiles} mi` : ""}</span><span>{posting.salaryText || "Pay not listed"}</span><span>{posting.employmentType}</span>{posting.workArrangement !== "Not listed" ? <span>{posting.workArrangement}</span> : null}</div><div className="opening-assessment">{posting.excluded && posting.approvedApplicationId ? <p className="opening-watch">Previously saved; retained for history. Excluded from current recommendations and referral selection.</p> : null}<p className="opening-fit">{posting.matchReasons[0] || "Review the role against your experience"}</p>{posting.cautions[0] ? <p className="opening-watch">{posting.cautions[0]}</p> : null}{posting.matchReasons.length > 1 || posting.cautions.length > 1 ? <details className="fit-details"><summary>Fit details{posting.cautions.length > 1 ? ` · ${posting.cautions.length} checks` : ""}<ChevronDown size={13} /></summary><ul className="opening-evidence">{posting.matchReasons.slice(1).map((reason) => <li key={reason}>{reason}</li>)}</ul>{posting.cautions.length > 1 ? <ul className="opening-cautions">{posting.cautions.slice(1).map((c) => <li key={c}>{c}</li>)}</ul> : null}<p className="field-help">Ranking helps prioritize review; it is not a probability of being hired. Proposed resume technologies do not count as experience.</p></details> : null}</div>{stale || !posting.active ? <p className="error-text">{!posting.active ? "No longer listed by the source." : "Last check is over two days old. Refresh before approving."}</p> : null}{qualifications.length ? <details className="posting-requirements"><summary>Key qualifications<ChevronDown size={14} /></summary><ul>{qualifications.map((qualification, index) => <li key={index}>{qualification}</li>)}</ul><p className="field-help">Excerpt from the employer’s requirements. Read the full posting for all conditions.</p></details> : null}<details className="posting-description"><summary>Read the job description<ChevronDown size={14} /></summary><div>{posting.description}</div></details><div className="opening-footer"><a className="text-link" href={posting.sourceUrl} target="_blank" rel="noopener noreferrer">{posting.sourceKey.startsWith("jobicy:") ? "Source: Jobicy" : excerpt ? "Source: Adzuna" : posting.sourceKey.startsWith("usajobs:") ? "Source: USAJOBS" : "Employer posting"} <ExternalLink size={13} /></a><div className="opening-actions">{posting.approvedApplicationId ? <Link className="button button-primary" href={`/applications/${posting.approvedApplicationId}`}>Open application<ArrowRight size={14} /></Link> : posting.dismissedAt ? <button className="button button-quiet" disabled={actionId !== null} onClick={() => act(posting, "restore")}>Restore opening</button> : excerpt ? <Link className="button button-primary" href={`/capture?sourceUrl=${encodeURIComponent(posting.sourceUrl)}`}>Capture full posting<ArrowRight size={14} /></Link> : <><button className="button button-quiet" disabled={actionId !== null} onClick={() => act(posting, "dismiss")}>Dismiss</button><button className="button button-quiet" disabled={actionId !== null || stale || !posting.active} onClick={() => act(posting, "approve")}>Save job</button><button className="button button-primary" disabled={actionId !== null || stale || !posting.active} onClick={() => act(posting, "approve", true)}>{actionId === posting.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Tailor resume</button></>}</div></div><p className="posting-date">{posting.postedAt ? `Posted ${postingDateLabel(posting.postedAt)} · ` : "Posting date not supplied · "}First found {formatInTimeZone(new Date(posting.firstSeenAt), "America/Los_Angeles", "MMM d")} · Checked {formatInTimeZone(new Date(posting.lastSeenAt), "America/Los_Angeles", "MMM d, h:mm a")}</p></article>;
    })}</div>
    {!visible.length ? <div className="panel discovery-empty"><Search size={27} /><h2>{scanRunning ? "Checking your local job market" : "No openings in this view"}</h2><p>{scanRunning ? "The first search can take a minute. Results will appear here as sources finish." : channel === "rtx" ? "No suitable entry routes meet these filters right now. Try statewide California, or check again after the next search. Experienced engineering and known eligibility barriers stay excluded." : "Try another filter or refresh the employer boards. Jobs with missing salary or employment details appear under Needs a closer look."}</p><button type="button" className="button button-quiet" onClick={() => { setTab("all"); setPeriod("active"); setQuery(""); if (channel === "rtx") setRtxLocal(false); }}> {channel === "rtx" ? "Show statewide entry routes" : "Show all openings"}</button></div> : null}
    <details className="panel discovery-automation">
      <summary>Search schedule & automatic drafts<ChevronDown size={16} /></summary>
      <p className="secondary">Searches run while your local worker is running, even with this browser closed. Automatic drafts use your tailoring allowance and always wait for your review before applying.</p>
      <div className="preference-fields">
        <label className="checkbox-label"><input type="checkbox" checked={automation.scheduledSearch} onChange={(e) => setAutomation({ ...automation, scheduledSearch: e.target.checked })} />Search on a schedule</label>
        <label>Search every (hours)<input className="input" type="number" min={4} max={24} value={automation.intervalHours} onChange={(e) => setAutomation({ ...automation, intervalHours: Number(e.target.value) })} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={automation.autoTailor} onChange={(e) => setAutomation({ ...automation, autoTailor: e.target.checked })} />Automatically draft strong matches</label>
        <label>Maximum drafts per day<input className="input" type="number" min={1} max={5} value={automation.dailyLimit} onChange={(e) => setAutomation({ ...automation, dailyLimit: Number(e.target.value) })} /></label>
        <label>Minimum match score<input className="input" type="number" min={75} max={100} value={automation.minimumScore} onChange={(e) => setAutomation({ ...automation, minimumScore: Number(e.target.value) })} /></label>
      </div>
      <p className="field-help">Only complete, recently checked postings published within 14 days, with no flagged requirements, qualify. Daily limits use Pacific time and apply across your computers. Missing posting dates and federal openings stay in manual review.</p>
      <button className="button button-primary" type="button" disabled={busy} onClick={saveAutomation}>Save automation</button>
      {data.automationState ? <p className="field-help">Last schedule check {formatInTimeZone(new Date(data.automationState.checkedAt), "America/Los_Angeles", "MMM d, h:mm a")} · {data.automationState.queued} drafts queued{data.automationState.messages.length ? ` · ${data.automationState.messages[0]}` : ""}</p> : <p className="field-help">The worker has not checked the schedule yet.</p>}
    </details>
    <section className="discovery-sources"><h2 className="section-title">Look beyond the usual boards</h2><p className="secondary">These local employers and staffing services require a manual search. Paste any promising posting into Capture job.</p><div className="local-sources">{LOCAL_SEARCHES.map((source) => <a className="panel local-source" href={source.url} key={source.name} target="_blank" rel="noopener noreferrer"><span className="eyebrow">{source.category}</span><strong>{source.name}<ExternalLink size={14} /></strong><p>{source.note}</p><span className="text-link">Browse careers <ArrowRight size={14} /></span></a>)}</div></section>
    <details className="panel source-health"><summary>Additional job sources & title matching<ChevronDown size={15} /></summary><div>{data.integrations?.map((item) => <div className="source-health-row" key={item.key}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}<small>{item.enabled ? "Connected" : "API credentials needed"}</small></a><span>{item.message}</span></div>)}</div><p className="field-help">Occupation titles adapted from O*NET, U.S. Department of Labor, under CC BY 4.0. Jobicy public results are delayed and cover recent remote postings; its source link is retained.</p></details>
    <details className="panel source-health"><summary>Automated sources & search coverage<ChevronDown size={15} /></summary><p className="field-help">This is a curated set of employer boards, not every opening in the area. Opening Today or Discover checks whether a search is due. Scheduled searches also run through your local worker. A closed browser does not stop the worker; a sleeping or powered-off computer does.</p><div>{DISCOVERY_SOURCES.map((source) => { const result = data.scan?.sources.find((s) => s.sourceKey === source.key); return <div className="source-health-row" key={source.key}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.company}<small>{source.provider}</small></a><span>{result ? result.status === "ok" ? `${result.checked} checked · ${result.found} relevant` : result.message : "Not checked yet"}</span></div>; })}</div>{data.scan?.sources.filter((result) => !DISCOVERY_SOURCES.some((source) => source.key === result.sourceKey)).map((result) => <div className="source-health-row" key={result.sourceKey}><strong>{result.company}</strong><span>{result.status === "ok" ? `${result.checked} checked · ${result.found} relevant` : result.message}</span></div>)}</details>
  </div>;
}
