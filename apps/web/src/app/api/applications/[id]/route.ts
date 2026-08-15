import { ApplicationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const updateSchema = z.object({
  status: z.nativeEnum(ApplicationStatus).optional(),
  notes: z.string().max(10000).optional(),
  sourceUrl: z.string().url().nullable().optional().or(z.literal("")),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid application update." }, { status: 400 });
  }

  const current = await db.application.findUnique({
    where: { id },
    include: { job: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const application = await db.$transaction(async (transaction) => {
    if (input.data.sourceUrl !== undefined) {
      await transaction.job.update({
        where: { id: current.jobId },
        data: { sourceUrl: input.data.sourceUrl || null },
      });
    }
    const updated = await transaction.application.update({
      where: { id },
      data: {
        status: input.data.status,
        notes: input.data.notes,
        appliedAt:
          input.data.status === "APPLIED" && !current.appliedAt
            ? new Date()
            : input.data.status && input.data.status !== "APPLIED"
              ? current.appliedAt
              : undefined,
      },
    });
    if (input.data.status && input.data.status !== current.status) {
      await transaction.applicationEvent.create({
        data: {
          applicationId: id,
          eventType: "status_changed",
          fromValue: current.status,
          toValue: input.data.status,
        },
      });
    }
    return updated;
  });

  return NextResponse.json({ id: application.id, status: application.status });
}
