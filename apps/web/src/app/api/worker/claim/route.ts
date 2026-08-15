import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const requestSchema = z.object({ workerId: z.string().min(2).max(100) });

function authorized(request: Request) {
  const expected = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid worker identifier." }, { status: 400 });
  }

  const queued = await db.tailoringRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" },
    include: { application: { include: { job: true } } },
  });
  if (!queued) return new NextResponse(null, { status: 204 });

  const claimed = await db.tailoringRun.updateMany({
    where: { id: queued.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      workerId: parsed.data.workerId,
      startedAt: new Date(),
    },
  });
  if (claimed.count !== 1) return new NextResponse(null, { status: 409 });

  return NextResponse.json({
    runId: queued.id,
    applicationId: queued.applicationId,
    rawPaste: queued.application.job.rawPaste,
    company: queued.application.job.company,
    title: queued.application.job.title,
  });
}
