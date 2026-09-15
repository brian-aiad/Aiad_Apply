import type { ParsedCapture } from "./job-parser";

export type CaptureOverrides = {
  company?: string;
  title?: string;
  location?: string;
  workArrangement?: string;
  employmentType?: string;
};

export function applyCaptureOverrides(
  parsed: ParsedCapture,
  overrides: CaptureOverrides | undefined,
): ParsedCapture {
  if (!overrides) return parsed;
  const text = (value: string | undefined, fallback: string) =>
    value === undefined || !value.trim() ? fallback : value.trim();
  const optional = (value: string | undefined, fallback: string | null) =>
    value === undefined ? fallback : value.trim() || null;

  return {
    ...parsed,
    company: text(overrides.company, parsed.company),
    title: text(overrides.title, parsed.title),
    location: optional(overrides.location, parsed.location),
    workArrangement: optional(overrides.workArrangement, parsed.workArrangement),
    employmentType: optional(overrides.employmentType, parsed.employmentType),
  };
}
