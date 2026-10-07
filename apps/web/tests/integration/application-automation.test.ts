import "dotenv/config";
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { assertIsolatedDatabase } from "../../src/lib/test-database";
import { emptyApplicationProfile } from "../../src/lib/application-profile";
const testUrl = process.env.AIADAPPLY_E2E_DATABASE_URL;
if (!testUrl) throw new Error("An isolated test database is required.");
assertIsolatedDatabase(testUrl, process.env.DATABASE_URL!);
process.env.DATABASE_URL = testUrl; process.env.DIRECT_URL = process.env.AIADAPPLY_E2E_DIRECT_URL || testUrl;
process.env.WORKER_SECRET = "isolated-application-test";
let db: PrismaClient, original: Prisma.JsonValue | undefined;
const jobs: string[] = [];
before(async () => {
  db = (await import("../../src/lib/db")).db;
  original = (await db.setting.findUnique({ where: { key: "application-profile" } }))?.value;
  const value = { ...emptyApplicationProfile, firstName: "Test", lastName: "Person", email: "test@example.com", phone: "5550000000" };
  await db.setting.upsert({ where: { key: "application-profile" }, create: { key: "application-profile", value }, update: { value } });
});
after(async () => {
  await db.job.deleteMany({ where: { id: { in: jobs } } });
  if (original) await db.setting.upsert({ where: { key: "application-profile" }, create: { key: "application-profile", value: original as Prisma.InputJsonValue }, update: { value: original as Prisma.InputJsonValue } });
  else await db.setting.deleteMany({ where: { key: "application-profile" } });
  await db.setting.deleteMany({ where: { key: "application-browser:heartbeat" } });
  await db.$disconnect();
});
async function fixture() {
  const label = `automation-${randomUUID()}`, bytes = Buffer.from('%PDF-1.4\nfixture');
  const job = await db.job.create({ data: { company: label, title: "Support", rawPaste: label, rawPasteSha256: createHash('sha256').update(label).digest('hex'), sourceUrl: `https://jobs.lever.co/fixture/${randomUUID()}`, application: { create: { status: "REVIEW", tailoringRuns: { create: { status: "SUCCEEDED", validationPassed: true, pageCount: 1, reportSnapshot: { tailoring_mode: "evidence_only" }, artifacts: { create: { kind: "PDF", fileName: "fixture.pdf", sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, backup: { create: { content: bytes } } } } } } } } }, include: { application: { include: { tailoringRuns: { include: { artifacts: true } } } } } });
  jobs.push(job.id);
  const app = job.application!, run = app.tailoringRuns[0], pdf = run.artifacts[0];
  return { app, run, pdf, approve: { action: "approve", approved: true, runId: run.id, artifactId: pdf.id, resumeSha256: pdf.sha256!, destination: job.sourceUrl } };
}
async function user(id: string, body: unknown) {
  const { POST } = await import("../../src/app/api/applications/[id]/automation/route");
  return POST(new Request(`http://localhost/api/applications/${id}/automation`, { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
async function worker(body: Record<string, unknown>, workerId = "browser-test") {
  const { POST } = await import("../../src/app/api/worker/applications/route");
  return POST(new Request('http://localhost/api/worker/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer isolated-application-test' }, body: JSON.stringify({ workerId, ...body }) }));
}
test("explicit approval, exclusive claim, correct attachment and observed receipt are required", async () => {
  const f = await fixture();
  assert.equal((await worker({ action: 'claim' })).status, 204);
  assert.equal((await user(f.app.id, { ...f.approve, approved: false })).status, 400);
  assert.equal((await user(f.app.id, { ...f.approve, resumeSha256: 'b'.repeat(64) })).status, 409);
  const approval = await (await user(f.app.id, f.approve)).json();
  assert.ok(approval.attemptId);
  assert.equal((await user(f.app.id, f.approve)).status, 409);
  const claim = await (await worker({ action: 'claim' })).json();
  assert.equal(claim.runId, f.run.id);
  assert.equal(createHash('sha256').update(Buffer.from(claim.resumeBase64, 'base64')).digest('hex'), f.pdf.sha256);
  assert.equal((await worker({ action: 'claim' }, 'other-browser')).status, 204);
  const attemptId = claim.attemptId;
  assert.equal((await worker({ action: 'finish', attemptId, status: 'SUBMITTED', confirmation: 'Made up receipt' })).status, 409);
  assert.equal((await worker({ action: 'before_submit', attemptId, resumeSha256: 'b'.repeat(64), attachmentVerified: true })).status, 409);
  assert.equal((await worker({ action: 'before_submit', attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true, unresolved: ['Missing fact'] })).status, 409);
  assert.equal((await worker({ action: 'before_submit', attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true, unresolved: [] })).status, 200);
  assert.equal((await worker({ action: 'before_submit', attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true })).status, 409);
  const receipt = { action: 'finish', attemptId, status: 'SUBMITTED', summary: 'Confirmed', confirmation: 'Thank you for applying', confirmationUrl: 'https://jobs.lever.co/fixture/123/thanks', screenshot: '/test/confirmation.png' };
  assert.equal((await worker(receipt)).status, 200);
  assert.equal((await worker(receipt)).status, 200);
  assert.equal(await db.applicationEvent.count({ where: { applicationId: f.app.id, eventType: 'application_submitted' } }), 1);
  const saved = await db.application.findUniqueOrThrow({ where: { id: f.app.id } });
  assert.equal(saved.status, 'APPLIED'); assert.ok(saved.followUpAt);
});
test("canceled and changed approvals cannot run; uncertainty never queues a duplicate", async () => {
  const f = await fixture();
  const approval = await (await user(f.app.id, f.approve)).json();
  assert.equal((await user(f.app.id, { action: 'cancel', attemptId: approval.attemptId })).status, 200);
  assert.equal((await worker({ action: 'claim' })).status, 204);
  await user(f.app.id, f.approve);
  await db.job.update({ where: { id: f.app.jobId }, data: { applyUrl: 'https://jobs.lever.co/fixture/wrong' } });
  assert.equal((await worker({ action: 'claim' })).status, 204);
  assert.equal((await db.applicationEvent.findFirstOrThrow({ where: { applicationId: f.app.id, eventType: 'application_automation' }, orderBy: { occurredAt: 'desc' } })).toValue, 'BLOCKED');
  await db.job.update({ where: { id: f.app.jobId }, data: { applyUrl: null } });
  await user(f.app.id, f.approve);
  const claim = await (await worker({ action: 'claim' })).json();
  await worker({ action: 'before_submit', attemptId: claim.attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true });
  const result = await (await worker({ action: 'finish', attemptId: claim.attemptId, status: 'BLOCKED', summary: 'Connection lost' })).json();
  assert.equal(result.status, 'UNKNOWN');
  assert.equal((await user(f.app.id, f.approve)).status, 409);
  assert.notEqual((await db.application.findUniqueOrThrow({ where: { id: f.app.id } })).status, 'APPLIED');
});

test("new tailoring invalidates approval and expired submission leases never retry", async () => {
  const f = await fixture();
  await user(f.app.id, f.approve);
  await db.tailoringRun.create({ data: { applicationId: f.app.id, runNumber: 2, status: 'FAILED', queuedAt: new Date(Date.now() + 1000) } });
  assert.equal((await worker({ action: 'claim' })).status, 204);
  const first = await db.applicationEvent.findFirstOrThrow({ where: { applicationId: f.app.id, eventType: 'application_automation' }, orderBy: { occurredAt: 'desc' } });
  assert.equal(first.toValue, 'BLOCKED');
  const second = await fixture();
  await user(second.app.id, second.approve);
  const claim = await (await worker({ action: 'claim' })).json();
  await worker({ action: 'before_submit', attemptId: claim.attemptId, resumeSha256: second.pdf.sha256, attachmentVerified: true });
  const event = await db.applicationEvent.findUniqueOrThrow({ where: { id: claim.attemptId } });
  await db.applicationEvent.update({ where: { id: event.id }, data: { detail: { ...(event.detail as Prisma.JsonObject), updatedAt: new Date(Date.now() - 180000).toISOString() } } });
  assert.equal((await worker({ action: 'claim' }, 'replacement-worker')).status, 204);
  assert.equal((await db.applicationEvent.findUniqueOrThrow({ where: { id: event.id } })).toValue, 'UNKNOWN');
  assert.equal((await user(second.app.id, second.approve)).status, 409);
});

test("lost claim response replays only the same unstarted claim", async () => {
  const f = await fixture();
  await user(f.app.id, f.approve);
  const claimToken = randomUUID();
  const claim = await (await worker({ action: 'claim', claimToken })).json();
  const replay = await (await worker({ action: 'claim', claimToken })).json();
  assert.equal(replay.attemptId, claim.attemptId);
  assert.equal((await worker({ action: 'claim', claimToken: randomUUID() })).status, 204);
  await worker({ action: 'checkpoint', attemptId: claim.attemptId });
  assert.equal((await worker({ action: 'claim', claimToken })).status, 204);
  await worker({ action: 'finish', attemptId: claim.attemptId, status: 'BLOCKED', summary: 'Paused before submit' });
});

test("paused answers stay with the approved employer and changed artifacts cannot resume", async () => {
  const f = await fixture();
  await user(f.app.id, f.approve);
  const claim = await (await worker({ action: 'claim' })).json();
  await worker({ action: 'finish', attemptId: claim.attemptId, status: 'BLOCKED', unresolved: ['Employer question'], summary: 'Needs answer' });
  const answer = { question: 'Employer question', answer: 'Candidate confirmed answer' };
  assert.equal((await user(f.app.id, { action: 'resume', attemptId: claim.attemptId, answers: [answer] })).status, 200);
  const resumed = await (await worker({ action: 'claim' })).json();
  assert.deepEqual(resumed.confirmedAnswers, [answer]);
  assert.equal(resumed.resumeSha256, claim.resumeSha256);
  assert.equal(resumed.destination, claim.destination);
  assert.equal(resumed.approvedAt, claim.approvedAt);
  await worker({ action: 'finish', attemptId: resumed.attemptId, status: 'BLOCKED', summary: 'Paused' });
  await db.job.update({ where: { id: f.app.jobId }, data: { applyUrl: 'https://jobs.lever.co/changed/destination' } });
  assert.equal((await user(f.app.id, { action: 'resume', attemptId: resumed.attemptId, answers: [] })).status, 409);
  const other = await fixture();
  await user(other.app.id, other.approve);
  const unrelated = await (await worker({ action: 'claim' })).json();
  assert.deepEqual(unrelated.confirmedAnswers, []);
  await worker({ action: 'finish', attemptId: unrelated.attemptId, status: 'BLOCKED', summary: 'Test done' });
});

test("durable owner can reconcile a late receipt without rerunning submission", async () => {
  const f = await fixture();
  await user(f.app.id, f.approve);
  const claim = await (await worker({ action: 'claim' })).json();
  await worker({ action: 'before_submit', attemptId: claim.attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true });
  const event = await db.applicationEvent.findUniqueOrThrow({ where: { id: claim.attemptId } });
  await db.applicationEvent.update({ where: { id: event.id }, data: { detail: { ...(event.detail as Prisma.JsonObject), updatedAt: new Date(Date.now() - 180000).toISOString() } } });
  await worker({ action: 'claim' }, 'other-worker');
  const receipt = { action: 'finish', attemptId: claim.attemptId, status: 'SUBMITTED', confirmation: 'Thank you for applying', confirmationUrl: 'https://jobs.lever.co/fixture/123/thanks', screenshot: '/test/receipt.png', unresolved: [] };
  assert.equal((await worker(receipt, 'other-worker')).status, 409);
  assert.equal((await worker({ ...receipt, screenshot: undefined })).status, 409);
  assert.equal((await worker(receipt)).status, 200);
  assert.equal((await worker(receipt)).status, 200);
  assert.equal(await db.applicationEvent.count({ where: { applicationId: f.app.id, eventType: 'application_submitted' } }), 1);
});

test("preparation-only resume cannot submit, and normal resume restores the approved workflow", async () => {
  const f = await fixture();
  await user(f.app.id, f.approve);
  const original = await (await worker({ action: 'claim' })).json();
  await worker({ action: 'finish', attemptId: original.attemptId, status: 'BLOCKED', summary: 'Needs facts' });
  assert.equal((await user(f.app.id, { action: 'resume', attemptId: original.attemptId, prepareOnly: true, answers: [] })).status, 200);
  const prepared = await (await worker({ action: 'claim' })).json();
  assert.equal(prepared.prepareOnly, true);
  assert.equal((await worker({ action: 'checkpoint', attemptId: prepared.attemptId })).status, 200);
  assert.equal((await worker({ action: 'before_submit', attemptId: prepared.attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true, unresolved: [] })).status, 409);
  assert.equal((await worker({ action: 'finish', attemptId: prepared.attemptId, status: 'SUBMITTED', confirmation: 'Thank you for applying', confirmationUrl: 'https://jobs.lever.co/fixture/123/thanks', screenshot: '/test/receipt.png' })).status, 409);
  await worker({ action: 'finish', attemptId: prepared.attemptId, status: 'BLOCKED', summary: 'Preparation completed; submission disabled' });
  assert.equal((await user(f.app.id, { action: 'resume', attemptId: prepared.attemptId, answers: [] })).status, 200);
  const normal = await (await worker({ action: 'claim' })).json();
  assert.equal(normal.prepareOnly, false);
  assert.equal(normal.resumeSha256, original.resumeSha256);
  assert.equal(normal.approvedAt, original.approvedAt);
  assert.equal((await worker({ action: 'before_submit', attemptId: normal.attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true, unresolved: [] })).status, 200);
  await worker({ action: 'finish', attemptId: normal.attemptId, status: 'UNKNOWN', summary: 'Fixture finished without employer submission' });
});

test("upload proof records preparation separately from final attachment verification", async () => {
  const f = await fixture();
  const approval = await (await user(f.app.id, f.approve)).json();
  await worker({ action: "claim" });
  assert.equal((await worker({ action: "checkpoint", attemptId: approval.attemptId, uploadedResumeVerified: true, resumeSha256: "0".repeat(64) })).status, 409);
  assert.equal((await worker({ action: "checkpoint", attemptId: approval.attemptId, uploadedResumeVerified: true, resumeSha256: f.pdf.sha256 })).status, 200);
  const { readAttempt } = await import("../../src/lib/application-automation");
  const saved = readAttempt((await db.applicationEvent.findUniqueOrThrow({ where: { id: approval.attemptId } })).detail)!;
  assert.equal(saved.uploadedResumeVerified, true);
  assert.equal(saved.attachmentVerified, false);
  assert.equal(saved.status, "RUNNING");
  await worker({ action: "finish", attemptId: approval.attemptId, status: "BLOCKED", summary: "Preparation only" });
  const resumed = await (await user(f.app.id, { action: "resume", attemptId: approval.attemptId, answers: [], prepareOnly: true })).json();
  const next = readAttempt((await db.applicationEvent.findUniqueOrThrow({ where: { id: resumed.attemptId } })).detail)!;
  assert.equal(next.uploadedResumeVerified, false);
  await user(f.app.id, { action: "cancel", attemptId: resumed.attemptId });
});

test("recorded submissions prevent duplicate destination aliases and inform employer history", async () => {
  const first = await fixture();
  const second = await fixture();
  await db.job.update({ where: { id: first.app.jobId }, data: { company: "History Test Industries", sourceUrl: "https://boards.greenhouse.io/historytest/jobs/1234567?gh_jid=1234567" } });
  await db.application.update({ where: { id: first.app.id }, data: { status: "APPLIED", appliedAt: new Date() } });
  await db.job.update({ where: { id: second.app.jobId }, data: { company: "History Test", sourceUrl: "https://job-boards.greenhouse.io/historytest/jobs/1234567?utm_source=other" } });
  const duplicate = { ...second.approve, destination: "https://job-boards.greenhouse.io/historytest/jobs/1234567?utm_source=other" };
  assert.equal((await user(second.app.id, duplicate)).status, 409);
  const different = "https://job-boards.greenhouse.io/historytest/jobs/7654321";
  await db.job.update({ where: { id: second.app.jobId }, data: { sourceUrl: different } });
  assert.equal((await user(second.app.id, { ...second.approve, destination: different })).status, 200);
  const claim = await (await worker({ action: "claim" })).json();
  assert.equal(claim.applicationHistory[0].applicationId, first.app.id);
  await worker({ action: "finish", attemptId: claim.attemptId, status: "BLOCKED", summary: "Isolated history test" });
});


test("uncertain attempts require a fresh explicit retry authorization and retain their audit record", async () => {
  const f = await fixture();
  const approval = await (await user(f.app.id, f.approve)).json();
  const claim = await (await worker({ action: 'claim' })).json();
  assert.equal(claim.attemptId, approval.attemptId);
  await worker({ action: 'before_submit', attemptId: claim.attemptId, resumeSha256: f.pdf.sha256, attachmentVerified: true });
  await worker({ action: 'finish', attemptId: claim.attemptId, status: 'UNKNOWN', summary: 'Email verification unresolved' });
  const retry = { ...f.approve, action: 'retry_unconfirmed', attemptId: claim.attemptId, acknowledgeUnconfirmedSubmission: true };
  assert.equal((await user(f.app.id, f.approve)).status, 409);
  assert.equal((await user(f.app.id, { ...retry, acknowledgeUnconfirmedSubmission: false })).status, 400);
  assert.equal((await user(f.app.id, { ...retry, attemptId: randomUUID() })).status, 409);
  assert.equal((await user(f.app.id, { ...retry, resumeSha256: 'b'.repeat(64) })).status, 409);
  const response = await user(f.app.id, retry);
  assert.equal(response.status, 200);
  const next = await response.json();
  assert.notEqual(next.attemptId, claim.attemptId);
  assert.equal((await db.applicationEvent.findUniqueOrThrow({ where: { id: claim.attemptId } })).toValue, 'UNKNOWN');
  assert.equal(await db.applicationEvent.count({ where: { applicationId: f.app.id, eventType: 'application_retry_authorized' } }), 1);
  assert.equal((await user(f.app.id, retry)).status, 409);
  await user(f.app.id, { action: 'cancel', attemptId: next.attemptId });
});
