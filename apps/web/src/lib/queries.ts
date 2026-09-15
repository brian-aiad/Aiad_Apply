import { db } from "@/lib/db";
import { DEFAULT_TIMEZONE, readProductSettings } from "@/lib/product-settings";
import { applicationActivity, calendarDayBounds } from "@/lib/accountability";
import { chooseNextAction } from "@/lib/next-action";
import { workerHeartbeatCutoff, WORKER_HEARTBEAT_PREFIX } from "@/lib/worker-security";

export function todayBounds(timezone = DEFAULT_TIMEZONE) {
  return calendarDayBounds(timezone);
}

export async function getDashboard() {
  const setting = await db.setting.findUnique({ where: { key: "product" } });
  const product = readProductSettings(setting?.value);
  const { start, end } = todayBounds(product.timezone);
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
  ] = await Promise.all([
    db.application.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: {
        job: true,
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
    db.application.findMany({ where: { status: { in: ["APPLIED", "INTERVIEW"] }, followUpAt: { lt: end } }, include: { job: true }, orderBy: { followUpAt: "asc" }, take: 8 }),
    db.application.findMany({
      where: { status: { in: ["READY", "REVIEW", "CAPTURED", "TAILORING"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        job: { select: { company: true, title: true } },
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
  ]);
  return {
    applications,
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
      applications: actionCandidates,
      strongDiscoveries,
      workerAvailable: liveWorkers > 0,
    }),
  };
}

export async function getApplications() {
  return db.application.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      job: true,
      tailoringRuns: { take: 1, orderBy: { runNumber: "desc" } },
    },
  });
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
