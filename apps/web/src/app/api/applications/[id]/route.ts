import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const updateSchema = z.object({
  status: z
    .enum(["CAPTURED", "REVIEW", "READY", "APPLIED", "INTERVIEW", "CLOSED"])
    .optional(),
  notes: z.string().max(10000).optional(),
  sourceUrl: z.string().max(2_000).url().nullable().optional().or(z.literal("")),
  followUpAt: z.string().datetime().nullable().optional().or(z.literal("")),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) {
    return NextResponse.json({ error: "Invalid application identifier." }, { status: 400 });
  }
  const { id } = parameters.data;
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
        followUpAt:
          input.data.followUpAt === undefined
            ? undefined
            : input.data.followUpAt
              ? new Date(input.data.followUpAt)
              : null,
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
