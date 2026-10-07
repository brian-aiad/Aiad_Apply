import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordWorkerHeartbeat } from "@/lib/worker-heartbeat";
import {
  staleWorkerCutoff,
  workerAuthorized,
  WORKER_ID_PATTERN,
} from "@/lib/worker-security";

const requestSchema = z.object({
  workerId: z.string().trim().regex(WORKER_ID_PATTERN),
});

let lastStaleRecoveryAt = 0;
const STALE_RECOVERY_INTERVAL_MS = 30_000;

async function recoverStaleRuns(cutoff: Date) {
  const now = Date.now();
  if (now - lastStaleRecoveryAt < STALE_RECOVERY_INTERVAL_MS) return false;
  lastStaleRecoveryAt = now;
  let recoveredAny = false;
  const staleRuns = await db.tailoringRun.findMany({
    where: { status: "RUNNING", updatedAt: { lt: cutoff } },
    select: { id: true, applicationId: true, workerId: true },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });
  for (const stale of staleRuns) {
    const recovered = await db.tailoringRun.updateMany({
      where: { id: stale.id, status: "RUNNING", updatedAt: { lt: cutoff } },
      data: {
        status: "QUEUED",
        workerId: null,
        startedAt: null,
        errorMessage: "Worker lease expired; run automatically requeued.",
      },
    });
    if (recovered.count === 1) {
      recoveredAny = true;
      await db.applicationEvent.create({
        data: {
          applicationId: stale.applicationId,
          eventType: "tailoring_requeued",
          toValue: stale.id,
          detail: { previousWorkerId: stale.workerId, reason: "worker_lease_expired" },
        },
      });
    }
  }
  return recoveredAny;
}

export async function POST(request: Request) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid worker identifier." }, { status: 400 });
  }

  const cutoff = staleWorkerCutoff();
  let [, queued] = await Promise.all([
    recordWorkerHeartbeat(parsed.data.workerId),
    db.tailoringRun.findFirst({
      where: { status: "QUEUED" },
      orderBy: { queuedAt: "asc" },
      include: { application: { include: { job: true } } },
    }),
  ]);
  if (!queued) {
    const recovered = await recoverStaleRuns(cutoff);
    if (recovered) {
      queued = await db.tailoringRun.findFirst({
        where: { status: "QUEUED" },
        orderBy: { queuedAt: "asc" },
        include: { application: { include: { job: true } } },
      });
    }
  }
  if (!queued) return new NextResponse(null, { status: 204 });

  const claimed = await db.tailoringRun.updateMany({
    where: { id: queued.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      workerId: parsed.data.workerId,
      startedAt: new Date(),
    },
  });
  if (claimed.count !== 1) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    runId: queued.id,
    applicationId: queued.applicationId,
    rawPaste: queued.application.job.rawPaste,
    company: queued.application.job.company,
    title: queued.application.job.title,
  });
}
