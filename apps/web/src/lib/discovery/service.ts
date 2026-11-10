import { currentDiscoveryEvidence } from "./current-evidence";
import { completeDesktopRefresh, readRefreshRequest, refreshRequestFinished, REFRESH_REQUEST_KEY } from "./refresh-request";
import { settledConcurrentMap, serialPublisher } from './concurrent-map';
import {listingAgePriority} from './listing-age';
import { candidateProfile } from "../workspace-material";
import { sameKnownJob } from "./linkedin";
import { requiredQualifications } from "./requirements";
import { LINKEDIN_STATE, LINKEDIN_META, LINKEDIN_CONFIG, LINKEDIN_QUEUE, LINKEDIN_SESSION, TAILORING_CAPACITY, linkedInConfig, linkedInEligibility, object } from "./linkedin-policy";
import { postedWithin } from "./freshness";
import { discoveryScanDue, discoverySourceDue } from "./scan-policy";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { externalSources, integrationStatus } from "./external-providers";
import { autoTailoringBlockers, eligibleForAutoTailoring } from "./automation-policy";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DISCOVERY_SOURCES } from "./sources";
import { collectSource } from "./providers";
import { assessOpening } from "./matching";
import { postingFingerprint } from "../job-parser";
import { readAutomationPreferences, readDiscoveryPreferences, type ScanSummary, type SourceResult } from "./types";

export const SCAN_KEY = "discovery:last-scan";
export const AUTOMATION_KEY = "discovery:automation";
export const AUTOMATION_STATE_KEY = "discovery:automation-state";
export const PREFS_KEY = "discovery:preferences";
export const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const postingId = (sourceKey: string, externalId: string) => createHash("sha256").update(`${sourceKey}:${externalId}`).digest("hex");

export async function discoverySnapshot() {
  const profile = await candidateProfile();
  const evidence = await currentDiscoveryEvidence(profile);
  const [postings, settings] = await Promise.all([
    db.discoveryPosting.findMany({ orderBy: [{ score: "desc" }, { firstSeenAt: "desc" }], take: 2000 }),
    db.setting.findMany({ where: { OR: [{ key: { in: [REFRESH_REQUEST_KEY, "discovery:linkedin:assisted-capture", SCAN_KEY, PREFS_KEY, AUTOMATION_KEY, AUTOMATION_STATE_KEY, LINKEDIN_STATE, LINKEDIN_CONFIG, LINKEDIN_QUEUE, LINKEDIN_SESSION] } }, { key: { startsWith: LINKEDIN_META } }] } }),
  ]);
  const preferences = readDiscoveryPreferences(settings.find((s) => s.key === PREFS_KEY)?.value);
  const automation = readAutomationPreferences(settings.find(s => s.key === AUTOMATION_KEY)?.value);
  const applications = await db.application.findMany({ where: { id: { in: postings.flatMap(p => p.approvedApplicationId ? [p.approvedApplicationId] : []) } }, select: { id: true, status: true, tailoringRuns: { orderBy: { runNumber: "desc" }, take: 1, select: { status: true } } } });
  const queue = object(settings.find(s => s.key === LINKEDIN_QUEUE)?.value);
  const queueItems = Array.isArray(queue.items) ? queue.items.map(object) : [];
  return {
    postings: postings.map(posting => {
      const linkedin = settings.find(s => s.key === LINKEDIN_META + posting.id)?.value ?? null;
      const fit = assessOpening({ ...posting, employmentType: posting.employmentType as "Full-time", workArrangement: posting.workArrangement as "On-site" }, preferences, profile, evidence);
      const app = applications.find(a => a.id === posting.approvedApplicationId);
      const eligibility = linkedInEligibility({ ...posting, ...fit }, linkedin);
      const queuedState = queueItems.find(i => i.postingId === posting.id);
      return { ...posting, ...fit, description: posting.description.slice(0, 1600), requiredExcerpt: requiredQualifications(posting.description).slice(0, 4), linkedin,
        ...(app ? { application: { id: app.id, status: app.status, tailoringStatus: app.tailoringRuns[0]?.status } } : {}),
        ...(posting.sourceKey.startsWith("linkedin:") ? { pipeline: eligibility.status === "eligible" && queuedState ? { status: String(queuedState.status), reason: String(queuedState.reason) } : eligibility } : { pipeline: { status: eligibleForAutoTailoring({ ...posting, ...fit }, automation) ? "Ready for automatic tailoring" : "Not queued automatically", reason: autoTailoringBlockers({ ...posting, ...fit }, automation).join(" ") || "Waiting for the next worker check and available daily capacity." } }),
      };
    }),
    refreshRequest: readRefreshRequest(settings.find(s => s.key === REFRESH_REQUEST_KEY)?.value),
    linkedinCapture: settings.find(s => s.key === "discovery:linkedin:assisted-capture")?.value ?? null,
    linkedinConfig: linkedInConfig(settings.find(s => s.key === LINKEDIN_CONFIG)?.value),
    linkedinQueue: queue,
    linkedinSession: settings.find(s => s.key === LINKEDIN_SESSION)?.value ?? null,
    linkedinState: settings.find(s => s.key === LINKEDIN_STATE)?.value ?? null,
    preferences,
    automation: readAutomationPreferences(settings.find((s) => s.key === AUTOMATION_KEY)?.value),
    automationState: settings.find((s) => s.key === AUTOMATION_STATE_KEY)?.value ?? null,
    integrations: integrationStatus(),
    scan: (settings.find((s) => s.key === SCAN_KEY)?.value ?? null) as ScanSummary | null,
  };
}

