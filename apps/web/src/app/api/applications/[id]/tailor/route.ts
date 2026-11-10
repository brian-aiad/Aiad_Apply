import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crossOriginMutation } from "@/lib/web-url";
import { AutomationError, currentAttempt, lockAutomation } from "@/lib/application-automation-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) return NextResponse.json({ error: "Invalid application identifier." }, { status: 400 });
  const { id } = parameters.data;
  try {
    const result = await db.$transaction(async tx => {
      // Serialize with approval/claim/submission. Starting a new resume cannot
      // invalidate an in-flight exact artifact or an uncertain employer result.
      await lockAutomation(tx);
      await tx.$queryRaw`SELECT id FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
      const application = await tx.application.findUnique({ where: { id }, include: { tailoringRuns: { orderBy: { runNumber: "desc" } } } });
      if (!application) throw new AutomationError("Application not found.", 404);
      const previous = await currentAttempt(tx, id);
      const attempt = previous?.detail;
      if (previous && (!attempt || ["QUEUED", "RUNNING", "SUBMITTING", "UNKNOWN"].includes(attempt.status) || attempt.status === "BLOCKED" && attempt.submissionStartedAt)) {
        throw new AutomationError("Finish or safely cancel the current application attempt before tailoring again. An uncertain submission needs its employer receipt checked first.");
      }
      const active = application.tailoringRuns.find(run => ["QUEUED", "RUNNING"].includes(run.status));
      if (active) return { runId: active.id, duplicate: true, applicationStatus: application.status };
      const applicationStatus = ["APPLIED", "INTERVIEW", "CLOSED"].includes(application.status) ? application.status : "TAILORING";
      const created = await tx.tailoringRun.create({ data: { applicationId: id, runNumber: (application.tailoringRuns[0]?.runNumber ?? 0) + 1, status: "QUEUED" } });
      await tx.application.updateMany({ where: { id, status: { in: ["CAPTURED", "REVIEW", "READY", "TAILORING"] } }, data: { status: "TAILORING" } });
      await tx.applicationEvent.create({ data: { applicationId: id, eventType: "tailoring_queued", toValue: created.id } });
      return { runId: created.id, duplicate: false, applicationStatus };
    }, { timeout: 15000 });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AutomationError ? error.message : "Could not queue tailoring. Your current application and resume are retained." }, { status: error instanceof AutomationError ? error.status : 503 });
  }
}
