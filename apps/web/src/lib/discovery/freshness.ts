/** Calendar posting dates stay calendar dates; discovery timestamps are not publication dates. */
export function postedWithin(value: Date | string | null, days: number, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Number.isFinite(date.getTime()) && date.getTime() <= now.getTime()
    && date.getTime() >= day - days * 86_400_000;
}
export function postingDateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
