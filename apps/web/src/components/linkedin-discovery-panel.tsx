"use client";
import { useState } from "react";


type Snapshot = Record<string, unknown> | null;
function detailsList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) : [];
}
function publicDetail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s]+/gi, "[local path]").replace(/Bearer\s+\S+|sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 400);
}
function selectedJobId(value: string) {
  if (/^\d+$/.test(value.trim())) return value.trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname) || url.username || url.password) return "";
    const id = url.pathname.match(/^\/jobs\/view\/(\d+)\/?$/)?.[1] ?? url.searchParams.get("currentJobId") ?? "";
    return /^\d+$/.test(id) ? id : "";
  } catch { return ""; }
}
function timestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Date(value).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";
}
export function LinkedInDiscoveryPanel({ state, config, queue, session, capture, onComplete, now, minimumSalary = 60000, radiusMiles = 30, savedJobs = 0, applicationJobs = 0 }: { capture?: Snapshot; savedJobs?: number; applicationJobs?: number; now: number; state?: Snapshot; config?: Snapshot; queue?: Snapshot; session?: Snapshot; minimumSalary?: number; radiusMiles?: number; onComplete?: () => Promise<void> }) {
  const running = state?.status === "running" && now - Date.parse(String(state.startedAt)) < 15 * 60000;
  const nextAllowed = state?.nextAllowedAt ?? state?.retryAfter;
  const coolingDown = Boolean(nextAllowed && now < Date.parse(String(nextAllowed)));
  const paused = config?.paused === true || config?.enabled === false;
  const queueErrors = detailsList(queue?.errors).length ? detailsList(queue?.errors) : detailsList(state?.queueErrors);
  const errors = [...detailsList(state?.errors), ...queueErrors];
  const diagnostics = detailsList(state?.diagnostics).slice(-20);
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : "—";
  const windows = state?.window === "both" ? "Past day + past week" : state?.window === "day" ? "Past day" : state?.window === "week" ? "Past week" : "Not recorded";
  const [searchUrl, setSearchUrl] = useState(String(config?.preferredSearchUrl || ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [text, setText] = useState("");
  const [inspectionUrl, setInspectionUrl] = useState("");
  const inspectionId = selectedJobId(inspectionUrl);
  const needsInspection = !state?.firstExtractionAt;
  async function act(action: "open" | "scan" | "status" | "pause" | "resume" | "import" | "save-search" | "capture-open-search", window = "both", oneJob?: string) {
    setBusy(true); setMessage(action === "scan" ? oneJob ? "Inspecting one selected LinkedIn job. Progress appears below." : "Checking both LinkedIn search windows. Progress appears below." : "Updating LinkedIn discovery…");
    try {
      const response = await fetch("/api/discovery/linkedin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "save-search" ? { action, searchUrl } : action === "import" ? { action, sourceUrl, ...(applyUrl.trim() ? { applyUrl } : {}), text } : { action, window, ...(oneJob ? { oneJob } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The action could not be completed.");
      setMessage(result.message || result.status || "Updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection interrupted. Check status before trying again."); }
    finally {
      try { await onComplete?.(); } catch { setMessage("Could not refresh status. The action may have completed; check status before retrying."); }
      setBusy(false);
    }
  }
  return <section className="panel linkedin-discovery-panel">
    <div className="heading-row"><div><h2>LinkedIn discovery</h2><p>{paused ? "Automatic collection paused" : "Daily collection enabled"} · up to {Math.min(10, Number(config?.dailyLimit) || 10)} new qualifying jobs tailored per Pacific day.</p></div><button className="button button-quiet" disabled={busy} onClick={() => act(paused ? "resume" : "pause")}>{paused ? "Resume collection" : "Pause collection"}</button></div>
    <p className="field-help">Confirmed starting base pay ${minimumSalary.toLocaleString()}+/year · confirmed worksite within {radiusMiles} miles of Seal Beach · full-time. Documented role fit comes before Premium signals. Approve each tailored resume, then press Auto apply.</p>
    {savedJobs > 0 ? <p className="field-help">{savedJobs} LinkedIn jobs saved in Discover, including assisted imports. {applicationJobs > 0 ? <a className="text-link" href="/discover?channel=linkedin&tab=approved&period=active">View {applicationJobs} saved applications and tailoring progress</a> : null}</p> : null}
    <div className="filter-row"><button className="button button-quiet" disabled={busy || running} onClick={() => act("capture-open-search")}>Capture my open search (Mac)</button><span className="field-help">Reads the list already open in Chrome. Does not open jobs or restart a blocked scan.</span></div>
    {detailsList(capture?.cards).length > 0 ? <details className="linkedin-diagnostics"><summary>{detailsList(capture?.cards).length} captured search cards</summary><p className="field-help">Captured {timestamp(capture?.capturedAt)}. These are search cards, not verified full postings. Completed imports and resumes appear in the saved applications above.</p><ul>{detailsList(capture?.cards).map(card => <li key={String(card.id)}><a className="text-link" href={`https://www.linkedin.com/jobs/view/${/^\d+$/.test(String(card.id)) ? card.id : ""}/`} target="_blank" rel="noopener noreferrer">{publicDetail(card.company)} · {publicDetail(card.title)}</a><span> · {publicDetail(card.location)}{card.topApplicant === true ? " · Top Applicant" : ""}</span></li>)}</ul></details> : null}
    <details><summary>Your preferred LinkedIn search</summary><p className="field-help">{config?.preferredSearchUrl ? "Collection uses your saved search instead of the standard role searches." : "Save the search you already use on LinkedIn to collect those results."} Keywords, location, sorting and filters stay intact; the posting window changes between past day and past week. Results can change as LinkedIn updates them.</p>{typeof config?.preferredSearchUrl === "string" ? <a className="text-link" href={config.preferredSearchUrl} target="_blank" rel="noopener noreferrer">Open saved search</a> : null}<form className="linkedin-import" onSubmit={event => { event.preventDefault(); void act("save-search"); }}><label>Preferred LinkedIn search URL<input className="input" type="url" value={searchUrl} onChange={event => setSearchUrl(event.target.value)} maxLength={4000} placeholder="Paste the address of your LinkedIn search" /></label><button className="button button-quiet" disabled={busy}>Save preferred search</button><p className="field-help">Leave blank and save to restore the standard role searches. Saving does not start a scan or change your cooldown.</p></form></details>
    <dl className="linkedin-scan-times"><div><dt>Last attempted</dt><dd>{timestamp(state?.lastAttemptedAt ?? state?.startedAt)}</dd></div><div><dt>Last successful</dt><dd>{timestamp(state?.lastSuccessfulAt)}</dd></div><div><dt>Next allowed scan</dt><dd>{coolingDown ? timestamp(nextAllowed) : paused ? "Collection paused" : running ? "Scan in progress" : "Available now"}</dd></div></dl>
    <div className="filter-row linkedin-counts">{["imported", "qualified", "queued", "deferred", "duplicates", "excluded", "errors"].map(key => { const value = key === "errors" ? errors : key === "queued" ? state?.queued : queue?.[key] ?? state?.[key]; return <span className="filter-chip" key={key}>{key === "queued" ? "Queued in last scan" : key === "imported" ? "Imported in last scan" : key[0].toUpperCase() + key.slice(1)} <strong>{typeof value === "number" ? value : Array.isArray(value) ? value.length : "—"}</strong></span>; })}</div>
    <details className="linkedin-diagnostics"><summary>Scan details &amp; errors ({errors.length})</summary>
      <p className="field-help">Search windows: {windows}. Counters describe the latest scan; queue activity is tracked separately.</p>
      <dl className="linkedin-scan-times">{[["Inspected", state?.checked], ["Search pages", state?.searchPages], ["Detail pages", state?.detailPages], ["Duplicate detail reads avoided", state?.duplicatesAvoided]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{number(value)}</dd></div>)}<div><dt>Scan duration</dt><dd>{typeof state?.durationMs === "number" ? `${(state.durationMs / 1000).toFixed(1)} seconds` : "Not recorded"}</dd></div></dl>
      <p className="field-help">Latest queue check: {timestamp(queue?.checkedAt)} · Newly queued in that check: {number(queue?.queued)} · Drafts pending across this installation: {number(queue?.pending)} · LinkedIn daily slots used: {number(queue?.usedToday)}</p>
      {errors.length ? <ul>{errors.slice(0, 20).map((item, index) => <li key={index}>{item.postingId ? <>Job {publicDetail(item.postingId)}: </> : null}{publicDetail(item.message) || publicDetail(item.code) || "This item needs attention."}</li>)}</ul> : <p className="field-help">No recorded scan or queue errors.</p>}
      {errors.length > 20 ? <p className="field-help">Showing 20 of {errors.length} errors.</p> : null}
      {diagnostics.length ? <details><summary>Recent collection checks</summary><ul>{diagnostics.map((item, index) => <li key={index}>{publicDetail(item.stage).replaceAll("_", " ") || "Collection check"}{item.externalId ? ` · Job ${publicDetail(item.externalId)}` : ""}{item.message ? ` · ${publicDetail(item.message)}` : ""}{item.window ? ` · ${publicDetail(item.window)}` : ""}{item.stage === "incomplete_detail" ? " · Required posting details could not be read." : ""}</li>)}</ul></details> : null}
    </details>
    <p role="status">{String(state?.status || "Not scanned")} · {String(state?.message || "No successful collection is recorded yet.")}</p>
    <p className="field-help">Browser session: {String(session?.status || "Not checked")}{session?.message ? ` · ${String(session.message)}` : ""}{session?.checkedAt ? ` · ${timestamp(session.checkedAt)}` : ""}</p>
    <p className="field-help">First use: open the separate Chrome browser and sign in once. Its saved session is separate from your everyday browser.</p>
    <div className="filter-row"><button className="button button-quiet" disabled={busy} onClick={() => act("open")}>Open browser / sign in</button><button className="button button-quiet" disabled={busy} onClick={() => act("status")}>Check session</button><button className="button button-primary" disabled={busy || running || coolingDown || paused || needsInspection} onClick={() => act("scan")}>{running ? "Scan in progress…" : "Scan past day + week"}</button></div>
    {needsInspection ? <form className="linkedin-import" onSubmit={event => { event.preventDefault(); if (inspectionId && !busy && !running && !coolingDown && !paused) void act("scan", "day", inspectionId); }}><p className="field-help">Before the first full cycle, inspect one visible job after any cooldown ends. Successful collection of that job unlocks daily + weekly scans. Manual paste remains available.</p><label>First inspection: LinkedIn job URL or job ID<input className="input" value={inspectionUrl} onChange={event => setInspectionUrl(event.target.value)} maxLength={2000} placeholder="https://www.linkedin.com/jobs/view/1234567890/" /></label><button className="button button-quiet" disabled={!inspectionId || busy || running || coolingDown || paused}>Inspect one job</button>{inspectionUrl && !inspectionId ? <p className="field-help">Use a LinkedIn job URL with /jobs/view/ or currentJobId, or its numeric job ID.</p> : null}</form> : null}
    <details><summary>Paste a LinkedIn job manually</summary><p className="field-help">Use a visible posting you can access. The same pay, worksite and role-fit checks apply; a pasted job is not automatically qualified.</p><form className="linkedin-import" onSubmit={event => { event.preventDefault(); void act("import"); }}><label>LinkedIn posting URL<input className="input" type="url" required value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} /></label><label>Employer application URL (optional)<input className="input" type="url" value={applyUrl} onChange={event => setApplyUrl(event.target.value)} /></label><label>Full visible job text<textarea className="input" required maxLength={60000} value={text} onChange={event => setText(event.target.value)} /></label><button className="button button-quiet" disabled={busy || !sourceUrl.trim() || !text.trim()}>Import and screen job</button></form></details>
    {message ? <p role="status">{message}</p> : null}
    <p className="field-help">Requires the collector computer and its worker to be awake. Session expiry or access restrictions stop collection; resuming does not bypass a cooldown. Contact suggestions come only from visible profiles. Outreach is draft-only and never sent automatically.</p>
  </section>;
}
