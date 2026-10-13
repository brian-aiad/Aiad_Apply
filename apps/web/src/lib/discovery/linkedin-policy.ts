import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { normalizeLinkedInSearch } from "./linkedin-search.mjs";

export const LINKEDIN_STATE = "discovery:linkedin:state";
export const LINKEDIN_CONFIG = "discovery:linkedin:config";
export const LINKEDIN_META = "discovery:linkedin:job:";
export const LINKEDIN_QUEUE = "discovery:linkedin:queue";
export const LINKEDIN_SESSION = "discovery:linkedin:session";
export const TAILORING_CAPACITY = 4;
export type PremiumSignal = "TOP_APPLICANT" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | "UNKNOWN";
export const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function linkedInConfig(value: unknown) {
  const v = object(value);
  return { enabled: v.enabled === true, autoTailor: v.autoTailor === true,
    dailyLimit: typeof v.dailyLimit === "number" && Number.isInteger(v.dailyLimit) ? Math.max(1, Math.min(10, v.dailyLimit)) : 10,
    collectorId: typeof v.collectorId === "string" ? v.collectorId : null,
    preferredSearchUrl: normalizeLinkedInSearch(v.preferredSearchUrl), outreach: "drafts-only" as const };
}
export function pacificDayStart(now = new Date()) {
  return fromZonedTime(`${formatInTimeZone(now, "America/Los_Angeles", "yyyy-MM-dd")}T00:00:00`, "America/Los_Angeles");
}
export function premiumSignal(meta: unknown): PremiumSignal {
  const v = object(meta);
  if (v.topApplicant === true || v.premiumSignal === "TOP_APPLICANT") return "TOP_APPLICANT";
  const signal = String(v.premiumSignal || v.premiumMatch || "UNKNOWN").toUpperCase();
  return ["HIGH", "MEDIUM", "LOW", "NONE"].includes(signal) ? signal as PremiumSignal : "UNKNOWN";
}
type Candidate = { active: boolean; excluded: boolean; score: number; cautions: string[];
  description: string; postedAt: Date | string | null; lastSeenAt: Date | string;
  dismissedAt?: unknown; approvedApplicationId?: unknown };
export function linkedInEligibility(p: Candidate, meta: unknown, now = new Date()) {
  const m = object(meta);
  if (p.approvedApplicationId) return { status: "existing", reason: "Existing application" };
  if (p.dismissedAt) return { status: "dismissed", reason: "Dismissed" };
  if (!p.active) return { status: "unavailable", reason: "Posting no longer available" };
  if (p.excluded) return { status: "excluded", reason: p.cautions[0] || "Outside your role or search requirements" };
  if (m.destinationType === "EASY_APPLY") return { status: "needs_review", reason: "LinkedIn Easy Apply — manual application only" };
  if (!m.applyUrl) return { status: "needs_review", reason: "Employer application destination missing" };
  const posted = p.postedAt ? new Date(p.postedAt).getTime() : NaN;
  if (!Number.isFinite(posted) || posted > now.getTime() || now.getTime() - posted > 7 * 86400000) return { status: "needs_review", reason: "Posting date is unknown or outside the past seven days" };
  const seen = new Date(p.lastSeenAt).getTime();
  if (!Number.isFinite(seen) || seen > now.getTime() || now.getTime() - seen > 48 * 3600000) return { status: "needs_review", reason: "Posting needs a fresh observation" };
  if (p.description.trim().length < 300) return { status: "needs_review", reason: "Full job description required" };
  const gap = p.cautions.find(c => !c.startsWith("Work schedule:"));
  if (gap || p.score < 65) return { status: "needs_review", reason: gap || "Insufficient supported duty overlap" };
  return { status: "eligible", reason: "Strong supported fit; ready for automatic tailoring" };
}
export function rankLinkedIn(a: { score: number; postedAt: Date | string | null; linkedin?: unknown }, b: { score: number; postedAt: Date | string | null; linkedin?: unknown }) {
  // Premium breaks ties within a comparable fit band; it cannot rescue a weak fit.
  const weight = { TOP_APPLICANT: 4, HIGH: 3, MEDIUM: 2, LOW: 0, NONE: 1, UNKNOWN: 1 };
  return Math.floor(b.score / 10) - Math.floor(a.score / 10)
    || weight[premiumSignal(b.linkedin)] - weight[premiumSignal(a.linkedin)]
    || b.score - a.score || new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
}
export function scanGate(state: unknown, force: boolean, now = new Date()) {
  const s = object(state), at = now.getTime();
  const retry = Date.parse(String(s.retryAfter));
  if (Number.isFinite(retry) && at < retry) return { status: "cooldown", message: "LinkedIn is cooling down. You can paste a job or use employer feeds.", nextAllowedAt: new Date(retry).toISOString() };
  const start = Date.parse(String(s.startedAt));
  if (s.status === "running" && at - start < 15 * 60000) return { status: "running", message: "A LinkedIn scan is already running." };
  if (Number.isFinite(start) && at - start < (force ? 60000 : 86400000)) return { status: "not_due", message: "The next LinkedIn scan is not due yet.", nextAllowedAt: new Date(start + (force ? 60000 : 86400000)).toISOString() };
  return null;
}
