import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test, { after, before } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

const testUrl = process.env.AIADAPPLY_E2E_DATABASE_URL;
if (!testUrl) throw new Error("AIADAPPLY_E2E_DATABASE_URL is required. Never use the normal database for these tests.");
const target = new URL(testUrl), normal = new URL(process.env.DATABASE_URL || "postgresql://localhost/unknown");
const identity = (url: URL) => `${url.hostname}:${url.port || "5432"}${url.pathname}?schema=${url.searchParams.get("schema") || "public"}`;
if (identity(target) === identity(normal)) throw new Error("Integration tests require a separate database or schema.");
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = process.env.AIADAPPLY_E2E_DIRECT_URL || testUrl;

let db: PrismaClient;
const jobIds: string[] = [];
const postingIds: string[] = [];
const prefix = `integration-${randomUUID()}`;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

before(async () => { db = (await import("../../src/lib/db")).db; });
after(async () => {
  if (!db) return;
  await db.discoveryPosting.deleteMany({ where: { id: { in: postingIds } } });
  await db.job.deleteMany({ where: { id: { in: jobIds } } });
  await db.$disconnect();
});

async function posting(label: string) {
  const id = hash(`${prefix}:${label}`); postingIds.push(id);
  return db.discoveryPosting.create({ data: { id, sourceKey: "lever:integration", externalId: label, company: `${prefix} Employer`, title: `Application Support Engineer ${label}`, location: "Long Beach, CA", sourceUrl: `https://jobs.lever.co/integration/${id}`, description: "Support a production SaaS application. Troubleshoot customer incidents with SQL, Postman and REST APIs. Manage Microsoft 365 and Entra ID user access, write Jira escalation notes and resolve SLA incidents. Required qualifications: two years of technical support experience and strong written communication.", employmentType: "Full-time", workArrangement: "Hybrid", salaryMin: 60000, salaryMax: 90000, salaryText: "$60,000–$90,000/year", score: 85, matchReasons: ["SQL", "APIs"], cautions: [], qualified: true } });
}

test("concurrent approval creates one application and one tailoring run", async () => {
  const { approvePosting } = await import("../../src/lib/discovery/service");
  const p = await posting("approval");
  const results = await Promise.all(Array.from({ length: 6 }, () => approvePosting(p.id, true)));
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  const application = await db.application.findUniqueOrThrow({ where: { id: results[0].id }, include: { job: true, tailoringRuns: true } });
  jobIds.push(application.jobId);
  assert.equal(application.status, "TAILORING"); assert.equal(application.tailoringRuns.length, 1);
  assert.match(application.job.rawPaste, /Company logo for,/);
  assert.equal(application.job.source, "lever");
  const { parseCapture } = await import("../../src/lib/job-parser");
  const parsed = parseCapture(application.job.rawPaste);
  assert.equal(parsed.company, p.company); assert.equal(parsed.title, p.title);
});

test("approval without tailoring saves a captured job without consuming a run", async () => {
  const { approvePosting } = await import("../../src/lib/discovery/service");
  const p = await posting("save-only");
  const result = await approvePosting(p.id, false);
  const app = await db.application.findUniqueOrThrow({ where: { id: result.id }, include: { tailoringRuns: true } }); jobIds.push(app.jobId);
  assert.equal(app.status, "CAPTURED"); assert.equal(app.tailoringRuns.length, 0);
  // An approval retry must not unexpectedly queue a run after a save-only action.
  await approvePosting(p.id, true);
  assert.equal(await db.tailoringRun.count({ where: { applicationId: app.id } }), 0);
});

test("stale or closed discoveries cannot be approved", async () => {
  const { approvePosting } = await import("../../src/lib/discovery/service");
  const p = await posting("stale");
  await db.discoveryPosting.update({ where: { id: p.id }, data: { lastSeenAt: new Date(Date.now() - 72 * 3600000) } });
  await assert.rejects(approvePosting(p.id, true), /not been checked/);
  await db.discoveryPosting.update({ where: { id: p.id }, data: { active: false } });
  await assert.rejects(approvePosting(p.id, true), /no longer listed/);
});

test("worker completion stores portable files, rejects corruption, and is idempotent", async () => {
  const p = await posting("worker");
  const { approvePosting } = await import("../../src/lib/discovery/service");
  const result = await approvePosting(p.id, true);
  const app = await db.application.findUniqueOrThrow({ where: { id: result.id }, include: { tailoringRuns: true } }); jobIds.push(app.jobId);
  const run = app.tailoringRuns[0];
  const workerId = "integration-worker";
  await db.tailoringRun.update({ where: { id: run.id }, data: { status: "RUNNING", workerId } });
  const { POST } = await import("../../src/app/api/worker/runs/[id]/route");
  const bytes = Buffer.from("%PDF-1.4 portable integration fixture");
  const artifact = { kind: "PDF", fileName: "integration.pdf", localPath: "/unavailable/on-this-device/integration.pdf", contentBase64: bytes.toString("base64"), sha256: hash(bytes.toString()), byteSize: bytes.length };
  const payload = { workerId, success: true, outputFolder: "/unavailable/on-this-device", report: { validation: { passed: true }, layout: { page_count: 1 } }, artifacts: [artifact] };
  const headers = { Authorization: `Bearer ${process.env.WORKER_SECRET || process.env.CRON_SECRET}`, "Content-Type": "application/json" };
  const context = { params: Promise.resolve({ id: run.id }) };
  const bad = await POST(new Request("http://localhost/api/worker/runs/test", { method: "POST", headers, body: JSON.stringify({ ...payload, artifacts: [{ ...artifact, sha256: "bad" }] }) }), context);
  assert.equal(bad.status, 400);
  const complete = () => POST(new Request("http://localhost/api/worker/runs/test", { method: "POST", headers, body: JSON.stringify(payload) }), context);
  assert.equal((await complete()).status, 200); assert.equal((await complete()).status, 200);
  const stored = await db.artifact.findMany({ where: { runId: run.id }, include: { backup: true } });
  assert.equal(stored.length, 1); assert.deepEqual(Buffer.from(stored[0].backup!.content), bytes);
  const { GET } = await import("../../src/app/api/artifacts/[id]/route");
  const download = await GET(new Request("http://localhost/api/artifacts/test"), { params: Promise.resolve({ id: stored[0].id }) });
  assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.match(download.headers.get("Content-Disposition")!, /integration.pdf/);
});

