import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordWorkerHeartbeat } from "@/lib/worker-heartbeat";
import { workerAuthorized, WORKER_ID_PATTERN } from "@/lib/worker-security";

const payloadSchema = z.object({
  workerId: z.string().trim().regex(WORKER_ID_PATTERN),
  runId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const input = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid worker heartbeat." }, { status: 400 });
  }

  await recordWorkerHeartbeat(input.data.workerId);
  if (input.data.runId) {
    const refreshed = await db.tailoringRun.updateMany({
      where: {
        id: input.data.runId,
        status: "RUNNING",
        workerId: input.data.workerId,
      },
      data: { updatedAt: new Date() },
    });
    if (refreshed.count !== 1) {
      return NextResponse.json(
        { error: "This run is no longer owned by this worker." },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
