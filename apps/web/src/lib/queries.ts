import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";

const TIMEZONE = "America/Los_Angeles";

export function todayBounds() {
  const date = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const start = fromZonedTime(`${date}T00:00:00`, TIMEZONE);
  return { start, end: addDays(start, 1), date };
}

export async function getDashboard() {
  const { start, end } = todayBounds();
  const [applications, appliedToday, interviews, ready, total] = await Promise.all([
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
  ]);
  return { applications, appliedToday, interviews, ready, total, goal: 8 };
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
