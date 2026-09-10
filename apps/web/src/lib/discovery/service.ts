import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DISCOVERY_SOURCES } from "./sources";
import { collectSource } from "./providers";
import { assessOpening } from "./matching";
import { readDiscoveryPreferences, type ScanSummary, type SourceResult } from "./types";

export const SCAN_KEY = "discovery:last-scan";
export const PREFS_KEY = "discovery:preferences";
export const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const postingId = (sourceKey: string, externalId: string) => createHash("sha256").update(`${sourceKey}:${externalId}`).digest("hex");

export async function discoverySnapshot() {
  const [postings, settings] = await Promise.all([
    db.discoveryPosting.findMany({ orderBy: [{ score: "desc" }, { firstSeenAt: "desc" }], take: 500 }),
    db.setting.findMany({ where: { key: { in: [SCAN_KEY, PREFS_KEY] } } }),
  ]);
  const preferences = readDiscoveryPreferences(settings.find((s) => s.key === PREFS_KEY)?.value);
  return {
    postings: postings.map((posting) => ({ ...posting, ...assessOpening({ ...posting, employmentType: posting.employmentType as "Full-time" | "Other" | "Not listed", workArrangement: posting.workArrangement as "Hybrid" | "On-site" | "Remote" | "Not listed" }, preferences) })),
    preferences,
    scan: (settings.find((s) => s.key === SCAN_KEY)?.value ?? null) as ScanSummary | null,
  };
}

export async function refreshDiscovery(force = false) {
  // Short transaction serializes claims across browsers, processes, and devices.
  // Network calls run outside the transaction. A dead process's lease expires.
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074030)`;
    const current = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
    const previous = current?.value as ScanSummary | null;
    const age = previous ? Date.now() - new Date(previous.startedAt).getTime() : Infinity;
    if (previous?.status === "running" && age < 180_000) return { claimed: false as const, scan: previous, reason: "running" };
    if (previous?.status !== "running" && age < (force ? 60_000 : previous?.status === "failed" ? 15 * 60_000 : 20 * 60 * 60 * 1000)) return { claimed: false as const, scan: previous, reason: "fresh" };
    const scan: ScanSummary = { id: randomUUID(), status: "running", startedAt: new Date().toISOString(), sources: [], found: 0 };
    await tx.setting.upsert({ where: { key: SCAN_KEY }, create: { key: SCAN_KEY, value: json(scan) }, update: { value: json(scan) } });
    return { claimed: true as const, scan, reason: "started" };
  });
  if (!claim.claimed) return claim;
  const pref = await db.setting.findUnique({ where: { key: PREFS_KEY } });
  const preferences = readDiscoveryPreferences(pref?.value);
  const sources: SourceResult[] = [];
  let found = 0;
  const signal = AbortSignal.timeout(90_000);
  try {
    for (let offset = 0; offset < DISCOVERY_SOURCES.length; offset += 4) {
      const batch = await Promise.allSettled(DISCOVERY_SOURCES.slice(offset, offset + 4).map(async (source) => {
        const result = await collectSource(source, preferences, signal);
        const now = new Date();
        let matches = 0;
        await db.$transaction(async (tx) => {
          // Only the lease owner may publish a result. Never erase approvals.
          const lease = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
          if ((lease?.value as ScanSummary | null)?.id !== claim.scan.id) throw new Error("Refresh lease changed; retry the search.");
          for (const opening of result.openings) {
            const { excluded, ...assessment } = assessOpening(opening, preferences);
            const id = postingId(source.key, opening.externalId);
            if (excluded) {
              await tx.discoveryPosting.updateMany({ where: { id }, data: { active: false } });
              continue;
            }
            const data = { ...opening, ...assessment, active: true, lastSeenAt: now };
            await tx.discoveryPosting.upsert({ where: { sourceUrl: opening.sourceUrl }, create: { id, ...data }, update: data });
            matches++;
          }
          // Failed/partial sources must not turn existing opportunities into closed jobs.
          if (result.complete) await tx.discoveryPosting.updateMany({
            where: { sourceKey: source.key, active: true, externalId: { notIn: result.liveIds } }, data: { active: false },
          });
        }, { timeout: 20_000 });
        return { sourceKey: source.key, company: source.company, status: result.complete ? "ok" as const : "partial" as const, checked: result.checked, found: matches, ...(!result.complete ? { message: "Collection was incomplete; previous listings were preserved." } : {}) };
      }));
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        if (item.status === "fulfilled") { sources.push(item.value); found += item.value.found; }
        else sources.push({ sourceKey: DISCOVERY_SOURCES[offset + i].key, company: DISCOVERY_SOURCES[offset + i].company, status: "failed", checked: 0, found: 0, message: item.reason instanceof Error ? item.reason.message : "Source unavailable. Try again later." });
      }
    }
  } finally {
    const summary: ScanSummary = { ...claim.scan, completedAt: new Date().toISOString(), status: sources.some((s) => s.status !== "failed") ? "completed" : "failed", sources, found };
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074030)`;
      const lease = await tx.setting.findUnique({ where: { key: SCAN_KEY } });
      if ((lease?.value as ScanSummary | null)?.id === claim.scan.id) await tx.setting.update({ where: { key: SCAN_KEY }, data: { value: json(summary) } });
    });
  }
  return { claimed: true, scan: { ...claim.scan, completedAt: new Date().toISOString(), status: sources.some((s) => s.status !== "failed") ? "completed" : "failed", sources, found }, reason: "completed" };
}

