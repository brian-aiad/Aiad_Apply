import { DEFAULT_FOLLOW_UP_DAYS } from "@/lib/application-reminders";

export const DEFAULT_TIMEZONE = "America/Los_Angeles";
export const DEFAULT_DAILY_GOAL = 8;
export { DEFAULT_FOLLOW_UP_DAYS };

export const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export type ProductSettings = {
  dailyGoal: number;
  timezone: string;
  followUpDays: number;
  outputRoot?: string;
};

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function readProductSettings(value: unknown): ProductSettings {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const dailyGoal =
    typeof record.dailyGoal === "number" &&
    Number.isInteger(record.dailyGoal) &&
    record.dailyGoal >= 1 &&
    record.dailyGoal <= 50
      ? record.dailyGoal
      : DEFAULT_DAILY_GOAL;
  const timezone =
    typeof record.timezone === "string" && isValidTimezone(record.timezone)
      ? record.timezone
      : DEFAULT_TIMEZONE;
  const followUpDays =
    typeof record.followUpDays === "number" &&
    Number.isInteger(record.followUpDays) &&
    record.followUpDays >= 1 &&
    record.followUpDays <= 30
      ? record.followUpDays
      : DEFAULT_FOLLOW_UP_DAYS;

  return {
    dailyGoal,
    timezone,
    followUpDays,
    ...(typeof record.outputRoot === "string" ? { outputRoot: record.outputRoot } : {}),
  };
}
