import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const application = await db.application.findUnique({
    where: { id },
    include: { tailoringRuns: { orderBy: { runNumber: "desc" }, take: 1 } },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  const latest = application.tailoringRuns[0];
  if (latest && ["QUEUED", "RUNNING"].includes(latest.status)) {
    return NextResponse.json({ runId: latest.id, duplicate: true });
  }
  const run = await db.$transaction(async (transaction) => {
    const created = await transaction.tailoringRun.create({
      data: {
        applicationId: id,
        runNumber: (latest?.runNumber ?? 0) + 1,
        status: "QUEUED",
      },
    });
    await transaction.application.update({
      where: { id },
      data: { status: "TAILORING" },
    });
    await transaction.applicationEvent.create({
      data: {
        applicationId: id,
        eventType: "tailoring_queued",
        toValue: created.id,
      },
    });
    return created;
  });
  return NextResponse.json({ runId: run.id, duplicate: false }, { status: 201 });
}
