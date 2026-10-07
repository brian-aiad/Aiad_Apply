import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerAuthorized, WORKER_ID_PATTERN } from "@/lib/worker-security";
import { AUTOMATION_EVENT, AUTOMATION_HEARTBEAT, questionSchema, readAttempt } from "@/lib/application-automation";
import { approvedMaterial, AutomationError, lockAutomation, saveAttempt } from "@/lib/application-automation-store";
import { automaticFollowUpAt } from "@/lib/application-reminders";
import { readProductSettings } from "@/lib/product-settings";

export const runtime = "nodejs";
const schema = z.object({
  action: z.enum(["claim", "heartbeat", "checkpoint", "before_submit", "finish"]),
  workerId: z.string().regex(WORKER_ID_PATTERN), claimToken: z.string().uuid().optional(), attemptId: z.string().uuid().optional(),
  summary: z.string().max(4000).optional(), questions: z.array(questionSchema).max(300).optional(),
  unresolved: z.array(z.string().max(2000)).max(100).optional(),
  resumeSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), attachmentVerified: z.boolean().optional(), uploadedResumeVerified: z.boolean().optional(),
  status: z.enum(["SUBMITTED", "BLOCKED", "UNKNOWN"]).optional(),
  confirmation: z.string().max(4000).optional(), confirmationUrl: z.string().url().optional(),
  screenshot: z.string().max(1000).optional(),
});
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid application-worker message." }, { status: 400 });
  const command = parsed.data;
  try {
    const response = await db.$transaction(async tx => {
      await lockAutomation(tx);
      const now = new Date().toISOString();
      await tx.setting.upsert({ where: { key: AUTOMATION_HEARTBEAT }, create: { key: AUTOMATION_HEARTBEAT, value: { at: now, workerId: command.workerId } }, update: { value: { at: now, workerId: command.workerId } } });
      if (command.action === "claim") {
        const active = await tx.applicationEvent.findMany({ where: { eventType: AUTOMATION_EVENT, toValue: { in: ["RUNNING", "SUBMITTING"] } } });
        for (const event of active) {
          const attempt = readAttempt(event.detail);
          if (!attempt) throw new AutomationError("An application attempt needs repair before the browser can continue.");
          if (command.claimToken && attempt.claimToken === command.claimToken && attempt.workerId === command.workerId && attempt.status === "RUNNING" && !attempt.submissionStartedAt && !attempt.browserStartedAt) {
            const { app, bytes, profile, applicationHistory } = await approvedMaterial(tx, event.applicationId, attempt);
            await saveAttempt(tx, event.id, attempt);
            return { attemptId: event.id, applicationId: app.id, ...attempt, company: app.job.company, title: app.job.title, posting: app.job.rawPaste, profile, applicationHistory, resumeBase64: bytes.toString("base64") };
          }
          if (Date.now() - Date.parse(attempt.updatedAt) < 120_000) return null;
          await saveAttempt(tx, event.id, { ...attempt, status: attempt.status === "SUBMITTING" ? "UNKNOWN" : "BLOCKED", summary: attempt.status === "SUBMITTING" ? "The worker disconnected during submission. Check the employer site before any retry; this has not been marked Applied." : "The browser worker disconnected before submission. Review the interruption before approving another attempt." });
        }
        const event = await tx.applicationEvent.findFirst({ where: { eventType: AUTOMATION_EVENT, toValue: "QUEUED" }, orderBy: { occurredAt: "asc" } });
        if (!event) return null;
        const attempt = readAttempt(event.detail);
        if (!attempt) throw new AutomationError("Unreadable approval.");
        try {
          const { app, bytes, profile, applicationHistory } = await approvedMaterial(tx, event.applicationId, attempt);
          await saveAttempt(tx, event.id, { ...attempt, status: "RUNNING", workerId: command.workerId, ...(command.claimToken ? { claimToken: command.claimToken } : {}), summary: "Opening the approved job and preparing its application." });
          return { attemptId: event.id, applicationId: app.id, ...attempt, status: "RUNNING", ...(command.claimToken ? { claimToken: command.claimToken } : {}), company: app.job.company, title: app.job.title, posting: app.job.rawPaste, profile, applicationHistory, resumeBase64: bytes.toString("base64") };
        } catch (error) {
          await saveAttempt(tx, event.id, { ...attempt, status: "BLOCKED", summary: error instanceof AutomationError ? error.message : "Could not load the approved resume." });
          return null;
        }
      }
      if (!command.attemptId) {
        if (command.action === "heartbeat") return { alive: true };
        throw new AutomationError("Missing attempt.", 400);
      }
      const event = await tx.applicationEvent.findUnique({ where: { id: command.attemptId } });
      const attempt = event?.eventType === AUTOMATION_EVENT ? readAttempt(event.detail) : null;
      if (!event || !attempt || attempt.workerId !== command.workerId) throw new AutomationError("Attempt ownership changed.");
      const lateReceipt = command.action === "finish" && command.status === "SUBMITTED" && attempt.status === "UNKNOWN" && !!attempt.submissionStartedAt;
      if (command.action === "finish" && ["SUBMITTED", "BLOCKED", "UNKNOWN"].includes(attempt.status) && !lateReceipt) {
        if (attempt.status === command.status) return { status: attempt.status, alreadyRecorded: true };
        throw new AutomationError("This attempt already has a final result.");
      }
      if (!["RUNNING", "SUBMITTING"].includes(attempt.status) && !lateReceipt) throw new AutomationError("This attempt is no longer authorized to continue.");
      if (command.action === "heartbeat") { await saveAttempt(tx, event.id, attempt); return { alive: true, status: attempt.status }; }
      if (command.questions) attempt.questions = command.questions;
      if (command.unresolved) attempt.unresolved = command.unresolved;
      if (command.summary) attempt.summary = command.summary;
      if (command.action === "checkpoint") {
        attempt.browserStartedAt ??= now;
        if (command.uploadedResumeVerified) {
          if (command.resumeSha256 !== attempt.resumeSha256) throw new AutomationError("Uploaded resume fingerprint does not match the approval.");
          attempt.uploadedResumeVerified = true;
        }
        if (attempt.status !== "RUNNING") throw new AutomationError("Submission has already started; do not repeat it.");
        await approvedMaterial(tx, event.applicationId, attempt);
      } else if (command.action === "before_submit") {
        if (attempt.prepareOnly) throw new AutomationError("This is a preparation-only attempt. Submission is not authorized for this attempt.");
        if (attempt.status !== "RUNNING") throw new AutomationError("Submission has already started; do not repeat it.");
        await approvedMaterial(tx, event.applicationId, attempt);
        if (command.resumeSha256 !== attempt.resumeSha256 || command.attachmentVerified !== true || attempt.unresolved.length) throw new AutomationError("Verify the approved attachment and resolve required questions before submission.");
        attempt.status = "SUBMITTING";
        attempt.submissionStartedAt = now;
        attempt.attachmentVerified = true;
        attempt.summary = "Correct resume verified. Submission is in progress; awaiting an employer confirmation.";
      } else if (command.action === "finish") {
        if (!command.status) throw new AutomationError("A result status is required.", 400);
        if (command.status === "SUBMITTED") {
          if ((attempt.status !== "SUBMITTING" && !lateReceipt) || !attempt.attachmentVerified || !command.confirmation?.trim() || !command.confirmationUrl || !command.screenshot || attempt.unresolved.length) throw new AutomationError("A confirmed employer receipt and verified attachment are required to record Applied.");
          const app = await tx.application.findUniqueOrThrow({ where: { id: event.applicationId } });
          const settings = await tx.setting.findUnique({ where: { key: "product" } });
          await tx.application.update({ where: { id: app.id }, data: { status: "APPLIED", appliedAt: app.appliedAt ?? new Date(), followUpAt: app.followUpAt ?? automaticFollowUpAt(new Date(), readProductSettings(settings?.value).followUpDays) } });
          await tx.applicationEvent.create({ data: { applicationId: app.id, eventType: "application_submitted", toValue: "APPLIED", detail: { runId: attempt.runId, runNumber: attempt.runNumber, resumeSha256: attempt.resumeSha256, destination: attempt.destination, attemptId: event.id, confirmation: command.confirmation, confirmationUrl: command.confirmationUrl, method: "verified_browser_confirmation" } } });
        }
        // Once the final click may have happened, lack of a receipt is uncertainty,
        // never a retryable pre-submission failure.
        attempt.status = attempt.status === "SUBMITTING" && command.status === "BLOCKED" ? "UNKNOWN" : command.status;
        attempt.confirmation = command.confirmation;
        attempt.confirmationUrl = command.confirmationUrl;
        attempt.screenshot = command.screenshot;
      }
      await saveAttempt(tx, event.id, attempt);
      return { status: attempt.status };
    }, { timeout: 30_000 });
    return response ? NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } }) : new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AutomationError ? error.message : "Application worker update failed." }, { status: error instanceof AutomationError ? error.status : 503 });
  }
}
