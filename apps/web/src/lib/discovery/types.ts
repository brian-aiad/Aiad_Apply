export type Provider = "greenhouse" | "lever" | "ashby" | "smartrecruiters";
export const TARGET_ROLES = ["Application support", "Technical support", "IT operations", "Systems support", "Implementation & integrations"];
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
  };
}
export type SourceResult = { sourceKey: string; company: string; status: "ok" | "partial" | "failed"; checked: number; found: number; message?: string };
export type ScanSummary = { id: string; startedAt: string; completedAt?: string; status: "running" | "completed" | "failed"; sources: SourceResult[]; found: number };
