import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { baseResumePath } from "@/lib/base-resume";
import { storageHealth } from "@/lib/storage-health";
import {
  workerHeartbeatCutoff,
  WORKER_HEARTBEAT_PREFIX,
} from "@/lib/worker-security";

export const runtime = "nodejs";

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
    const baseResumeReady = await stat(await baseResumePath())
      .then((entry) => entry.isFile()).catch(() => false);
    return NextResponse.json({
      status: baseResumeReady && liveWorkers > 0 ? "ready" : "attention",
      database: true,
      baseResume: baseResumeReady,
      worker: liveWorkers > 0,
      workers: liveWorkers,
      activeRuns,
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
