import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calendarDayBounds(timezone: string, now = new Date()) {
  const date = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  // Convert both local midnights separately: DST days can be 23 or 25 hours.
  return { date, start: fromZonedTime(`${date}T00:00:00`, timezone), end: fromZonedTime(`${shiftDate(date, 1)}T00:00:00`, timezone) };
}

export function applicationActivity(appliedDates: Date[], timezone: string, goal: number, now = new Date()) {
  const { date: today } = calendarDayBounds(timezone, now);
  const counts = new Map<string, number>();
  for (const d of appliedDates) {
    if (!Number.isFinite(d.getTime()) || d > now) continue;
    const key = formatInTimeZone(d, timezone, "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -(weekday === 0 ? 6 : weekday - 1));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(monday, i);
    return { date, label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], count: counts.get(date) ?? 0, today: date === today, future: date > today };
  });
  let streak = 0;
  let cursor = (counts.get(today) ?? 0) > 0 ? today : shiftDate(today, -1);
  while ((counts.get(cursor) ?? 0) > 0) { streak++; cursor = shiftDate(cursor, -1); }
  return { week, streak, weekTotal: week.reduce((sum, d) => sum + d.count, 0), goalDays: week.filter((d) => !d.future && d.count >= goal).length, appliedToday: counts.get(today) ?? 0 };
}
