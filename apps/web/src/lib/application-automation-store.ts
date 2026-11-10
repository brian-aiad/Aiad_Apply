import { automationPlatformAllowed, selectedAutomationPlatform } from "./automation-device-policy";
import { liveEligibilityBlockers, type LiveEligibility } from "./application-autonomy-eligibility";
import { readDiscoveryPreferences } from "./discovery/types";
import { AUTONOMY_KEY, readAutonomy } from "./application-autonomy-policy";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { applicationDestination, handoffBlockers, } from "./application-handoff";
import { AUTOMATION_POLICY_KEY, record } from "./workspace-material";
import { workerHeartbeatCutoff, WORKER_HEARTBEAT_PREFIX } from "./worker-security";
import { readVerifiedArtifact } from "./verified-artifact";
import { readApplicationProfile, missingContactFields } from "./application-profile";
import { AUTOMATION_EVENT, AUTOMATION_HEARTBEAT, readAttempt, type ApplicationAttempt } from "./application-automation";
import { applicationIdentity, sameEmployer } from "./application-history";
import { referralOnlyEmployer } from "./application-restrictions";

export class AutomationError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export async function lockAutomation(tx: Prisma.TransactionClient) {
  // One browser lane per installation. Locks cover approval, claim and result writes.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(731092641)::text`;
}
export async function currentAttempt(tx: Prisma.TransactionClient, applicationId: string) {
  const event = await tx.applicationEvent.findFirst({ where: { applicationId, eventType: AUTOMATION_EVENT }, orderBy: { occurredAt: "desc" } });
  return event ? { id: event.id, detail: readAttempt(event.detail) } : null;
}
export async function saveAttempt(tx: Prisma.TransactionClient, id: string, attempt: ApplicationAttempt) {
  attempt.updatedAt = new Date().toISOString();
  await tx.applicationEvent.update({ where: { id }, data: { toValue: attempt.status, detail: attempt as unknown as Prisma.InputJsonValue } });
}
export async function approvedMaterial(tx: Prisma.TransactionClient, applicationId: string, identity: { runId: string; artifactId: string; resumeSha256: string; destination: string; approvedAt?: string; authorizationMode?: "manual" | "automatic"; authorizationId?: string; liveEligibility?: LiveEligibility }) {
  if (identity.authorizationMode === "automatic") {
    const setting = readAutonomy((await tx.setting.findUnique({ where: { key: AUTONOMY_KEY } }))?.value);
    if (!setting.enabled || !identity.authorizationId || identity.authorizationId !== setting.authorizationId) throw new AutomationError("Automatic application authorization is paused or changed.");
    if (identity.liveEligibility) {
      const prefs = readDiscoveryPreferences((await tx.setting.findUnique({ where: { key: "discovery:preferences" } }))?.value);
      const errors = liveEligibilityBlockers(identity.liveEligibility, prefs);
      if (errors.length) throw new AutomationError(errors.join(" "));
    }
  }
  const app = await tx.application.findUnique({ where: { id: applicationId }, include: { job: true, tailoringRuns: { include: { artifacts: true } } } });
  if (!app) throw new AutomationError("Application not found.", 404);
  const policy = await tx.setting.findUnique({ where: { key: "application-policy" } });
  if (referralOnlyEmployer(app.job.company, [app.job.applyUrl, app.job.sourceUrl, identity.destination], policy?.value)) {
    throw new AutomationError("This employer is reserved for your referral contact. Automated applications are disabled.");
  }
  const run = app.tailoringRuns.find(r => r.id === identity.runId);
  if (identity.approvedAt && app.tailoringRuns.some(r => r.queuedAt.getTime() > Date.parse(identity.approvedAt!))) throw new AutomationError("A new tailoring run was started after approval. Review the intended version and approve again.");
  const destination = applicationDestination(app.job.applyUrl, app.job.sourceUrl);
  const blockers = handoffBlockers(app.status, run, app.tailoringRuns.some(r => ["QUEUED", "RUNNING"].includes(r.status)), destination);
  if (blockers.length) throw new AutomationError(blockers.join(" "));
  const submitted = await tx.application.findMany({ where: { id: { not: applicationId }, appliedAt: { not: null } }, select: { id: true, appliedAt: true, job: { select: { company: true, title: true, sourceUrl: true, applyUrl: true } } } });
  const key = applicationIdentity(destination);
  if (key && submitted.some(previous => [previous.job.applyUrl, previous.job.sourceUrl].some(url => applicationIdentity(url) === key))) throw new AutomationError("This job already has a recorded submission. Check the existing application instead of submitting a duplicate.");
  const applicationHistory = submitted.filter(previous => sameEmployer(previous.job.company, app.job.company)).map(previous => ({ applicationId: previous.id, title: previous.job.title, submittedAt: previous.appliedAt!.toISOString() }));
  const pdf = run!.artifacts.find(a => a.id === identity.artifactId && a.kind === "PDF" && a.sha256 === identity.resumeSha256);
  if (!pdf || destination !== identity.destination) throw new AutomationError("The resume or employer link changed. Approve the correct version again.");
  const bytes = await readVerifiedArtifact({ ...pdf, run: { outputFolder: run!.outputFolder } }, tx);
  if (!bytes || bytes.length > 5 * 1024 * 1024) throw new AutomationError("The approved PDF failed its file verification.");
  const row = await tx.setting.findUnique({ where: { key: "application-profile" } });
  const profile = readApplicationProfile(row?.value);
  if (missingContactFields(profile).length) throw new AutomationError("Save your name, email and phone in the application profile first.");
  return { app, run: run!, pdf, bytes, profile, applicationHistory };
}
export async function automationView(applicationId: string) {
  const [event, heartbeat, policy, workers] = await Promise.all([
    db.applicationEvent.findFirst({ where: { applicationId, eventType: AUTOMATION_EVENT }, orderBy: { occurredAt: "desc" } }),
    db.setting.findUnique({ where: { key: AUTOMATION_HEARTBEAT } }),
    db.setting.findUnique({ where: { key: AUTOMATION_POLICY_KEY } }),
    db.setting.findMany({ where: { key: { startsWith: WORKER_HEARTBEAT_PREFIX }, updatedAt: { gte: workerHeartbeatCutoff() } }, select: { value: true } }),
  ]);
  return { applicationPlatform: selectedAutomationPlatform(policy?.value, "applications"), attempt: event ? { id: event.id, ...readAttempt(event.detail) } : null, heartbeat: automationPlatformAllowed(policy?.value, record(heartbeat?.value).platform, "applications") ? heartbeat?.value ?? null : null, onDemandAvailable: selectedAutomationPlatform(policy?.value, "applications") === "win32" && workers.some(worker => record(worker.value).platform === "win32") };
}
