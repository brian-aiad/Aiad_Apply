// Only durable user data belongs in a portable backup. Never restore worker leases.
export const PORTABLE_SETTING_KEYS = [
  "application:reusable-answers", "product", "discovery:preferences", "application-profile", "application-policy",
  "discovery:automation", "discovery:linkedin:config", "discovery:linkedin:assisted-capture",
  "workspace:candidate-profile", "workspace:onboarding", "workspace:base-resume", "workspace:automation",
];
export const portableSettingKey = (key: string) => PORTABLE_SETTING_KEYS.includes(key) || key.startsWith("discovery:linkedin:job:");
export function restoredEvent(event: Record<string, unknown>) {
  const detail = event.detail && typeof event.detail === "object" ? event.detail as Record<string, unknown> : null;
  if (event.eventType !== "application_automation" || !detail || !["QUEUED", "RUNNING", "SUBMITTING"].includes(String(detail.status))) return event;
  const uncertain = detail.status === "SUBMITTING" || Boolean(detail.submissionStartedAt);
  return { ...event, toValue: uncertain ? "UNKNOWN" : "BLOCKED", detail: { ...detail, status: uncertain ? "UNKNOWN" : "BLOCKED", workerId: undefined, claimToken: undefined,
    summary: uncertain ? "Restored submission was interrupted. Check the employer receipt before any retry." : "Restored approval is paused. Review and resume explicitly; no browser work was replayed." } };
}
