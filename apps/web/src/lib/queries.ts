import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import { DEFAULT_TIMEZONE, readProductSettings } from "@/lib/product-settings";

export function todayBounds(timezone = DEFAULT_TIMEZONE) {
  const date = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const start = fromZonedTime(`${date}T00:00:00`, timezone);
  return { start, end: addDays(start, 1), date };
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
