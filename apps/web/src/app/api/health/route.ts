import { automationPlatformAllowed, selectedAutomationPlatform } from "@/lib/automation-device-policy";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { activeBase, AUTOMATION_POLICY_KEY, record } from "@/lib/workspace-material";
import { AUTOMATION_HEARTBEAT, browserWorkerOnline } from "@/lib/application-automation";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storageHealth } from "@/lib/storage-health";
import {
  workerHeartbeatCutoff,
  WORKER_HEARTBEAT_PREFIX,
} from "@/lib/worker-security";

export const runtime = "nodejs";

async function gmailHealth() {
  const root = path.resolve(process.cwd(), "../../.runtime");
  const credential = path.join(root, "application-gmail-oauth.json");
  const configuredOnThisDevice = await access(credential).then(() => true).catch(() => false);
  if (!configuredOnThisDevice) return { configuredOnThisDevice, verified: false, lastVerifiedAt: null };
  try {
    const [bytes, saved] = await Promise.all([readFile(credential), readFile(path.join(root, "gmail-connection-status.json"), "utf8")]);
    const status = JSON.parse(saved);
    const at = Date.parse(status.verifiedAt);
    const matches = status.mailboxMatches === true && status.readOnly === true && status.credentialSha256 === createHash("sha256").update(bytes).digest("hex") && Number.isFinite(at) && at <= Date.now();
    return { configuredOnThisDevice, verified: matches && Date.now() - at < 86400000, lastVerifiedAt: matches ? status.verifiedAt : null };
  } catch { return { configuredOnThisDevice, verified: false, lastVerifiedAt: null }; }
}

export async function GET() {
  try {
    const [activeRuns, liveWorkers] = await Promise.all([
      db.tailoringRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
      db.setting.count({
        where: {
          key: { startsWith: WORKER_HEARTBEAT_PREFIX },
          updatedAt: { gte: workerHeartbeatCutoff() },
        },
      }),
    ]);
    const [baseResumeReady, browser, linkedin, policy, gmail, linkedInScan] = await Promise.all([
      activeBase().then(() => true).catch(() => false),
      db.setting.findUnique({ where: { key: AUTOMATION_HEARTBEAT } }),
      db.setting.findUnique({ where: { key: "discovery:linkedin:session" } }),
      db.setting.findUnique({ where: { key: AUTOMATION_POLICY_KEY } }),
      gmailHealth(),
      db.setting.findUnique({ where: { key: "discovery:linkedin:state" } }),
    ]);
    return NextResponse.json({
      status: baseResumeReady && liveWorkers > 0 ? "ready" : "attention",
      database: true,
      baseResume: baseResumeReady,
      worker: liveWorkers > 0,
      workers: liveWorkers,
      activeRuns,
      applicationBrowser: { online: browserWorkerOnline(browser?.value) && automationPlatformAllowed(policy?.value, record(browser?.value).platform, "applications"), workerId: record(browser?.value).workerId ?? null, platform: record(browser?.value).platform ?? null },
      linkedin: { status: Date.parse(String(record(linkedInScan?.value).retryAfter)) > Date.now() ? "cooldown" : record(linkedin?.value).status ?? "unchecked", sessionStatus: record(linkedin?.value).status ?? "unchecked", retryAfter: record(linkedInScan?.value).retryAfter ?? null, lastCollectionStatus: record(linkedInScan?.value).status ?? null, checkedAt: record(linkedin?.value).checkedAt ?? null, stale: !linkedin || Date.now() - linkedin.updatedAt.getTime() > 86400000 },
      gmail,
      automation: { primaryPlatform: selectedAutomationPlatform(policy?.value), applicationPlatform: selectedAutomationPlatform(policy?.value, "applications"), startup: "dashboard-tailoring" },
      storage: storageHealth(),
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "offline",
        database: false,
        baseResume: false,
        worker: false,
        workers: 0,
        activeRuns: 0,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