test("backup export includes portable bytes but excludes worker settings", async () => {
  const { GET } = await import("../../src/app/api/backup/route");
  const response = await GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.version, 1); assert.equal(data.format, "aiadapply-workspace");
  assert.ok(data.backups.length > 0);
  assert.ok(data.settings.every((s: { key: string }) => ["product", "discovery:preferences"].includes(s.key)));
  assert.ok(!JSON.stringify(data).includes(process.env.WORKER_SECRET || "NEVER_EXPORTED_SECRET"));
});

test("partial refresh preserves old jobs and dismissal; parallel scans have one owner", async () => {
  const { refreshDiscovery, SCAN_KEY } = await import("../../src/lib/discovery/service");
  const originalScan = await db.setting.findUnique({ where: { key: SCAN_KEY } });
  const p = await posting("failed-source");
  await db.discoveryPosting.update({ where: { id: p.id }, data: { sourceKey: "greenhouse:rocketlab", dismissedAt: new Date() } });
  await db.setting.upsert({ where: { key: SCAN_KEY }, create: { key: SCAN_KEY, value: { id: "expired-lease", status: "running", startedAt: new Date(Date.now() - 600000).toISOString(), sources: [], found: 0 } }, update: { value: { id: "expired-lease", status: "running", startedAt: new Date(Date.now() - 600000).toISOString(), sources: [], found: 0 } } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("rocketlab")) return new Response("unavailable", { status: 503 });
    if (url.includes("greenhouse")) return Response.json({ jobs: [] });
    if (url.includes("lever.co")) return Response.json([]);
    if (url.includes("ashbyhq")) return Response.json({ jobs: [] });
    return Response.json({ content: [], totalFound: 0 });
  };
  try {
    const results = await Promise.all(Array.from({ length: 4 }, () => refreshDiscovery(false)));
    assert.equal(results.filter((r) => r.claimed).length, 1);
    const preserved = await db.discoveryPosting.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(preserved.active, true); assert.ok(preserved.dismissedAt);
    const lease = await db.setting.findUniqueOrThrow({ where: { key: SCAN_KEY } });
    assert.match(JSON.stringify(lease.value), /failed/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalScan) await db.setting.update({ where: { key: SCAN_KEY }, data: { value: originalScan.value! } });
    else await db.setting.deleteMany({ where: { key: SCAN_KEY } });
  }
});

test("backup can be restored into an empty schema without overwriting existing work", async () => {
  const { GET } = await import("../../src/app/api/backup/route");
  const data = await (await GET()).json();
  const schema = `restore_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^restore_test_[a-f0-9]{32}$/);
  const target = new URL(testUrl!); target.searchParams.set("schema", schema);
  const destination = target.toString();
  const folder = await mkdtemp(path.join(tmpdir(), "aiadapply-restore-test-"));
  const file = path.join(folder, "backup.json");
  await writeFile(file, JSON.stringify(data));
  const env = { ...process.env, DATABASE_URL: destination, DIRECT_URL: destination };
  const run = (module: string, args: string[]) => execFileSync(process.execPath, [module, ...args], { cwd: process.cwd(), env, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
  const { PrismaClient } = await import("@prisma/client");
  const restored = new PrismaClient({ datasourceUrl: destination });
  try {
    run("node_modules/prisma/build/index.js", ["db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"]);
    const args = ["scripts/restore-backup.ts", "--file", file];
    assert.match(run("node_modules/tsx/dist/cli.mjs", args), /validated/);
    assert.equal(await restored.job.count(), 0);
    assert.match(run("node_modules/tsx/dist/cli.mjs", [...args, "--apply"]), /restored/);
    assert.equal(await restored.application.count(), data.applications.length);
    assert.equal(await restored.artifactBackup.count(), data.backups.length);
    assert.equal(await restored.tailoringRun.count({ where: { status: "RUNNING" } }), 0);
    assert.throws(() => run("node_modules/tsx/dist/cli.mjs", [...args, "--apply"]));
    assert.equal(await restored.application.count(), data.applications.length);
  } finally {
    await restored.$disconnect();
    // Only the randomly named schema created by this test is eligible for cleanup.
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await rm(folder, { recursive: true });
  }
});