export async function refreshDiscovery(force = false) {
  const profile = await candidateProfile();
  const evidence = await currentDiscoveryEvidence(profile);
  const automation = readAutomationPreferences((await db.setting.findUnique({ where: { key: AUTOMATION_KEY } }))?.value);
  // Short transaction serializes claims across browsers, processes, and devices.
  // Network calls run outside the transaction. A dead process's lease expires.
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074030)`;
    const current = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
    const previous = current?.value as ScanSummary | null;
    const age = previous ? Date.now() - new Date(previous.startedAt).getTime() : Infinity;
    if (previous?.status === "running" && age < 180_000) return { claimed: false as const, scan: previous, reason: "running" };
    if (!discoveryScanDue(previous, automation.intervalHours, force)) return { claimed: false as const, scan: previous, reason: "fresh" };
    const scan: ScanSummary = { id: randomUUID(), status: "running", startedAt: new Date().toISOString(), sources: [], found: 0 };
    await tx.setting.upsert({ where: { key: SCAN_KEY }, create: { key: SCAN_KEY, value: json(scan) }, update: { value: json(scan) } });
    return { claimed: true as const, scan, previous, reason: "started" };
  });
  if (!claim.claimed) return claim;
  const pref = await db.setting.findUnique({ where: { key: PREFS_KEY } });
  const preferences = readDiscoveryPreferences(pref?.value);
  const allSources = [...DISCOVERY_SOURCES, ...externalSources(preferences)];
  const registry = allSources.filter(s => discoverySourceDue(s.key, claim.previous, automation.intervalHours, force));
  const sources: SourceResult[] = (claim.previous?.sources || [])
    .filter(s => allSources.some(current => current.key === s.sourceKey) && !registry.some(current => current.key === s.sourceKey))
    .map(s => ({ ...s, checkedAt: s.checkedAt || claim.previous?.completedAt || claim.previous?.startedAt }));
  let found = 0;
  const signal = AbortSignal.timeout(90_000);
  const publish = serialPublisher();
  try {
    const batch = await settledConcurrentMap(registry,4,async (source) => {
        const progressKey = `discovery:collector-state:${source.key}`;
        const progress = ["edjoin", "calcareers"].includes(source.provider) ? await db.setting.findUnique({ where: { key: progressKey } }) : null;
        const result = await collectSource(source, preferences, signal, progress?.value);
        const now = new Date();
        let matches = 0;
        await publish(() => db.$transaction(async (tx) => {
          // Serialize publication with lease replacement, not just a stale read.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074030)`;
          // Only the lease owner may publish a result. Never erase approvals.
          const lease = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
          if ((lease?.value as ScanSummary | null)?.id !== claim.scan.id) throw new Error("Refresh lease changed; retry the search.");
          if ("nextState" in result) await tx.setting.upsert({ where: { key: progressKey }, create: { key: progressKey, value: json(result.nextState ?? {}) }, update: { value: json(result.nextState ?? {}) } });
          for (const opening of result.openings) {
            const { excluded, ...assessment } = assessOpening(opening, preferences, profile, evidence);
            const id = postingId(source.key, opening.externalId);
            if (excluded) {
              await tx.discoveryPosting.updateMany({ where: { id }, data: { ...opening, ...assessment, active: true, lastSeenAt: now } });
              continue;
            }
            const data = { ...opening, ...assessment, active: true, lastSeenAt: now };
            await tx.discoveryPosting.upsert({ where: { sourceUrl: opening.sourceUrl }, create: { id, ...data }, update: data });
            matches++;
          }
          // Failed/partial sources must not turn existing opportunities into closed jobs.
          if (result.complete && result.authoritative) await tx.discoveryPosting.updateMany({
            where: { sourceKey: source.key, active: true, externalId: { notIn: result.liveIds } }, data: { active: false },
          });
        }, { maxWait: 20_000, timeout: 20_000 }));
        return { ...("continuationPending" in result && typeof result.continuationPending === "boolean" ? { continuationPending: result.continuationPending } : {}), sourceKey: source.key, company: source.company, status: result.complete ? "ok" as const : "partial" as const, checkedAt: now.toISOString(), checked: result.checked, found: matches, ...(!result.complete ? { message: ("message" in result && typeof result.message === "string" ? result.message : "Collection was incomplete; previous listings were preserved.") } : {}) };
      });
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        if (item.status === "fulfilled") { sources.push(item.value); found += item.value.found; }
        else sources.push({ sourceKey: registry[i].key, company: registry[i].company, status: "failed", checkedAt: new Date().toISOString(), checked: 0, found: 0, message: item.reason instanceof Error ? item.reason.message : "Source unavailable. Try again later." });
      }
  } finally {
    found = sources.reduce((total, source) => total + source.found, 0);
    const summary: ScanSummary = { ...claim.scan, completedAt: new Date().toISOString(), status: sources.some((s) => s.status !== "failed") ? "completed" : "failed", sources, found };
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074030)`;
      const lease = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
      if ((lease?.value as ScanSummary | null)?.id === claim.scan.id) await tx.setting.update({ where: { key: SCAN_KEY }, data: { value: json(summary) } });
    });
  }
  return { claimed: true, scan: { ...claim.scan, completedAt: new Date().toISOString(), status: sources.some((s) => s.status !== "failed") ? "completed" : "failed", sources, found }, reason: "completed" };
}

export async function approvePosting(id: string, tailor: boolean, automatic: boolean | "linkedin" = false) {
  const profile = await candidateProfile();
  const evidence = await currentDiscoveryEvidence(profile);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074031)`;
    const posting = await tx.discoveryPosting.findUnique({ where: { id } });
    if (!posting) throw new Error("Posting not found.");
    if (posting.sourceKey.startsWith("adzuna:")) throw new Error("Open the Adzuna listing and paste the full employer posting into Capture job before saving or tailoring.");
    if (posting.sourceKey === "rtx:california" && !postedWithin(posting.postedAt, 21)) throw new Error("This RTX posting is outside your 21-day window. Refresh the search.");
    if (automatic === true) {
      if (posting.sourceKey.startsWith("linkedin:")) throw new Error("LinkedIn jobs use their separate daily queue.");
      const settings = await tx.setting.findMany({ where: { key: { in: [AUTOMATION_KEY, PREFS_KEY] } } });
      const automation = readAutomationPreferences(settings.find((s) => s.key === AUTOMATION_KEY)?.value);
      const preferences = readDiscoveryPreferences(settings.find((s) => s.key === PREFS_KEY)?.value);
      const assessment = assessOpening({ ...posting, employmentType: posting.employmentType as "Full-time", workArrangement: posting.workArrangement as "On-site" }, preferences, profile, evidence);
      if (!automation.autoTailor || !tailor || !eligibleForAutoTailoring({ ...posting, ...assessment }, automation)) throw new Error("This opening does not meet your automatic tailoring rules.");
      const start = fromZonedTime(`${formatInTimeZone(new Date(), "America/Los_Angeles", "yyyy-MM-dd")}T00:00:00`, "America/Los_Angeles");
      const used = await tx.applicationEvent.count({ where: { eventType: "automatic_tailoring_queued", occurredAt: { gte: start } } });
      const pending = await tx.tailoringRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
      if (used >= automation.dailyLimit || pending >= 4) throw new Error("Daily automatic tailoring limit or queue capacity reached.");
    }
    if (posting.approvedApplicationId) {
      const existing = await tx.application.findUnique({ where: { id: posting.approvedApplicationId } });
      if (existing) return { id: existing.id, duplicate: true };
    }
    const currentPreferences = readDiscoveryPreferences((await tx.setting.findUnique({ where: { key: PREFS_KEY } }))?.value);
    const currentFit = assessOpening({ ...posting, employmentType: posting.employmentType as "Full-time", workArrangement: posting.workArrangement as "On-site" }, currentPreferences, profile, evidence);
    if (currentFit.excluded) throw new Error("This opening does not meet your current role, confirmed pay or commute requirements. Refresh Discover.");
    if (!posting.active) throw new Error("This posting is no longer listed. Refresh the search before approving it.");
    if (Date.now() - posting.lastSeenAt.getTime() > 48 * 60 * 60 * 1000) throw new Error("This listing has not been checked in two days. Refresh the search before approving it.");
    const candidates = await tx.job.findMany({
      where: { OR: [{ sourceUrl: posting.sourceUrl }, { company: { equals: posting.company, mode: "insensitive" }, title: { equals: posting.title, mode: "insensitive" }, location: { equals: posting.location, mode: "insensitive" } }] },
      include: { application: true },
      take: 20,
      orderBy: { capturedAt: "desc" },
    });
    {
      const linkedMeta = (await tx.setting.findUnique({ where: { key: LINKEDIN_META + posting.id } }))?.value as { applyUrl?: string } | null;
      const priorJobs = await tx.job.findMany({ include: { application: true }, });
      // A direct feed discovered after LinkedIn must link the same requisition too.
      const destination = linkedMeta?.applyUrl || (posting.sourceKey.startsWith("linkedin:") ? null : posting.sourceUrl);
      const prior = priorJobs.find(job => job.application && sameKnownJob(job, posting, destination));
      if (prior?.application) {
        await tx.discoveryPosting.update({ where: { id }, data: { approvedApplicationId: prior.application.id } });
        return { id: prior.application.id, duplicate: true };
      }
    }
    const fingerprint = postingFingerprint({ ...posting, cleanDescription: posting.description });
    const duplicate = candidates.find((candidate) => candidate.sourceUrl === posting.sourceUrl || postingFingerprint(candidate) === fingerprint);
    if (duplicate?.application) {
      await tx.discoveryPosting.update({ where: { id }, data: { approvedApplicationId: duplicate.application.id, dismissedAt: null } });
      return { id: duplicate.application.id, duplicate: true };
    }
    if (tailor && posting.sourceKey === "linkedin:premium") {
      const start = fromZonedTime(`${formatInTimeZone(new Date(), "America/Los_Angeles", "yyyy-MM-dd")}T00:00:00`, "America/Los_Angeles");
      const used = await tx.applicationEvent.count({ where: { eventType: "discovery_approved", occurredAt: { gte: start }, detail: { path: ["source"], equals: "linkedin:premium" }, toValue: "TAILORING" } });
      const config = linkedInConfig((await tx.setting.findUnique({ where: { key: LINKEDIN_CONFIG } }))?.value);
      if (automatic === "linkedin") {
        const meta = (await tx.setting.findUnique({ where: { key: LINKEDIN_META + id } }))?.value;
        const eligibility = linkedInEligibility({ ...posting, ...currentFit }, meta);
        if (!config.enabled || !config.autoTailor) throw new Error("LinkedIn automatic tailoring is paused.");
        if (eligibility.status !== "eligible") throw new Error(eligibility.reason);
      }
      if (used >= config.dailyLimit) throw new Error("LinkedIn daily limit reached; deferred until tomorrow.");
      const pending = await tx.tailoringRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
      if (pending >= TAILORING_CAPACITY) throw new Error("Tailoring queue full; deferred until capacity is available.");
    }
    // Preserve the existing parser's known header format for the Python engine.
    const rawPaste = [`Company logo for, ${posting.company}`, posting.company, posting.title, `${posting.location} · ${posting.workArrangement}`, posting.employmentType, posting.salaryText || "", `Official posting: ${posting.sourceUrl}`, "About the job", posting.description].filter(Boolean).join("\n");
    const metadata = (await tx.setting.findUnique({ where: { key: LINKEDIN_META + posting.id } }))?.value as { applyUrl?: string } | null;
    const job = await tx.job.create({ data: {
      ...(metadata?.applyUrl ? { applyUrl: metadata.applyUrl } : {}),
      source: posting.sourceKey.split(":")[0], company: posting.company, title: posting.title, location: posting.location,
      workArrangement: posting.workArrangement, employmentType: posting.employmentType,
      salaryMin: posting.salaryMin === null ? null : Math.round(posting.salaryMin), salaryMax: posting.salaryMax === null ? null : Math.round(posting.salaryMax), salaryText: posting.salaryText,
      sourceUrl: posting.sourceUrl, rawPaste, rawPasteSha256: createHash("sha256").update(rawPaste).digest("hex"), cleanDescription: posting.description,
    } });
    const application = await tx.application.create({ data: {
      jobId: job.id, status: tailor ? "TAILORING" : "CAPTURED",
      events: { create: { eventType: automatic === true ? "automatic_tailoring_queued" : "discovery_approved", toValue: tailor ? "TAILORING" : "CAPTURED", detail: { source: posting.sourceKey, postingId: id } } },
      ...(tailor ? { tailoringRuns: { create: { runNumber: 1, status: "QUEUED" } } } : {}),
    } });
    await tx.discoveryPosting.update({ where: { id }, data: { approvedApplicationId: application.id, dismissedAt: null } });
    return { id: application.id, duplicate: false };
  }, { timeout: 15_000 });
}

