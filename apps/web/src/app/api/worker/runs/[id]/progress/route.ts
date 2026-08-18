import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerAuthorized, WORKER_ID_PATTERN } from "@/lib/worker-security";

const payloadSchema = z.object({
  stage: z.string().trim().min(2).max(200),
  workerId: z.string().trim().regex(WORKER_ID_PATTERN),
});

const RUN_VISIBILITY_ATTEMPTS = 6;
const RUN_VISIBILITY_DELAY_MS = 100;

async function findRun(id: string) {
  for (let attempt = 0; attempt < RUN_VISIBILITY_ATTEMPTS; attempt += 1) {
    const run = await db.tailoringRun.findUnique({
      where: { id },
      select: { applicationId: true, status: true, workerId: true },
    });
    if (run) return run;
    if (attempt < RUN_VISIBILITY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, RUN_VISIBILITY_DELAY_MS));
    }
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const input = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid progress update." }, { status: 400 });
  }

  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) {
    return NextResponse.json({ error: "Invalid run identifier." }, { status: 400 });
  }
  const { id } = parameters.data;
  const run = await findRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: "Progress is accepted only for a running tailoring job." },
      { status: 409 },
    );
  }
  if (run.workerId !== input.data.workerId) {
    return NextResponse.json(
      { error: "This run is owned by another worker." },
      { status: 409 },
    );
  }

  const refreshed = await db.$transaction(async (transaction) => {
    const update = await transaction.tailoringRun.updateMany({
      where: { id, status: "RUNNING", workerId: input.data.workerId },
      data: { updatedAt: new Date() },
    });
    if (update.count !== 1) return false;
    await transaction.applicationEvent.create({
      data: {
        applicationId: run.applicationId,
        eventType: "tailoring_progress",
        toValue: id,
        detail: { stage: input.data.stage },
      },
    });
    return true;
  });
  if (!refreshed) {
    return NextResponse.json(
      { error: "This run is no longer owned by this worker." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
