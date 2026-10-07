type Counter = { bucket: string; count: number };
type Budget = Record<string, Counter>;

// Conservative limits below the published default free allowance. Reserve before
// sending, including failed requests, and share counters across worker processes.
export function nextAdzunaBudget(value: unknown, now = new Date()): Budget {
  const previous = value && typeof value === "object" ? value as Budget : {};
  const day = now.toISOString().slice(0, 10);
  const buckets = [
    ["minute", now.toISOString().slice(0, 16), 20],
    ["day", day, 200],
    ["week", String(Math.floor((now.getTime() + 3 * 86400000) / (7 * 86400000))), 900],
    ["month", day.slice(0, 7), 2000],
  ] as const;
  return Object.fromEntries(buckets.map(([key, bucket, limit]) => {
    const old = previous[key];
    const count = old?.bucket === bucket && Number.isInteger(old.count) && old.count >= 0 ? old.count : 0;
    if (count >= limit) throw new Error(`Adzuna ${key} request budget reached; retry after this period resets.`);
    return [key, { bucket, count: count + 1 }];
  }));
}

export async function reserveAdzunaRequest() {
  const { db } = await import("@/lib/db");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074032)`;
    const key = "discovery:adzuna-budget";
    const current = await tx.setting.findUnique({ where: { key } });
    const value = nextAdzunaBudget(current?.value);
    await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  });
}
