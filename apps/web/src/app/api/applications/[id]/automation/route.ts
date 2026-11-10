import { AUTONOMY_KEY, AUTONOMY_EXECUTION_VERSION, unresolvedExportRisks, readAutonomy } from "@/lib/application-autonomy-policy";
import { reusableQuestion, mergeReusableAnswers } from "@/lib/reusable-answers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crossOriginMutation } from "@/lib/web-url";
import { AUTOMATION_EVENT, attemptInterrupted, confirmedAnswerSchema, browserWorkerOnline, canApproveAfter, type ApplicationAttempt } from "@/lib/application-automation";
import { approvedMaterial, automationView, AutomationError, currentAttempt, lockAutomation, saveAttempt } from "@/lib/application-automation-store";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), approved: z.literal(true), runId: z.string().uuid(), artifactId: z.string().uuid(), resumeSha256: z.string().regex(/^[a-f0-9]{64}$/), destination: z.string().url() }),
  z.object({ action: z.literal("retry_unconfirmed"), attemptId: z.string().uuid(), acknowledgeUnconfirmedSubmission: z.literal(true), approved: z.literal(true), runId: z.string().uuid(), artifactId: z.string().uuid(), resumeSha256: z.string().regex(/^[a-f0-9]{64}$/), destination: z.string().url() }),
  z.object({ action: z.literal("resume"), attemptId: z.string().uuid(), prepareOnly: z.boolean().optional(), answers: z.array(confirmedAnswerSchema.extend({ saveForFuture: z.boolean().optional() })).max(100) }),
  z.object({ action: z.literal("resume_latest"), attemptId: z.string().uuid(), runId: z.string().uuid(), artifactId: z.string().uuid(), resumeSha256: z.string().regex(/^[a-f0-9]{64}$/), destination: z.string().url(), answers: z.array(confirmedAnswerSchema.extend({ saveForFuture: z.boolean().optional() })).max(100) }),
  z.object({ action: z.literal("cancel"), attemptId: z.string().uuid() }),
]);
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  const view = await automationView(id);
  return NextResponse.json({ automatic: readAutonomy((await db.setting.findUnique({ where: { key: AUTONOMY_KEY } }))?.value).enabled, attempt: view.attempt, applicationPlatform: view.applicationPlatform, onDemandAvailable: view.onDemandAvailable, workerOnline: browserWorkerOnline(view.heartbeat), interrupted: attemptInterrupted(view.attempt as ApplicationAttempt | null) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const { id } = await context.params;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Choose and approve the exact resume version." }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      await lockAutomation(tx);
      const previous = await currentAttempt(tx, id);
      if (input.data.action === "cancel") {
        if (previous?.id !== input.data.attemptId || !previous.detail || !["QUEUED", "RUNNING"].includes(previous.detail.status)) throw new AutomationError("This attempt can no longer be canceled. Check its result before trying again.");
        await saveAttempt(tx, previous.id, { ...previous.detail, status: "CANCELED", summary: "Canceled before submission." });
        return { canceled: true };
      }
      if (input.data.action === "resume" || input.data.action === "resume_latest") {
        if (previous?.id !== input.data.attemptId || previous.detail?.status !== "BLOCKED") throw new AutomationError("Only a pre-submission paused attempt can resume. Check the existing result first.");
        let original = previous.detail;
        if(original.submissionStartedAt)throw new AutomationError("A prior submission boundary must be resolved before resuming.");
        if (input.data.action === "resume_latest") {
          const selected = input.data;
          const config = readAutonomy((await tx.setting.findUnique({where:{key:AUTONOMY_KEY}}))?.value);
          if (!config.enabled || !config.authorizationId) throw new AutomationError("Enable automatic applications before resuming with a new PDF.");
          if (input.data.destination !== original.destination) throw new AutomationError("The employer destination changed. Review this application before resuming.");
          const latest = await tx.tailoringRun.findFirst({where:{applicationId:id},orderBy:{runNumber:"desc"},include:{artifacts:true}});
          const pdf = latest?.artifacts.find(a => a.id === selected.artifactId && a.kind === "PDF" && a.sha256 === selected.resumeSha256);
          if (!latest || latest.id !== input.data.runId || latest.status !== "SUCCEEDED" || latest.validationPassed !== true || latest.pageCount !== 1 || !pdf || unresolvedExportRisks(latest.reportSnapshot, latest.riskCount) > 0) throw new AutomationError("Choose the latest successfully validated, factual one-page PDF before resuming.");
          original = {...original, runId:latest.id,runNumber:latest.runNumber,artifactId:pdf.id,resumeSha256:pdf.sha256!,fileName:pdf.fileName,approvedAt:new Date().toISOString(),authorizationMode:"automatic",authorizationId:config.authorizationId,executionVersion:AUTONOMY_EXECUTION_VERSION};
        }
        // Resume re-verifies the live page. An expired old observation must not
        // block a fresh pre-submission attempt or be reused to authorize it.
        await approvedMaterial(tx, id, {...original,liveEligibility:undefined});
        const answers = new Map((original.confirmedAnswers ?? []).map(answer => [answer.question, answer]));
        for (const { question, answer } of input.data.answers) answers.set(question, { question, answer });
        const reusable = input.data.answers.filter(answer => answer.saveForFuture);
        if (reusable.some(answer => !reusableQuestion(answer.question))) throw new AutomationError("Employer consents and job-specific answers cannot be saved as global facts.", 400);
        if (reusable.length) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(731092643)::text`;
          const key = "application:reusable-answers";
          const previous = await tx.setting.findUnique({ where: { key } });
          let value;
          try { value = mergeReusableAnswers(previous?.value, reusable.map(({ question, answer }) => ({ question, answer }))); }
          catch (error) { throw new AutomationError(error instanceof Error ? error.message : "Reusable answer conflict."); }
          await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
        }
        if (answers.size > 100) throw new AutomationError("This application has too many saved answers. Review them before continuing.", 400);
        const attempt: ApplicationAttempt = { ...original, prepareOnly: input.data.action === "resume" ? input.data.prepareOnly ?? false : false, status: "QUEUED", updatedAt: new Date().toISOString(), workerId: undefined, executionPlatform: undefined, claimToken: undefined, browserStartedAt: undefined, liveEligibility: undefined, submissionStartedAt: undefined, confirmedAnswers: [...answers.values()], summary: input.data.action === "resume_latest" ? "Waiting to resume with the latest validated PDF under automatic authorization. Live eligibility and attachment will be checked again." : "Your answers are saved for this application only. Waiting to resume with the same approved resume.", questions: [], unresolved: [], uploadedResumeVerified: false, attachmentVerified: false, confirmation: undefined, confirmationUrl: undefined, screenshot: undefined };
        const event = await tx.applicationEvent.create({ data: { applicationId: id, eventType: AUTOMATION_EVENT, toValue: "QUEUED", detail: JSON.parse(JSON.stringify(attempt)) } });
        return { attemptId: event.id, status: "QUEUED" };
      }
      const command = input.data;
      const explicitRetry = command.action === "retry_unconfirmed";
      if (explicitRetry && (previous?.id !== command.attemptId || previous.detail?.status !== "UNKNOWN")) throw new AutomationError("Only the current unconfirmed attempt can be explicitly retried.");
      if (!explicitRetry && !canApproveAfter(previous?.detail ?? null)) throw new AutomationError("An attempt is already queued, in progress or submitted, or its submission is uncertain. Check the existing result first.");
      const { run, pdf } = await approvedMaterial(tx, id, command);
      const now = new Date().toISOString();
      const attempt: ApplicationAttempt = { prepareOnly: false, status: "QUEUED", runId: run.id, runNumber: run.runNumber, artifactId: pdf.id, resumeSha256: pdf.sha256!, fileName: pdf.fileName, destination: command.destination, approvedAt: now, updatedAt: now, summary: "Approved. Waiting for the local browser worker.", questions: [], unresolved: [], confirmedAnswers: explicitRetry ? previous!.detail!.confirmedAnswers ?? [] : [], attachmentVerified: false };
      const event = await tx.applicationEvent.create({ data: { applicationId: id, eventType: AUTOMATION_EVENT, toValue: "QUEUED", detail: attempt } });
      if (explicitRetry) await tx.applicationEvent.create({ data: { applicationId: id, eventType: "application_retry_authorized", detail: { previousAttemptId: previous!.id, newAttemptId: event.id, priorSubmissionUnconfirmed: true, resumeSha256: pdf.sha256, destination: command.destination } } });
      await tx.applicationEvent.create({ data: { applicationId: id, eventType: "application_prepared", toValue: run.id, detail: { runId: run.id, runNumber: run.runNumber, resumeSha256: pdf.sha256, destination: command.destination, submissionAuthorized: true, attemptId: event.id } } });
      await tx.application.update({ where: { id }, data: { status: "READY" } });
      return { attemptId: event.id, status: "QUEUED" };
    }, { timeout: 30_000 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof AutomationError ? error.message : "Could not update the application attempt." }, { status: error instanceof AutomationError ? error.status : 503 });
  }
}