export async function runDiscoveryAutomation() {
  const profile = await candidateProfile();
  const evidence = await currentDiscoveryEvidence(profile);
  const settings = readAutomationPreferences((await db.setting.findUnique({ where: { key: AUTOMATION_KEY } }))?.value);
  const requested = readRefreshRequest((await db.setting.findUnique({ where: { key: REFRESH_REQUEST_KEY } }))?.value);
  if (!settings.scheduledSearch && !requested) return { enabled: false, queued: 0 };
  const scan = await refreshDiscovery(!!requested);
  if (requested && refreshRequestFinished(scan)) await completeDesktopRefresh(requested);
  if (scan.reason === "running" || scan.scan?.status === "failed") return { enabled: true, queued: 0, reason: scan.reason };
  const prefs = readDiscoveryPreferences((await db.setting.findUnique({ where: { key: PREFS_KEY } }))?.value);
  const rows = await db.discoveryPosting.findMany({ where: { active: true, sourceKey: { not: { startsWith: "linkedin:" } } } });
  const snapshot = { postings: rows.map(p => ({ ...p, ...assessOpening({ ...p, employmentType: p.employmentType as "Full-time", workArrangement: p.workArrangement as "On-site" }, prefs, profile, evidence) })) };
  let queued = 0;
  const messages: string[] = [];
  if (settings.autoTailor) {
    const candidates = snapshot.postings.filter((p) => !p.sourceKey.startsWith("linkedin:") && eligibleForAutoTailoring(p, settings)).sort((a, b) => listingAgePriority(a)-listingAgePriority(b) || b.score - a.score || (b.postedAt?.getTime()||0)-(a.postedAt?.getTime()||0) || b.firstSeenAt.getTime()-a.firstSeenAt.getTime());
    for (const posting of candidates) {
      if (queued >= settings.dailyLimit) break;
      try { const result = await approvePosting(posting.id, true, true); if (!result.duplicate) queued++; }
      catch (error) {
        const message = error instanceof Error ? error.message : "Could not queue this opening.";
        messages.push(message);
        if (message.includes("Daily automatic tailoring limit or queue capacity reached")) break;
      }
    }
  }
  const state = { checkedAt: new Date().toISOString(), queued, messages };
  await db.setting.upsert({ where: { key: AUTOMATION_STATE_KEY }, create: { key: AUTOMATION_STATE_KEY, value: json(state) }, update: { value: json(state) } });
  return { enabled: true, ...state };
}
