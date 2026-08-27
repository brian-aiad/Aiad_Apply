import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveFollowUpUpdate } from "@/lib/application-reminders";
import { readProductSettings } from "@/lib/product-settings";

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

  const [current, setting] = await Promise.all([
    db.application.findUnique({
      where: { id },
      include: { job: true },
    }),
    db.setting.findUnique({ where: { key: "product" } }),
  ]);
  if (!current) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const now = new Date();
  const requestedFollowUpAt =
    input.data.followUpAt === undefined
      ? undefined
      : input.data.followUpAt
        ? new Date(input.data.followUpAt)
        : null;
  const reminder = resolveFollowUpUpdate({
    currentStatus: current.status,
    nextStatus: input.data.status,
    currentFollowUpAt: current.followUpAt,
    requestedFollowUpAt,
    now,
    followUpDays: readProductSettings(setting?.value).followUpDays,
  });

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
        followUpAt: reminder.followUpAt,
        appliedAt:
          input.data.status === "APPLIED" && !current.appliedAt
            ? now
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
    if (reminder.automaticallyScheduled && reminder.followUpAt) {
      await transaction.applicationEvent.create({
        data: {
          applicationId: id,
          eventType: "follow_up_scheduled",
          toValue: reminder.followUpAt.toISOString(),
          detail: { source: "automatic_applied_transition" },
        },
      });
    }
    return updated;
  });

  return NextResponse.json({
    id: application.id,
    status: application.status,
    appliedAt: application.appliedAt?.toISOString() ?? null,
    followUpAt: application.followUpAt?.toISOString() ?? null,
    automaticallyScheduledFollowUp: reminder.automaticallyScheduled,
  });
}
