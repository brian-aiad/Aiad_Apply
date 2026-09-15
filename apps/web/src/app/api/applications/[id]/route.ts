import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveFollowUpUpdate } from "@/lib/application-reminders";
import { readProductSettings } from "@/lib/product-settings";
import { webUrl, crossOriginMutation } from "@/lib/web-url";
import { deleteApplicationPermanently, DeletionError } from "@/lib/application-deletion";
import { removeDeletedJobLocalFiles } from "@/lib/deleted-job-files";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) return NextResponse.json({ error: "Invalid application identifier." }, { status: 400 });
  const confirmation = await request.json().catch(() => null);
  if (confirmation?.confirm !== "DELETE") return NextResponse.json({ error: "Explicit permanent-deletion confirmation is required." }, { status: 400 });
  try {
    const runs = await deleteApplicationPermanently(db, parameters.data.id);
    let localFiles = { removed: 0, unavailable: 0 };
    try {
      const hashes = runs.flatMap(run => run.artifacts.flatMap(a => a.sha256 ? [a.sha256] : []));
      const sharedFiles = await db.artifact.findMany({ where: { sha256: { in: hashes } }, select: { sha256: true } });
      localFiles = await removeDeletedJobLocalFiles(runs, sharedFiles.flatMap(a => a.sha256 ? [a.sha256] : []));
    } catch { localFiles.unavailable++; }
    return NextResponse.json({ deleted: true, localFiles, note: "Removed from the shared app. Other devices' local files, manual downloads, and older backups are not erased." });
  } catch (error) {
    if (error instanceof DeletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Permanent deletion could not be completed. Refresh and retry; some cloud files may already have been removed." }, { status: 503 });
  }
}

class ApplicationConflict extends Error {}

const updateSchema = z.object({
  status: z
    .enum(["CAPTURED", "REVIEW", "READY", "APPLIED", "INTERVIEW", "CLOSED"])
    .optional(),
  notes: z.string().max(10000).optional(),
  sourceUrl: webUrl.nullable().optional().or(z.literal("")),
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
  if (input.data.status === "READY" || input.data.status === "REVIEW") {
    const validRun = await db.tailoringRun.findFirst({
      where: { applicationId: id, status: "SUCCEEDED", validationPassed: true, pageCount: 1, artifacts: { some: { kind: { in: ["DOCX", "PDF"] } } } },
      select: { id: true },
    });
    if (!validRun) return NextResponse.json({ error: "Generate a validated resume before marking it ready for review or submission." }, { status: 409 });
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

  try {
  const application = await db.$transaction(async (transaction) => {
    if (input.data.sourceUrl !== undefined) {
      await transaction.job.update({
        where: { id: current.jobId },
        data: { sourceUrl: input.data.sourceUrl || null },
      });
    }
    const changed = await transaction.application.updateMany({
      where: { id, updatedAt: current.updatedAt },
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
    if (changed.count !== 1) throw new ApplicationConflict();
    const updated = await transaction.application.findUniqueOrThrow({ where: { id } });
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
    if (!reminder.automaticallyScheduled && requestedFollowUpAt !== undefined && current.followUpAt?.getTime() !== requestedFollowUpAt?.getTime()) {
      await transaction.applicationEvent.create({ data: {
        applicationId: id,
        eventType: requestedFollowUpAt ? "follow_up_scheduled" : "follow_up_completed",
        fromValue: current.followUpAt?.toISOString() ?? null,
        toValue: requestedFollowUpAt?.toISOString() ?? null,
      } });
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
  } catch (error) {
    if (error instanceof ApplicationConflict) return NextResponse.json({ error: "This application changed while you were saving. Refresh and try again; your update was not applied." }, { status: 409 });
    throw error;
  }
}
