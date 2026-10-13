import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { assessOpening } from "./matching";
import { readDiscoveryPreferences } from "./types";
import { parseCapture } from "../job-parser";
import { normalizeLinkedInSearch } from "./linkedin-search.mjs";
import { normalizeLinkedInOpening, canonicalApplyUrl, sameRoleIdentity, employerRequisitionIdentity, type LinkedInRawOpening } from "./linkedin-normalization";
import { LINKEDIN_STATE, LINKEDIN_CONFIG, LINKEDIN_META, LINKEDIN_QUEUE, LINKEDIN_SESSION, TAILORING_CAPACITY, object, linkedInConfig, linkedInEligibility, premiumSignal, rankLinkedIn, pacificDayStart, scanGate } from "./linkedin-policy";
export { LINKEDIN_STATE, LINKEDIN_CONFIG, LINKEDIN_META } from "./linkedin-policy";
const exec = promisify(execFile);
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const collectorIdentity = () => createHash("sha256").update(`${hostname()}:${path.resolve(process.cwd())}`).digest("hex").slice(0, 24);
async function setting(key: string, value: unknown) {
  return db.setting.upsert({ where: { key }, create: { key, value: json(value) }, update: { value: json(value) } });
}
async function collector(args: string[], timeout = 15000) {
  const { stdout } = await exec(process.execPath, [path.join(process.cwd(), "scripts/linkedin-discovery.mjs"), ...args], { cwd: process.cwd(), timeout, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}
export async function linkedInSession() {
  let result;
  const previous = object((await db.setting.findUnique({ where: { key: LINKEDIN_STATE } }))?.value);
  const args = ["--session-only"];
  if (typeof previous.retryAfter === "string") args.push("--cooldown-until", previous.retryAfter);
  try { result = await collector(args); }
  catch { result = { status: "browser_unavailable", blockCode: "browser_unavailable", reason: "The dedicated LinkedIn browser is not available on this device." }; }
  const state = { ...result, message: result.reason || "Dedicated LinkedIn session is available.", checkedAt: new Date().toISOString(), collectorId: collectorIdentity() };
  await setting(LINKEDIN_SESSION, state);
  return state;
}
export async function configureLinkedIn(enabled: boolean) {
  const previous = object((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  await setting(LINKEDIN_CONFIG, { ...previous, enabled, collectorId: collectorIdentity() });
  return { message: enabled ? "LinkedIn automation resumed on this device. Existing cooldowns still apply." : "LinkedIn automation paused. Saved jobs and resumes are retained." };
}
export async function configureLinkedInSearch(value: string) {
  const preferredSearchUrl = value.trim() ? normalizeLinkedInSearch(value) : null;
  if (value.trim() && !preferredSearchUrl) throw new Error("Use the full LinkedIn job-search URL containing its keywords and filters.");
  const previous = object((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  await setting(LINKEDIN_CONFIG, { ...previous, preferredSearchUrl });
  return { preferredSearchUrl, message: preferredSearchUrl ? "Your LinkedIn search is saved. Collection will use these keywords and filters for past-day and past-week results, subject to the existing access checks." : "Restored the standard support-role searches." };
}
export async function captureLinkedInOpenSearch() {
  const key = "discovery:linkedin:assisted-capture";
  const previous = object((await db.setting.findUnique({ where: { key } }))?.value);
  if (Date.now() - Date.parse(String(previous.capturedAt)) < 60000) return { message: "The open search was just captured. Its saved cards are shown below." };
  const { stdout } = await exec(process.execPath, [path.join(process.cwd(), "scripts/linkedin-open-search.mjs")], { cwd: process.cwd(), timeout: 45000, maxBuffer: 1024 * 1024 });
  const capture = JSON.parse(stdout);
  const config = object((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  if (typeof config.preferredSearchUrl === "string" && normalizeLinkedInSearch(capture.searchUrl) !== normalizeLinkedInSearch(config.preferredSearchUrl)) {
    throw new Error("Open the saved preferred LinkedIn search before capturing its jobs.");
  }
  const { selectedJob, ...cardsOnly } = capture;
  // A selected detail is separate from card identities. Never label every card
  // as imported or reuse one job's description for the rest of the list.
  let imported = null;
  if (selectedJob) {
    const old = await db.discoveryPosting.findUnique({ where: { sourceUrl: selectedJob.sourceUrl } });
    const meta = old ? object((await db.setting.findUnique({ where: { key: LINKEDIN_META + old.id } }))?.value) : {};
    imported = await ingestLinkedIn({ ...selectedJob, applyUrl: meta.applyUrl || selectedJob.applyHref }, "manual", "paste");
  }
  await setting(key, { ...cardsOnly, selectedPostingId: imported?.id ?? null });
  if (imported && !imported.duplicate) await queueLinkedIn();
  return { message: `${capture.cards.length} search cards captured. ${imported ? "The selected job's full description was saved and linked to existing work where found." : "The selected job's full description could not be verified."} Remaining cards need full descriptions before tailoring.`, count: capture.cards.length };
}
export async function openLinkedInBrowser() {
  const root = path.resolve(process.cwd(), "../..");
  const windows = process.platform === "win32";
  await exec(windows ? "powershell.exe" : "bash", windows
    ? ["-NoProfile", "-File", path.join(root, "scripts/start-linkedin-review.ps1")]
    : [path.join(root, "scripts/start-linkedin-review.sh")], { timeout: 30000 });
  // Explicit local open establishes the collector device without changing pause preference.
  const config = object((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  await setting(LINKEDIN_CONFIG, { ...config, collectorId: collectorIdentity() });
  const session = await linkedInSession();
  return { ...session, message: session.status === "ready" ? "LinkedIn browser ready. Collection still respects its cooldown." : session.message };
}
export function sameKnownJob(job: { company: string; title: string; location: string | null; sourceUrl: string | null; applyUrl: string | null }, opening: { company: string; title: string; location: string; sourceUrl: string }, applyUrl: string | null) {
  if (job.sourceUrl === opening.sourceUrl) return true;
  const urls = [job.applyUrl, job.sourceUrl].filter((url): url is string => Boolean(url));
  const requisition = employerRequisitionIdentity(applyUrl);
  if (applyUrl && urls.some(url => canonicalApplyUrl(url) === applyUrl || requisition && employerRequisitionIdentity(url) === requisition)) return true;
  // Two different known requisitions can share a title and city.
  if (requisition && urls.some(url => employerRequisitionIdentity(url))) return false;
  return sameRoleIdentity(job.company, job.title, job.location || "") === sameRoleIdentity(opening.company, opening.title, opening.location);
}
export async function ingestLinkedIn(raw: LinkedInRawOpening & Record<string, unknown>, window: string, origin: "browser" | "paste" = "browser") {
  const normalized = normalizeLinkedInOpening(raw);
  if (!normalized) throw new Error("Job identity, company, title, selected location and full description could not be identified. Paste the selected job details with its LinkedIn URL.");
  const { applyUrl, topApplicant, premiumMatch, contacts, ...opening } = normalized;
  const prefs = readDiscoveryPreferences((await db.setting.findUnique({ where: { key: "discovery:preferences" } }))?.value);
  const old = await db.discoveryPosting.findUnique({ where: { sourceUrl: opening.sourceUrl } });
  // A relative date parsed on a later observation must not make the job newer.
  if (old?.postedAt && (!opening.postedAt || old.postedAt < opening.postedAt)) opening.postedAt = old.postedAt;
  const fit = assessOpening(opening, prefs);
  const { excluded: _excluded, ...storedFit } = fit; void _excluded;
  const id = createHash("sha256").update(`linkedin:premium:${opening.externalId}`).digest("hex");
  const previousMeta = object((await db.setting.findUnique({ where: { key: LINKEDIN_META + (old?.id || id) } }))?.value);
  const windows = [...new Set([...(Array.isArray(previousMeta.windows) ? previousMeta.windows : []), window, ...(Array.isArray(raw.searchWindows) ? raw.searchWindows.filter(w => ["day", "week"].includes(String(w))) : [])])];
  const safeContacts = contacts.map(object).filter(c => typeof c.name === "string" && /^https:\/\/(?:www\.)?linkedin\.com\/in\/[^/?#]+\/?$/.test(String(c.profileUrl)) && /recruit|hiring|talent|poster|alumn|school|team/i.test(String(c.context))).slice(0, 5).map(c => ({ name: String(c.name).slice(0, 100), context: String(c.context).slice(0, 300), profileUrl: c.profileUrl }));
  const meta = { ...previousMeta, applyUrl, topApplicant, premiumMatch, premiumSignal: premiumSignal({ topApplicant, premiumMatch }), contacts: safeContacts, windows, origin,
    destinationType: raw.applyMethod === "easy_apply" ? "EASY_APPLY" : applyUrl ? "EXTERNAL" : "UNKNOWN",
    contentHash: createHash("sha256").update(opening.description).digest("hex"), observedAt: new Date().toISOString(),
    extractionMethod: typeof raw.extractionMethod === "string" ? raw.extractionMethod : origin,
    searchQueries: Array.isArray(raw.searchQueries) ? raw.searchQueries.slice(0, 6) : [],
  };
  const existing = await db.job.findMany({ include: { application: true } });
  const duplicate = existing.find(job => job.application && sameKnownJob(job, opening, applyUrl));
  const saved = await db.discoveryPosting.upsert({ where: { sourceUrl: opening.sourceUrl },
    create: { id, ...opening, ...storedFit, matchReasons: json(fit.matchReasons), cautions: json(fit.cautions), active: true, lastSeenAt: new Date(), approvedApplicationId: duplicate?.application?.id },
    update: { ...opening, ...storedFit, matchReasons: json(fit.matchReasons), cautions: json(fit.cautions), active: true, lastSeenAt: new Date(), ...(duplicate?.application ? { approvedApplicationId: duplicate.application.id } : {}) },
  });
  await setting(LINKEDIN_META + saved.id, meta);
  return { id: saved.id, imported: !old, duplicate: Boolean(saved.approvedApplicationId), excluded: fit.excluded, pipeline: linkedInEligibility({ ...saved, ...fit }, meta) };
}
export async function queueLinkedIn() {
  const config = linkedInConfig((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  const prefs = readDiscoveryPreferences((await db.setting.findUnique({ where: { key: "discovery:preferences" } }))?.value);
  const postings = await db.discoveryPosting.findMany({ where: { sourceKey: "linkedin:premium", active: true, approvedApplicationId: null, dismissedAt: null } });
  const metas = await db.setting.findMany({ where: { key: { startsWith: LINKEDIN_META } } });
  const candidates = postings.map(p => ({ ...p, ...assessOpening({ ...p, employmentType: p.employmentType as "Full-time", workArrangement: p.workArrangement as "On-site" }, prefs), linkedin: metas.find(m => m.key === LINKEDIN_META + p.id)?.value }))
    .filter(p => linkedInEligibility(p, p.linkedin).status === "eligible").sort(rankLinkedIn);
  const errors: { postingId: string; code: string; message: string }[] = [], items: { postingId: string; status: string; reason: string }[] = [];
  let queued = 0;
  let deferred: { status: string; reason: string } | null = null;
  const { approvePosting } = await import("./service");
  for (const candidate of candidates) {
    if (!config.enabled || !config.autoTailor) { items.push({ postingId: candidate.id, status: "paused", reason: "Automatic tailoring is paused" }); continue; }
    if (deferred) { items.push({ postingId: candidate.id, ...deferred }); continue; }
    try {
      const result = await approvePosting(candidate.id, true, "linkedin");
      if (!result.duplicate) queued++;
      items.push({ postingId: candidate.id, status: result.duplicate ? "existing" : "queued", reason: result.duplicate ? "Existing application" : "Queued for tailoring" });
    } catch (error) {
      const original = error instanceof Error ? error.message : "";
      const message = /^(?:LinkedIn|Tailoring queue full|Dismissed|This opening|This posting|This listing|Posting date|Posting needs|Full job|Employer application|Insufficient supported|Automatic tailoring)/.test(original) ? original : "Database or queue creation failed. The saved job remains available for retry.";
      const status = /daily limit/.test(message) ? "deferred_day" : /queue full/.test(message) ? "deferred_capacity" : "queue_error";
      items.push({ postingId: candidate.id, status, reason: message });
      if (status.startsWith("deferred")) deferred = { status, reason: message };
      if (status === "queue_error") errors.push({ postingId: candidate.id, code: "queue_error", message });
    }
  }
  const [usedToday, pending] = await Promise.all([
    db.applicationEvent.count({ where: { eventType: "discovery_approved", occurredAt: { gte: pacificDayStart() }, detail: { path: ["source"], equals: "linkedin:premium" }, toValue: "TAILORING" } }),
    db.tailoringRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
  ]);
  const state = { queued, qualified: candidates.length, deferred: items.filter(i => i.status.startsWith("deferred") || i.status === "paused").length, usedToday, pending, capacity: TAILORING_CAPACITY, errors, items, checkedAt: new Date().toISOString() };
  await setting(LINKEDIN_QUEUE, state);
  return state;
}
export async function importLinkedInPaste(input: { text: string; sourceUrl: string; applyUrl?: string }) {
  const parsed = parseCapture(input.text, input.sourceUrl);
  const relative = parsed.postedText?.match(/(\d+)\s*(hour|day|week|minute)s?\s+ago/i);
  const postedAt = relative ? new Date(Date.now() - Number(relative[1]) * ({ minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[relative[2].toLowerCase()] || 0)).toISOString() : null;
  const prefix = input.text.split(/About the job/i)[0];
  const topApplicant = /you[’']d be a top applicant|you(?: are|’re|'re) a top applicant/i.test(prefix);
  const result = await ingestLinkedIn({ ...parsed, sourceUrl: input.sourceUrl, description: parsed.cleanDescription, applyUrl: input.applyUrl, postedAt, topApplicant, applyMethod: /\bEasy Apply\b/.test(prefix) ? "easy_apply" : "unknown" }, "paste", "paste");
  const queue = await queueLinkedIn();
  return { ...result, queue, message: `${result.imported ? "Job imported" : "Saved job updated"}. ${result.duplicate ? "Linked to its existing application." : result.pipeline.reason} No application was submitted.` };
}
export async function scanLinkedIn(window: "day" | "week" | "both", force = false, oneJob?: string) {
  const config = linkedInConfig((await db.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
  if (!force && !config.enabled) return { status: "paused", message: "LinkedIn automation is paused." };
  if (!force && config.collectorId !== collectorIdentity()) return { status: "other_device", message: "Use the device selected to run LinkedIn collection." };
  const claim = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074032)`;
    const previous = object((await tx.setting.findUnique({ where: { key: LINKEDIN_STATE } }))?.value);
    const gate = scanGate(previous, force);
    if (gate) return { gate, state: null };
    if (!oneJob && !previous.firstExtractionAt) return { gate: { status: "needs_validation", message: "Inspect one LinkedIn job successfully before enabling a full collection cycle. Open the LinkedIn tab and use its one-job check." }, state: null };
    const state = { id: randomUUID(), status: "running", startedAt: new Date().toISOString(), lastAttemptedAt: new Date().toISOString(), lastSuccessfulAt: previous.lastSuccessfulAt || null,
      firstExtractionAt: previous.firstExtractionAt || null,
      window, trigger: force ? "manual" : "scheduled", collectorId: collectorIdentity(), checked: 0, imported: 0, duplicates: 0, excluded: 0, queued: 0, message: "Checking the dedicated LinkedIn session.", errors: [] as unknown[] };
    await tx.setting.upsert({ where: { key: LINKEDIN_STATE }, create: { key: LINKEDIN_STATE, value: json(state) }, update: { value: json(state) } });
    return { gate: null, state };
  });
  if (claim.gate || !claim.state) return claim.gate;
  const state: Record<string, unknown> = { ...claim.state };
  const persist = async () => db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074032)`;
    const current = object((await tx.setting.findUnique({ where: { key: LINKEDIN_STATE } }))?.value);
    if (current.id === state.id) await tx.setting.update({ where: { key: LINKEDIN_STATE }, data: { value: json(state) } });
  });
  try {
    const session = await linkedInSession();
    if (session.status !== "ready") {
      state.status = "blocked"; state.blockCode = session.blockCode || session.status; state.message = session.message;
      if (session.blockCode === "rate_limited") state.retryAfter = new Date(Date.now() + 86400000).toISOString();
    } else {
      const known = new Set((await db.discoveryPosting.findMany({ where: { sourceKey: "linkedin:premium", OR: [{ lastSeenAt: { gte: new Date(Date.now() - 86400000) } }, { approvedApplicationId: { not: null } }, { dismissedAt: { not: null } }] }, select: { externalId: true } })).map(p => p.externalId));
      for (const period of oneJob ? [window === "week" ? "week" : "day"] : window === "both" ? ["day", "week"] : [window]) {
        state.message = `Checking ${period === "day" ? "past 24 hours" : "past week"} jobs.`; await persist();
        const args = ["--window", period, "--limit", "12", "--skip-job-ids", [...known].join(",")];
        if (config.preferredSearchUrl && !oneJob) args.push("--search-url", config.preferredSearchUrl);
        if (oneJob) args.push("--one-job", oneJob);
        if (typeof state.retryAfter === "string") args.push("--cooldown-until", state.retryAfter);
        const result = await collector(args, 130000);
        state.checked = Number(state.checked) + Number(result.checked || 0);
        state.navigationCount = Number(state.navigationCount || 0) + Number(result.navigationCount || 0);
        for (const metric of ["searchPages", "detailPages", "duplicatesAvoided", "durationMs"]) state[metric] = Number(state[metric] || 0) + Number(result[metric] || 0);
        state.seenJobIds = [...new Set([...(Array.isArray(state.seenJobIds) ? state.seenJobIds : []), ...(Array.isArray(result.seenJobIds) ? result.seenJobIds : [])].filter(id => /^\d+$/.test(String(id))))];
        state.uniqueResultIds = (state.seenJobIds as string[]).length;
        state.searches = [...(Array.isArray(state.searches) ? state.searches : []), ...(result.searches || [])];
        state.diagnostics = [...(Array.isArray(state.diagnostics) ? state.diagnostics : []), ...(result.diagnostics || [])];
        // Avoid repeating even incomplete detail reads across the overlapping windows.
        for (const diagnostic of result.diagnostics || []) if (diagnostic.externalId) known.add(String(diagnostic.externalId));
        for (const raw of result.jobs || []) {
          try {
            known.add(String(raw.externalId));
            const saved = await ingestLinkedIn(raw, oneJob ? "manual" : period);
            if (saved.imported) state.imported = Number(state.imported) + 1;
            if (saved.duplicate) state.duplicates = Number(state.duplicates) + 1;
            if (saved.excluded) state.excluded = Number(state.excluded) + 1;
          } catch { (state.errors as unknown[]).push({ postingId: String(raw.externalId || ""), code: "import_error", message: "This job could not be saved. Its identity or database write needs review." }); }
        }
        if (result.status !== "completed") {
          state.status = result.status; state.blockCode = result.blockCode; state.message = result.reason || "Some LinkedIn pages could not be read.";
          if (/429|rate.limit/i.test(String(result.reason))) state.retryAfter = new Date(Date.now() + 86400000).toISOString();
        }
        await persist();
        if (result.status === "blocked") break;
      }
      const queue = await queueLinkedIn();
      state.qualified = queue.qualified; state.queued = queue.queued; state.deferred = queue.deferred; state.queueErrors = queue.errors;
      if (state.status === "running") {
        state.status = (state.errors as unknown[]).length || queue.errors.length ? "partial" : "completed";
        state.message = `${state.imported} new jobs imported; ${queue.queued} queued for tailoring; ${queue.deferred} deferred. No applications submitted.`;
        if (state.status === "completed") state.lastSuccessfulAt = new Date().toISOString();
        if (state.status === "completed" && oneJob && Number(state.checked) > 0 && !(state.errors as unknown[]).length) state.firstExtractionAt = new Date().toISOString();
      } else if (state.status === "partial") {
        state.message = `Collection was incomplete. ${state.imported} new jobs retained; ${queue.queued} queued for tailoring. See diagnostics for pages that could not be read.`;
      }
    }
  } catch (error) {
    const code = object(error).code;
    state.status = Number(state.imported) ? "partial" : "blocked";
    state.blockCode = code === "ETIMEDOUT" ? "timeout" : "collector_error";
    state.message = "Collection stopped before completion. Saved jobs were retained. Check diagnostics or paste a job.";
  }
  state.completedAt = new Date().toISOString();
  state.nextAllowedAt = state.retryAfter || new Date(new Date(String(state.startedAt)).getTime() + 86400000).toISOString();
  await persist();
  return state;
}
