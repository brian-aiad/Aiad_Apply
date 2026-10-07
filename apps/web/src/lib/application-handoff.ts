import { webUrl } from "./web-url";

type HandoffRun = { id: string; status: string; validationPassed: boolean | null; pageCount: number | null;
  reportSnapshot: unknown; artifacts: { id: string; kind: string; sha256: string | null }[] };
export function applicationDestination(applyUrl: string | null, sourceUrl: string | null) {
  for (const value of [applyUrl, sourceUrl]) {
    if (!value || !webUrl.safeParse(value).success) continue;
    const url = new URL(value);
    if (url.protocol !== "https:" || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) continue;
    return url.href;
  }
  return null;
}
export function applicationPortal(value: string | null) {
  if (!value) return "Employer website";
  const host = new URL(value).hostname;
  const belongs = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (belongs("lever.co")) return "Lever";
  if (belongs("greenhouse.io")) return "Greenhouse";
  if (belongs("myworkdayjobs.com") || belongs("myworkdaysite.com")) return "Workday";
  if (belongs("ashbyhq.com")) return "Ashby";
  if (belongs("icims.com")) return "iCIMS";
  if (belongs("simplify.jobs")) return "Simplify";
  return "Employer website";
}
export function handoffBlockers(status: string, run: HandoffRun | undefined, active: boolean, destination: string | null) {
  const blockers: string[] = [];
  if (["APPLIED", "INTERVIEW", "CLOSED"].includes(status)) blockers.push("This application is already submitted or closed.");
  if (active) blockers.push("Wait for tailoring to finish before preparing an application.");
  if (!run || run.status !== "SUCCEEDED" || run.validationPassed !== true || run.pageCount !== 1) blockers.push("Choose a successfully validated one-page resume.");
  if (!run?.artifacts.some(a => a.kind === "PDF" && a.sha256)) blockers.push("A verified PDF is required for browser autofill.");
  const report = run?.reportSnapshot as Record<string, unknown> | null;
  if (report?.tailoring_mode !== "evidence_only") blockers.push("Tailor again using the current experience-based policy before preparing this version.");
  if (!destination) blockers.push("Add the employer’s https application link below.");
  return blockers;
}
export function reviewedArtifactMatches(detail: unknown, runId: string, sha256: string) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return false;
  const data = detail as Record<string, unknown>;
  return data.runId === runId && data.resumeSha256 === sha256;
}
