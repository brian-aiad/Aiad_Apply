import { access } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workerHeartbeatCutoff,
  WORKER_HEARTBEAT_PREFIX,
} from "@/lib/worker-security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [resume, activeRuns, liveWorkers] = await Promise.all([
      db.resumeVersion.findFirst({ where: { active: true } }),
      db.tailoringRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
      db.setting.count({
        where: {
          key: { startsWith: WORKER_HEARTBEAT_PREFIX },
          updatedAt: { gte: workerHeartbeatCutoff() },
        },
      }),
    ]);
    let baseResumeReady = false;
    if (resume?.localPath) {
      baseResumeReady = await access(resume.localPath).then(
        () => true,
        () => false,
      );
    }
    return NextResponse.json({
      status: baseResumeReady && liveWorkers > 0 ? "ready" : "attention",
      database: true,
      baseResume: baseResumeReady,
      worker: liveWorkers > 0,
      workers: liveWorkers,
      activeRuns,
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
