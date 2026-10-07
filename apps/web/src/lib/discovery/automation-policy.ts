import type { AutomationPreferences } from "./types";

type Candidate = {
  sourceKey: string; active: boolean; excluded: boolean; qualified: boolean;
  score: number; cautions: string[]; description: string;
  dismissedAt: unknown; approvedApplicationId: unknown;
  postedAt: Date | string | null; lastSeenAt: Date | string;
};
export function eligibleForAutoTailoring(p: Candidate, settings: AutomationPreferences, now = new Date()) {
  const posted = p.postedAt ? new Date(p.postedAt).getTime() : NaN;
  const seen = new Date(p.lastSeenAt).getTime();
  return settings.autoTailor && p.active && !p.excluded && p.qualified && !p.dismissedAt && !p.approvedApplicationId
    && p.cautions.length === 0 && p.score >= settings.minimumScore && p.description.trim().length >= 300
    && !/^(?:adzuna|usajobs):/.test(p.sourceKey)
    && Number.isFinite(posted) && posted <= now.getTime() && now.getTime() - posted <= 14 * 86400000
    && Number.isFinite(seen) && seen <= now.getTime() && now.getTime() - seen <= 12 * 3600000;
}
