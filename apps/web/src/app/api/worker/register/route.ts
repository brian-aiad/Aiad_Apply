import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCapture } from "@/lib/job-parser";

const requestSchema = z.object({
  rawPaste: z.string().min(100),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  workerId: z.string().min(2).max(100),
});

function authorized(request: Request) {
  const expected = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid terminal run." }, { status: 400 });
  }
  const parsed = parseCapture(input.data.rawPaste, input.data.sourceUrl);

  const result = await db.$transaction(async (transaction) => {
    let job = await transaction.job.findUnique({
      where: { rawPasteSha256: parsed.rawPasteSha256 },
      include: { application: { include: { tailoringRuns: true } } },
    });
    if (!job) {
      job = await transaction.job.create({
        data: {
          source: "linkedin",
          company: parsed.company,
          title: parsed.title,
          location: parsed.location,
          workArrangement: parsed.workArrangement,
          employmentType: parsed.employmentType,
          salaryMin: parsed.salaryMin,
          salaryMax: parsed.salaryMax,
          salaryText: parsed.salaryText,
          sourceUrl: parsed.sourceUrl,
          postedText: parsed.postedText,
          applicantCount: parsed.applicantCount,
          rawPaste: input.data.rawPaste.trim(),
          rawPasteSha256: parsed.rawPasteSha256,
          cleanDescription: parsed.cleanDescription,
          responsibilities: parsed.responsibilities,
          requiredQualifications: parsed.requiredQualifications,
          preferredQualifications: parsed.preferredQualifications,
          application: {
            create: {
              status: "TAILORING",
              events: { create: { eventType: "captured_from_terminal" } },
            },
          },
        },
        include: { application: { include: { tailoringRuns: true } } },
      });
    }
    if (!job.application) throw new Error("Application creation failed.");
    const runNumber =
      Math.max(0, ...job.application.tailoringRuns.map((run) => run.runNumber)) + 1;
    const run = await transaction.tailoringRun.create({
      data: {
        applicationId: job.application.id,
        runNumber,
        status: "RUNNING",
        workerId: input.data.workerId,
        startedAt: new Date(),
      },
    });
    await transaction.application.update({
      where: { id: job.application.id },
      data: { status: "TAILORING" },
    });
    return { applicationId: job.application.id, runId: run.id };
  });

  return NextResponse.json(result, { status: 201 });
}
