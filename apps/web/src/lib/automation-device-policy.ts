export type AutomationPurpose = "discovery" | "applications";
export function selectedAutomationPlatform(value: unknown, purpose: AutomationPurpose = "discovery") {
  const policy = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const selected = purpose === "applications" ? policy.applicationPlatform ?? policy.browserPlatform : policy.browserPlatform;
  return typeof selected === "string" ? selected : null;
}
export function automationPlatformAllowed(value: unknown, platform: unknown, purpose: AutomationPurpose = "discovery") {
  const selected = selectedAutomationPlatform(value, purpose);
  return !selected || selected === platform;
}
