import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) {
    return NextResponse.json({ error: "Invalid application identifier." }, { status: 400 });
  }
  const { id } = parameters.data;
  const application = await db.application.findUnique({
    where: { id },
    include: { tailoringRuns: { orderBy: { runNumber: "desc" } } },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  const latest = application.tailoringRuns[0];
  const active = application.tailoringRuns.find((run) =>
    ["QUEUED", "RUNNING"].includes(run.status),
  );
  if (active) {
    return NextResponse.json({ runId: active.id, duplicate: true });
  }
  try {
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const competingRun = await db.tailoringRun.findFirst({
        where: { applicationId: id, status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { runNumber: "desc" },
      });
      if (competingRun) {
        return NextResponse.json({ runId: competingRun.id, duplicate: true });
      }
    }
    throw error;
  }
}
