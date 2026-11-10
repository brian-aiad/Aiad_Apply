import { applicationAttention } from './application-attention';
import { referralOnlyEmployer } from "./application-restrictions";
import { db } from "@/lib/db";
import { DEFAULT_TIMEZONE, readProductSettings } from "@/lib/product-settings";
import { applicationActivity, calendarDayBounds } from "@/lib/accountability";
import { chooseNextAction } from "@/lib/next-action";
import { workerHeartbeatCutoff, WORKER_HEARTBEAT_PREFIX } from "@/lib/worker-security";

export function todayBounds(timezone = DEFAULT_TIMEZONE) {
  return calendarDayBounds(timezone);
}

export async function getDashboard() {
  const [setting, policy] = await Promise.all([db.setting.findUnique({ where: { key: "product" } }), db.setting.findUnique({ where: { key: "application-policy" } })]);
  const product = readProductSettings(setting?.value);
  const { start, end } = todayBounds(product.timezone);
  const commitmentEvents = await db.applicationEvent.findMany({ where: { eventType: "commitment_scheduled", application: { status: { not: "CLOSED" } } }, orderBy: { occurredAt: "desc" }, take: 500, include: { application: { include: { job: true } } } });
  const seenCommitments = new Set<string>();
  const commitments = commitmentEvents.flatMap(event => {
    if (seenCommitments.has(event.applicationId)) return [];
    seenCommitments.add(event.applicationId);
    const dueAt = new Date(event.toValue || "");
    return Number.isFinite(dueAt.getTime()) ? [{ id: event.applicationId, dueAt, job: event.application.job }] : [];
  });
  const [
    applications,
    appliedToday,
    interviews,
    ready,
    total,
    captured,
    tailoring,
    review,
    applied,
    submissionDates,
    followUps,
    actionCandidates,
    strongDiscoveries,
    liveWorkers,
    automationCandidates,
  ] = await Promise.all([
    db.application.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: {
        job: true,
        events: { where: { eventType: "application_automation" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { toValue: true, detail: true } },
        tailoringRuns: { take: 1, orderBy: { runNumber: "desc" } },
      },
    }),
    db.application.count({ where: { appliedAt: { gte: start, lt: end } } }),
    db.application.count({ where: { status: "INTERVIEW" } }),
    db.application.count({ where: { status: "READY" } }),
    db.application.count(),
    db.application.count({ where: { status: "CAPTURED" } }),
    db.application.count({ where: { status: "TAILORING" } }),
    db.application.count({ where: { status: "REVIEW" } }),
    db.application.count({ where: { status: { in: ["APPLIED", "INTERVIEW", "CLOSED"] } } }),
    db.application.findMany({ where: { appliedAt: { not: null } }, select: { appliedAt: true } }),
    db.application.findMany({ where: { status: { in: ["APPLIED", "INTERVIEW"] }, followUpAt: { lt: end } }, include: { job: true }, orderBy: { followUpAt: "asc" }, take: 3 }),
    db.application.findMany({
      where: { status: { in: ["READY", "REVIEW", "CAPTURED", "TAILORING"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        job: { select: { company: true, title: true, sourceUrl: true, applyUrl: true } },
        events: { where: { eventType: "application_automation" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { toValue: true, detail: true } },
        tailoringRuns: {
          take: 1,
          orderBy: { runNumber: "desc" },
          select: { status: true, errorMessage: true },
        },
      },
    }),
    db.discoveryPosting.count({
      where: { active: true, qualified: true, dismissedAt: null, approvedApplicationId: null },
    }),
    db.setting.count({
      where: {
        key: { startsWith: WORKER_HEARTBEAT_PREFIX },
        updatedAt: { gte: workerHeartbeatCutoff() },
      },
    }),
    db.application.findMany({
      where: { status: { notIn: ['APPLIED', 'INTERVIEW', 'CLOSED'] }, events: { some: { eventType: 'application_automation' } } },
      select: { id: true, status: true, job: { select: { company: true, title: true } },
        events: { where: { eventType: 'application_automation' }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 1, select: { toValue: true, detail: true } } },
    }),
  ]);
  return {
    applications: applications.map(({ events, ...row }) => ({ ...row, automationStatus: events[0]?.toValue, automationGroup: applicationAttention(row.status, events[0]) })),
    needsAttention: automationCandidates.map(item => ({ id: item.id, job: item.job, group: applicationAttention(item.status, item.events[0]) }))
      .filter(item => item.group && item.group !== 'ACTIVE')
      .sort((a,b) => Number(b.group === 'UNKNOWN') - Number(a.group === 'UNKNOWN')),
    appliedToday,
    interviews,
    ready,
    total,
    captured,
    tailoring,
    review,
    applied,
    goal: product.dailyGoal,
    timezone: product.timezone,
    activity: applicationActivity(submissionDates.flatMap((a) => a.appliedAt ? [a.appliedAt] : []), product.timezone, product.dailyGoal),
    followUps,
    nextAction: chooseNextAction({
      followUps,
      commitments,
      applications: actionCandidates.map(item => ({ ...item, automationStatus: item.events[0]?.toValue, referralOnly: referralOnlyEmployer(item.job.company, [item.job.sourceUrl, item.job.applyUrl], policy?.value) })),
      strongDiscoveries,
      workerAvailable: liveWorkers > 0,
    }),
  };
}

export async function getApplications() {
  const rows = await db.application.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      job: true,
      events: { where: { eventType: "application_automation" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { toValue: true, detail: true } },
      tailoringRuns: { take: 1, orderBy: { runNumber: "desc" } },
    },
  });
  return rows.map(({ events, ...row }) => ({ ...row, automationStatus: events[0]?.toValue, automationGroup: applicationAttention(row.status, events[0]) }));
}

export async function getApplication(id: string) {
  return db.application.findUnique({
    where: { id },
    include: {
      job: true,
      events: { orderBy: { occurredAt: "desc" } },
      tailoringRuns: {
        orderBy: { runNumber: "desc" },
        include: {
          keywordDecisions: {
            orderBy: [{ accepted: "desc" }, { hiringImportance: "desc" }],
          },
          changes: { orderBy: [{ section: "asc" }, { paragraphId: "asc" }] },
          artifacts: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}
