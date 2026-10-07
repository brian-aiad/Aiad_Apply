import { z } from "zod";

export const AUTOMATION_EVENT = "application_automation";
export const AUTOMATION_HEARTBEAT = "application-browser:heartbeat";
export const activeAutomationStates = ["QUEUED", "RUNNING", "SUBMITTING"];
export const questionSchema = z.object({
  question: z.string().max(2000), answer: z.string().max(12000),
  source: z.enum(["saved_profile", "approved_resume", "job_policy", "existing_answer", "unanswered"]),
});
export const confirmedAnswerSchema = z.object({ question: z.string().trim().min(1).max(2000), answer: z.string().trim().min(1).max(12000) });
export const attemptSchema = z.object({
  prepareOnly: z.boolean().default(false),
  status: z.enum(["QUEUED", "RUNNING", "SUBMITTING", "SUBMITTED", "BLOCKED", "UNKNOWN", "CANCELED"]),
  runId: z.string().uuid(), runNumber: z.number(), artifactId: z.string().uuid(),
  resumeSha256: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string(),
  destination: z.string().url(), approvedAt: z.string(), updatedAt: z.string(),
  workerId: z.string().optional(), claimToken: z.string().uuid().optional(), browserStartedAt: z.string().optional(), submissionStartedAt: z.string().optional(),
  confirmedAnswers: z.array(confirmedAnswerSchema).max(100).default([]), summary: z.string(),
  questions: z.array(questionSchema), unresolved: z.array(z.string()),
  confirmation: z.string().optional(), confirmationUrl: z.string().optional(),
  screenshot: z.string().optional(), uploadedResumeVerified: z.boolean().optional(), attachmentVerified: z.boolean().default(false),
});
export type ApplicationAttempt = z.infer<typeof attemptSchema>;
export function readAttempt(value: unknown): ApplicationAttempt | null {
  const parsed = attemptSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function browserWorkerOnline(value: unknown, now = Date.now()) {
  const heartbeat = value as { at?: unknown } | null;
  const age = typeof heartbeat?.at === "string" ? now - Date.parse(heartbeat.at) : NaN;
  return Number.isFinite(age) && age >= 0 && age < 45_000;
}
export function approvalMatches(attempt: ApplicationAttempt, runId: string, artifactId: string, sha256: string, destination: string | null) {
  return attempt.runId === runId && attempt.artifactId === artifactId && attempt.resumeSha256 === sha256 && attempt.destination === destination;
}
export function canApproveAfter(attempt: ApplicationAttempt | null) {
  return !attempt || ["BLOCKED", "CANCELED"].includes(attempt.status);
}

export function attemptInterrupted(attempt: ApplicationAttempt | null, now = Date.now()) {
  return !!attempt && ["RUNNING", "SUBMITTING"].includes(attempt.status) && now - Date.parse(attempt.updatedAt) >= 120_000;
}
