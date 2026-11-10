import { isTechnicalApplicationBlocker, readAttempt } from './application-automation';

export const automationGroups = [
  ['ALL', 'All automation'], ['ATTENTION', 'Needs attention'], ['ACTIVE', 'Active'], ['ANSWERS', 'Needs answers'],
  ['ACCESS', 'Portal access'], ['TECHNICAL', 'Technical issue'],
  ['UNKNOWN', 'Submission unconfirmed'], ['PARKED', 'Other parked'],
] as const;
export type AutomationGroup = typeof automationGroups[number][0];

/** Presentation only. Never changes authorization, eligibility or submission state. */
export function applicationAttention(status: string, event?: {toValue?: string | null; detail?: unknown} | null): Exclude<AutomationGroup, 'ALL'> | null {
  if (['APPLIED', 'INTERVIEW', 'CLOSED'].includes(status)) return null;
  const attempt = readAttempt(event?.detail);
  const state = attempt?.status || event?.toValue;
  if (state === 'UNKNOWN') return 'UNKNOWN';
  if (['QUEUED', 'RUNNING', 'SUBMITTING'].includes(state || '')) return 'ACTIVE';
  if (state !== 'BLOCKED') return null;
  const text = [attempt?.summary, ...(attempt?.unresolved || [])].join(' ');
  if (isTechnicalApplicationBlocker(text) || /\b(?:script error|script failed|schema validation|invalid schema)\b|browser.*(?:error|failed)|queue check failed|timeout|timed out/i.test(text)) return 'TECHNICAL';
  if (/captcha|sign[ -]?in|log[ -]?in|verification code|verify.*email|authentication|account access/i.test(text)) return 'ACCESS';
  if (attempt?.questions.some(q => q.source === 'unanswered') || /missing (?:candidate )?fact|unanswered|required (?:answer|information)|candidate.*confirm/i.test(text)) return 'ANSWERS';
  return 'PARKED';
}

export function attentionLabel(group: AutomationGroup | null | undefined) {
  return automationGroups.find(([key]) => key === group)?.[1] || '';
}

export function matchesAutomationGroup(group: AutomationGroup | null | undefined, filter: AutomationGroup) {
  return filter === 'ALL' || (filter === 'ATTENTION' ? Boolean(group && group !== 'ACTIVE') : group === filter);
}
