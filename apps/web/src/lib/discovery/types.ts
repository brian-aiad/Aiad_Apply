export type Provider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "adzuna" | "usajobs" | "jobicy" | "rtx" | "workday";
export const TARGET_ROLES = ["Application support", "Technical support", "Systems & business analysis", "IT operations", "Implementation & integrations", "Data operations & testing"];
export type Source = { key: string; provider: Provider; board: string; company: string; url: string };
export type Opening = {
  externalId: string;
  sourceKey: string;
  company: string;
  title: string;
  location: string;
  sourceUrl: string;
  description: string;
  employmentType: "Full-time" | "Other" | "Not listed";
  workArrangement: "On-site" | "Hybrid" | "Remote" | "Not listed";
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  postedAt: Date | null;
};
export type DiscoveryPreferences = {
  minimumSalary: number;
  radiusMiles: number;
  includeRemote: boolean;
  usCitizen?: boolean;
  clearance?: "none" | "secret" | "top-secret";
};
export const DEFAULT_DISCOVERY_PREFERENCES: DiscoveryPreferences = {
  minimumSalary: 60_000,
  radiusMiles: 30,
  includeRemote: false,
};
export function readDiscoveryPreferences(value: unknown): DiscoveryPreferences {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    minimumSalary: typeof v.minimumSalary === "number" && Number.isFinite(v.minimumSalary) && v.minimumSalary >= 60_000 && v.minimumSalary <= 300_000 ? v.minimumSalary : 60_000,
    radiusMiles: typeof v.radiusMiles === "number" && Number.isFinite(v.radiusMiles) && v.radiusMiles >= 1 && v.radiusMiles <= 30 ? v.radiusMiles : 30,
    includeRemote: v.includeRemote === true,
    ...(typeof v.usCitizen === "boolean" ? { usCitizen: v.usCitizen } : {}),
    ...(["none", "secret", "top-secret"].includes(String(v.clearance)) ? { clearance: v.clearance as "none" | "secret" | "top-secret" } : {}),
  };
}
export type SourceResult = { sourceKey: string; company: string; status: "ok" | "partial" | "failed"; checked: number; found: number; message?: string };
export type ScanSummary = { id: string; startedAt: string; completedAt?: string; status: "running" | "completed" | "failed"; sources: SourceResult[]; found: number };

export type AutomationPreferences = { scheduledSearch: boolean; intervalHours: number; autoTailor: boolean; dailyLimit: number; minimumScore: number };
export const DEFAULT_AUTOMATION: AutomationPreferences = { scheduledSearch: true, intervalHours: 6, autoTailor: false, dailyLimit: 2, minimumScore: 80 };
export function readAutomationPreferences(value: unknown): AutomationPreferences {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: string, fallback: number, min: number, max: number) => typeof v[key] === "number" && Number.isInteger(v[key]) && v[key] >= min && v[key] <= max ? v[key] as number : fallback;
  return { scheduledSearch: v.scheduledSearch !== false, autoTailor: v.autoTailor === true, intervalHours: number("intervalHours", 6, 4, 24), dailyLimit: number("dailyLimit", 2, 1, 5), minimumScore: number("minimumScore", 80, 75, 100) };
}
