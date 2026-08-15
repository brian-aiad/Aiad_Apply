import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const payloadSchema = z.object({
  stage: z.string().trim().min(2).max(200),
});

const RUN_VISIBILITY_ATTEMPTS = 6;
const RUN_VISIBILITY_DELAY_MS = 100;

function authorized(request: Request) {
  const expected = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

async function findRun(id: string) {
  for (let attempt = 0; attempt < RUN_VISIBILITY_ATTEMPTS; attempt += 1) {
    const run = await db.tailoringRun.findUnique({
      where: { id },
      select: { applicationId: true, status: true },
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
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const input = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid progress update." }, { status: 400 });
  }

  const { id } = await context.params;
  const run = await findRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: "Progress is accepted only for a running tailoring job." },
      { status: 409 },
    );
  }

  await db.applicationEvent.create({
    data: {
      applicationId: run.applicationId,
      eventType: "tailoring_progress",
      toValue: id,
      detail: { stage: input.data.stage },
    },
  });

  return NextResponse.json({ ok: true });
}
