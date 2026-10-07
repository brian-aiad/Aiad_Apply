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
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
let db: PrismaClient, original: Prisma.JsonValue | undefined;
const jobs: string[] = [];
before(async () => { db = (await import("../../src/lib/db")).db; original = (await db.setting.findUnique({ where: { key: "application-profile" } }))?.value; });
after(async () => {
  await db.job.deleteMany({ where: { id: { in: jobs } } });
  if (original) await db.setting.upsert({ where: { key: "application-profile" }, create: { key: "application-profile", value: original as Prisma.InputJsonValue }, update: { value: original as Prisma.InputJsonValue } });
  else await db.setting.deleteMany({ where: { key: "application-profile" } });
  await db.$disconnect();
});
async function fixture(mode = "evidence_only") {
  const label = `handoff-${randomUUID()}`, bytes = Buffer.from('%PDF-1.4\nfixture');
  const job = await db.job.create({ data: { company: label, title: "Support", rawPaste: label, rawPasteSha256: createHash('sha256').update(label).digest('hex'), sourceUrl: "https://jobs.lever.co/fixture/123", application: { create: { status: "REVIEW", tailoringRuns: { create: { status: "SUCCEEDED", validationPassed: true, pageCount: 1, reportSnapshot: { tailoring_mode: mode }, artifacts: { create: { kind: "PDF", fileName: "fixture.pdf", sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, backup: { create: { content: bytes } } } } } } } } }, include: { application: { include: { tailoringRuns: { include: { artifacts: true } } } } } });
  jobs.push(job.id); return { app: job.application!, run: job.application!.tailoringRuns[0] };
}
async function call(id: string, body: unknown, origin?: string) {
  const { POST } = await import("../../src/app/api/applications/[id]/apply/route");
  return POST(new Request(`http://localhost/api/applications/${id}/apply`, { method: "POST", headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
test("review, verified packet, version-specific receipt and idempotent submission", async () => {
  const { app, run } = await fixture();
  assert.equal((await call(app.id, { action: "prepare", runId: run.id, reviewed: false })).status, 400);
  const profile = { ...emptyApplicationProfile, firstName: "Test", lastName: "Person", email: "test@example.com", phone: "5550000000", sponsorship: "Private answer" };
  await db.setting.upsert({ where: { key: "application-profile" }, create: { key: "application-profile", value: profile }, update: { value: profile } });
  const command = { action: "prepare", runId: run.id, reviewed: true };
  assert.equal((await call(app.id, command, "https://untrusted.test")).status, 403);
  assert.equal((await call(app.id, { action: "submitted", runId: run.id, confirmed: true, confirmation: "Test only" })).status, 409);
  const response = await call(app.id, command); assert.equal(response.status, 200);
  const packet = await response.json(); assert.equal(packet.runId, run.id); assert.equal(packet.contact.sponsorship, undefined);
  assert.equal(createHash('sha256').update(Buffer.from(packet.resume.base64, 'base64')).digest('hex'), packet.resume.sha256);
  assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status, "READY");
  assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).appliedAt, null);
  const submit = { action: "submitted", runId: run.id, confirmed: true, confirmation: "Isolated test receipt" };
  const results = await Promise.all([call(app.id, submit), call(app.id, submit)]); assert.ok(results.every(r => r.status === 200));
  assert.equal(await db.applicationEvent.count({ where: { applicationId: app.id, eventType: "application_submitted" } }), 1);
  const saved = await db.application.findUniqueOrThrow({ where: { id: app.id } }); assert.equal(saved.status, "APPLIED"); assert.ok(saved.appliedAt); assert.ok(saved.followUpAt);
  assert.equal((await call(app.id, { ...submit, runId: randomUUID() })).status, 409);
  assert.equal((await call(app.id, command)).status, 409);
});
test("legacy drafts, stale destination, wrong runs and tampered bytes cannot be prepared or recorded", async () => {
  const legacy = await fixture("aggressive_draft");
  assert.equal((await call(legacy.app.id, { action: "prepare", runId: legacy.run.id, reviewed: true })).status, 409);
  const { app, run } = await fixture(); const prepare = { action: "prepare", runId: run.id, reviewed: true };
  assert.equal((await call(app.id, { ...prepare, runId: legacy.run.id })).status, 409);
  assert.equal((await call(app.id, prepare)).status, 200);
  assert.equal((await call(app.id, { action: "destination", url: "https://jobs.lever.co/fixture/different" })).status, 200);
  assert.equal((await call(app.id, { action: "submitted", runId: run.id, confirmed: true, confirmation: "Test" })).status, 409);
  await db.artifactBackup.update({ where: { artifactId: run.artifacts[0].id }, data: { content: Buffer.from('tampered') } });
  assert.equal((await call(app.id, prepare)).status, 409);
});

test("Simplify handoff can save a reviewed version without exporting contact data", async () => {
  const { app, run } = await fixture();
  await db.setting.deleteMany({ where: { key: "application-profile" } });
  const response = await call(app.id, { action: "review", runId: run.id, reviewed: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reviewed: true, runId: run.id, runNumber: 1 });
  assert.equal((await call(app.id, { action: "prepare", runId: run.id, reviewed: true })).status, 409);
});

test("profile saving rejects stale forms and cross-origin changes", async () => {
  const { GET, PUT } = await import("../../src/app/api/application-profile/route");
  const current = await (await GET()).json();
  const write = (updatedAt: string | null, origin?: string) => PUT(new Request("http://localhost/api/application-profile", { method: "PUT", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify({ profile: { ...emptyApplicationProfile, firstName: "Test" }, updatedAt }) }));
  assert.equal((await write(current.updatedAt, "https://untrusted.test")).status, 403);
  assert.equal((await write(current.updatedAt)).status, 200);
  assert.equal((await write(current.updatedAt)).status, 409);
});
