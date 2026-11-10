import {listingAgeBlocker,currentPublicDeadline} from './listing-age';
import type { AutomationPreferences } from "./types";

type Candidate = {
  sourceKey: string; active: boolean; excluded: boolean; qualified: boolean;
  score: number; cautions: string[]; description: string;
  dismissedAt: unknown; approvedApplicationId: unknown;
  postedAt: Date | string | null; lastSeenAt: Date | string;
};
export function autoTailoringBlockers(p: Candidate, settings: AutomationPreferences, now = new Date()): string[] {
  const posted = p.postedAt ? new Date(p.postedAt).getTime() : NaN;
  const seen = new Date(p.lastSeenAt).getTime();
  // These live public boards omit original publication dates. Their collectors
  // reconfirm active detail/feed records; never invent a date or waive freshness.
  const undatedLiveBoard = p.postedAt === null && ["trinet:balboa", "luxus:careers"].includes(p.sourceKey);
  const officialOpenDeadline = p.postedAt === null && currentPublicDeadline(p,now);
  const ageBlocker=listingAgeBlocker(p,now);
  return [
    ...(ageBlocker?[ageBlocker]:[]),
    ...(!settings.autoTailor ? ["Automatic tailoring is paused."] : []),
    ...(!p.active ? ["No longer confirmed open."] : []),
    ...(p.excluded ? ["Outside saved pay, worksite, employment or role criteria."] : []),
    ...(!p.qualified ? ["Material role requirements need review."] : []),
    ...(p.dismissedAt ? ["Dismissed by you."] : []),
    ...(p.approvedApplicationId ? ["Already saved as an application; review its existing resume/status."] : []),
    ...p.cautions.filter(c => !c.startsWith("Work schedule:")),
    ...(p.score < settings.minimumScore ? [`Fit score ${p.score} is below ${settings.minimumScore}.`] : []),
    ...(p.description.trim().length < 300 ? ["Full employer description is missing."] : []),
    ...(/^(?:adzuna|usajobs|linkedin):/.test(p.sourceKey) ? ["Uses its separate capture or review queue."] : []),
    ...((!Number.isFinite(posted) && !undatedLiveBoard && !officialOpenDeadline) || posted > now.getTime() ? ["Original posting date is missing or invalid."] : []),
    ...(!Number.isFinite(seen) || seen > now.getTime() || now.getTime() - seen > 12 * 3600000 ? ["Employer has not reconfirmed this listing in the last 12 hours."] : []),
  ];
}

export function eligibleForAutoTailoring(p: Candidate, settings: AutomationPreferences, now = new Date()) {
  // Fresh employer observation, original-age policy and duplicates all apply.
  return autoTailoringBlockers(p, settings, now).length === 0;
}