export async function approvePosting(id: string, tailor: boolean) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074031)`;
    const posting = await tx.discoveryPosting.findUnique({ where: { id } });
    if (!posting) throw new Error("Posting not found.");
    if (posting.approvedApplicationId) {
      const existing = await tx.application.findUnique({ where: { id: posting.approvedApplicationId } });
      if (existing) return { id: existing.id, duplicate: true };
    }
    if (!posting.active) throw new Error("This posting is no longer listed. Refresh the search before approving it.");
    if (Date.now() - posting.lastSeenAt.getTime() > 48 * 60 * 60 * 1000) throw new Error("This listing has not been checked in two days. Refresh the search before approving it.");
    const duplicate = await tx.job.findFirst({
      where: { OR: [{ sourceUrl: posting.sourceUrl }, { company: { equals: posting.company, mode: "insensitive" }, title: { equals: posting.title, mode: "insensitive" }, location: { equals: posting.location, mode: "insensitive" } }] },
      include: { application: true },
    });
    if (duplicate?.application) {
      await tx.discoveryPosting.update({ where: { id }, data: { approvedApplicationId: duplicate.application.id, dismissedAt: null } });
      return { id: duplicate.application.id, duplicate: true };
    }
    // Preserve the existing parser's known header format for the Python engine.
    const rawPaste = [`Company logo for, ${posting.company}`, posting.company, posting.title, `${posting.location} · ${posting.workArrangement}`, posting.employmentType, posting.salaryText || "", posting.sourceUrl, "About the job", posting.description].filter(Boolean).join("\n");
    const job = await tx.job.create({ data: {
      source: posting.sourceKey.split(":")[0], company: posting.company, title: posting.title, location: posting.location,
      workArrangement: posting.workArrangement, employmentType: posting.employmentType,
      salaryMin: posting.salaryMin === null ? null : Math.round(posting.salaryMin), salaryMax: posting.salaryMax === null ? null : Math.round(posting.salaryMax), salaryText: posting.salaryText,
      sourceUrl: posting.sourceUrl, rawPaste, rawPasteSha256: createHash("sha256").update(rawPaste).digest("hex"), cleanDescription: posting.description,
    } });
    const application = await tx.application.create({ data: {
      jobId: job.id, status: tailor ? "TAILORING" : "CAPTURED",
      events: { create: { eventType: "discovery_approved", toValue: tailor ? "TAILORING" : "CAPTURED", detail: { source: posting.sourceKey, postingId: id } } },
      ...(tailor ? { tailoringRuns: { create: { runNumber: 1, status: "QUEUED" } } } : {}),
    } });
    await tx.discoveryPosting.update({ where: { id }, data: { approvedApplicationId: application.id, dismissedAt: null } });
    return { id: application.id, duplicate: false };
  }, { timeout: 15_000 });
}
