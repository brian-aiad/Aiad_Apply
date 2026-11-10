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
  authorizationMode: z.enum(["manual", "automatic"]).optional(),
  authorizationId: z.string().uuid().optional(),
  executionPlatform: z.enum(["win32", "darwin", "linux"]).optional(),
  executionVersion: z.string().max(100).optional(),
  technicalRetryCount: z.number().int().min(0).max(3).optional(),
  liveEligibility: z.object({ sourceUrl: z.string().url(), evidenceText: z.string().min(20).max(10000), worksite: z.string().min(2).max(300), observedAt: z.string().datetime() }).optional(),
  verification: z.enum(["required", "rejected", "expired"]).optional(),
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

/** Reconcile a parked attempt only against an already-recorded exact employer receipt. */
export function attemptWithReceipt(attempt: ApplicationAttempt | null, receipt: unknown): ApplicationAttempt | null {
  if (!attempt || !["BLOCKED", "UNKNOWN"].includes(attempt.status) || !receipt || typeof receipt !== "object") return null;
  const value = receipt as Record<string, unknown>;
  if (value.runId !== attempt.runId || value.resumeSha256 !== attempt.resumeSha256 || value.destination !== attempt.destination || typeof value.confirmation !== "string" || !value.confirmation.trim()) return null;
  return { ...attempt, status: "SUBMITTED", unresolved: [], confirmation: value.confirmation,
    summary: "Employer submission confirmed outside the parked browser attempt." };
}

export function attemptInterrupted(attempt: ApplicationAttempt | null, now = Date.now()) {
  return !!attempt && ["RUNNING", "SUBMITTING"].includes(attempt.status) && now - Date.parse(attempt.updatedAt) >= 120_000;
}

/** Browser-control failures are diagnostics, not questions about the candidate. */
export function isTechnicalApplicationBlocker(message: string): boolean {
  return /exact option wording|inspect (?:the )?(?:open )?(?:dropdown|options)|no unique exact option|technical form.control|supported number of steps|committed answer|did not (?:retain|verify)|could not identify.*(?:control|upload)/i.test(message);
}

export function isPortalAccessBlocker(message: string): boolean {
  return /\b(?:captcha|sign[ -]?in|log[ -]?in|password|verification code|security code|one.time code|authenticate|authentication)\b/i.test(message);
}

/** Only recorded unanswered form questions may request candidate information. */
export function missingCandidateQuestions(attempt: Pick<ApplicationAttempt, "questions"> | null | undefined): string[] {
  return [...new Set((attempt?.questions ?? []).filter(q => q.source === "unanswered" && !q.answer.trim() &&
    !isTechnicalApplicationBlocker(q.question) && (!isPortalAccessBlocker(q.question) || /\b(?:experience|troubleshoot\w*|describe|knowledge|familiar)\b/i.test(q.question))).map(q => q.question))];
}
