import { AUTOMATION_EVENT, readAttempt, attemptWithReceipt } from "@/lib/application-automation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crossOriginMutation, webUrl } from "@/lib/web-url";
import { applicationDestination, handoffBlockers, reviewedArtifactMatches } from "@/lib/application-handoff";
import { autofillContact, missingContactFields, readApplicationProfile } from "@/lib/application-profile";
import { readVerifiedArtifact } from "@/lib/verified-artifact";
import { readProductSettings } from "@/lib/product-settings";
import { resolveFollowUpUpdate } from "@/lib/application-reminders";
import { currentAttempt, lockAutomation, saveAttempt } from "@/lib/application-automation-store";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("destination"), url: webUrl }),
  z.object({ action: z.literal("review"), runId: z.string().uuid(), reviewed: z.literal(true) }),
  z.object({ action: z.literal("prepare"), runId: z.string().uuid(), reviewed: z.literal(true) }),
  z.object({ action: z.literal("submitted"), runId: z.string().uuid(), confirmation: z.string().trim().min(1).max(2000), confirmed: z.literal(true) }),
]);
class ApplyError extends Error { constructor(message: string, readonly status = 409) { super(message); } }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const { id } = await context.params;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !input.success) return NextResponse.json({ error: "Check the application, selected version and review confirmation." }, { status: 400 });
  const command = input.data;
  try {
    const result = await db.$transaction(async tx => {
      await lockAutomation(tx);
      await tx.$queryRaw`SELECT id FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
      const application = await tx.application.findUnique({ where: { id }, include: {
        job: true, tailoringRuns: { include: { artifacts: true } },
      } });
      if (!application) throw new ApplyError("Application not found.", 404);
      const automation = await currentAttempt(tx, id);
      if (automation?.detail && ["QUEUED", "RUNNING", "SUBMITTING"].includes(automation.detail.status)) throw new ApplyError("An approved automatic application is in progress. Cancel it before using the manual workflow or changing the employer link.");
      if (command.action === "destination") {
        const url = applicationDestination(command.url, null);
        if (!url) throw new ApplyError("Use the employer’s public https application link.", 400);
        await tx.job.update({ where: { id: application.jobId }, data: { applyUrl: url } });
        return { saved: true, url };
      }
      const run = application.tailoringRuns.find(r => r.id === command.runId);
      const destination = applicationDestination(application.job.applyUrl, application.job.sourceUrl);
      if (command.action === "submitted" && application.status === "APPLIED") {
        const receipt = await tx.applicationEvent.findFirst({ where: { applicationId: id, eventType: "application_submitted" }, orderBy: { occurredAt: "desc" } });
        const detail = receipt?.detail as { runId?: string } | null;
        if (detail?.runId !== command.runId) throw new ApplyError("A different submission is already recorded. Review the application history.");
        const reconciled = attemptWithReceipt(automation?.detail ?? null, receipt?.detail);
        if (reconciled && automation) await saveAttempt(tx, automation.id, reconciled);
        return { submitted: true, alreadyRecorded: true };
      }
      const blockers = handoffBlockers(application.status, run, application.tailoringRuns.some(r => ["RUNNING", "QUEUED"].includes(r.status)), destination);
      if (blockers.length) throw new ApplyError(blockers.join(" "));
      const pdf = run!.artifacts.find(a => a.kind === "PDF" && a.sha256)!;
      if (command.action === "submitted") {
        const prepared = await tx.applicationEvent.findFirst({ where: { applicationId: id, eventType: "application_prepared" }, orderBy: { occurredAt: "desc" } });
        const preparedDetail = prepared?.detail as { destination?: string } | null;
        const manuallyPrepared = reviewedArtifactMatches(prepared?.detail, run!.id, pdf.sha256!) && preparedDetail?.destination === destination;
        // A candidate can finish a parked automatic form. Recording the employer
        // receipt must honor its verified exact PDF without requiring old review UI.
        const attempts = manuallyPrepared ? [] : await tx.applicationEvent.findMany({where:{applicationId:id,eventType:AUTOMATION_EVENT}});
        const automaticallyPrepared = attempts.some(event => {
          const attempt=readAttempt(event.detail);
          return attempt?.authorizationMode === "automatic" && Boolean(attempt.authorizationId) && attempt.uploadedResumeVerified === true && attempt.destination === destination && reviewedArtifactMatches(attempt,run!.id,pdf.sha256!);
        });
        if (!manuallyPrepared && !automaticallyPrepared) throw new ApplyError("Prepare this exact resume and employer destination before recording a submission.");
        const setting = await tx.setting.findUnique({ where: { key: "product" } });
        const now = new Date();
        const reminder = resolveFollowUpUpdate({ currentStatus: application.status, nextStatus: "APPLIED", currentFollowUpAt: application.followUpAt, requestedFollowUpAt: undefined, now, followUpDays: readProductSettings(setting?.value).followUpDays });
        await tx.application.update({ where: { id }, data: { status: "APPLIED", appliedAt: application.appliedAt ?? now, followUpAt: reminder.followUpAt } });
        await tx.applicationEvent.create({ data: { applicationId: id, eventType: "application_submitted", fromValue: application.status, toValue: "APPLIED", detail: { runId: run!.id, runNumber: run!.runNumber, resumeSha256: pdf.sha256, confirmation: command.confirmation, method: "candidate_confirmation", destination } } });
        const reconciled = attemptWithReceipt(automation?.detail ?? null, { runId: run!.id, resumeSha256: pdf.sha256, destination, confirmation: command.confirmation });
        if (reconciled && automation) await saveAttempt(tx, automation.id, reconciled);
        return { submitted: true, alreadyRecorded: false };
      }
      const setting = await tx.setting.findUnique({ where: { key: "application-profile" } });
      const profile = readApplicationProfile(setting?.value);
      const missing = missingContactFields(profile);
      if (command.action === "prepare" && missing.length) throw new ApplyError(`Save your application profile first: ${missing.join(", ")}.`);
      const bytes = await readVerifiedArtifact({ ...pdf, run: { outputFolder: run!.outputFolder } });
      if (!bytes || bytes.byteLength > 5 * 1024 * 1024) throw new ApplyError("The verified PDF is unavailable or larger than 5 MB. Generate a new version.");
      const preparedAt = new Date().toISOString();
      await tx.applicationEvent.create({ data: { applicationId: id, eventType: "application_prepared", toValue: run!.id, detail: { runId: run!.id, runNumber: run!.runNumber, resumeSha256: pdf.sha256, destination } } });
      await tx.application.update({ where: { id }, data: { status: "READY" } });
      if (command.action === "review") return { reviewed: true, runId: run!.id, runNumber: run!.runNumber };
      return { format: "aiadapply.application.v1", applicationId: id, company: application.job.company, title: application.job.title,
        targetUrl: destination, preparedAt, runId: run!.id, runNumber: run!.runNumber,
        contact: autofillContact(profile),
        resume: { fileName: pdf.fileName, mimeType: "application/pdf", sha256: pdf.sha256, base64: bytes.toString("base64") },
        // Only explicitly saved general contact fields travel into automatic filling.
        mode: "review_before_submit" };
    }, { timeout: 30_000 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApplyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not prepare the application. Refresh and try again." }, { status: 503 });
  }
}
