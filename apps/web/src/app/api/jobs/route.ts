import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCapture, postingFingerprint } from "@/lib/job-parser";
import { webUrl } from "@/lib/web-url";
import { applyCaptureOverrides } from "@/lib/capture-overrides";
import { captureIntelligence } from "@/lib/capture-intelligence";
import { readDiscoveryPreferences } from "@/lib/discovery/types";

export const runtime = "nodejs";

const captureSchema = z.object({
  rawPaste: z.string().min(100).max(500_000),
  sourceUrl: webUrl.optional().or(z.literal("")),
  queueTailoring: z.boolean().default(false),
  overrides: z.object({
    company: z.string().max(200).optional(),
    title: z.string().max(300).optional(),
    location: z.string().max(300).optional(),
    workArrangement: z.string().max(80).optional(),
    employmentType: z.string().max(80).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const input = captureSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Paste a complete job posting before saving.", issues: input.error.issues },
      { status: 400 },
    );
  }

  const parsed = applyCaptureOverrides(
    parseCapture(input.data.rawPaste, input.data.sourceUrl),
    input.data.overrides,
  );
  const preference = await db.setting.findUnique({
    where: { key: "discovery:preferences" },
    select: { value: true },
  });
  const intelligence = captureIntelligence(parsed, readDiscoveryPreferences(preference?.value));
  let existing = await db.job.findUnique({
    where: { rawPasteSha256: parsed.rawPasteSha256 },
    include: { application: true },
  });
  if (!existing?.application) {
    const sameRoleCandidates = await db.job.findMany({
      where: {
        company: { equals: parsed.company, mode: "insensitive" },
        title: { equals: parsed.title, mode: "insensitive" },
      },
      include: { application: true },
      orderBy: { capturedAt: "desc" },
      take: 20,
    });
    const fingerprint = postingFingerprint(parsed);
    existing =
      sameRoleCandidates.find(
        (candidate) =>
          candidate.application && postingFingerprint(candidate) === fingerprint,
      ) ?? null;
  }
  if (existing?.application) {
    return NextResponse.json({
      id: existing.application.id,
      duplicate: true,
      company: existing.company,
      title: existing.title,
    });
  }

  try {
    const record = await db.$transaction(async (transaction) => {
      const job = await transaction.job.create({
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
          extractedMetadata: {
            captureIntelligence: intelligence,
            correctedFields: Object.keys(input.data.overrides ?? {}).filter(
              (key) => input.data.overrides?.[key as keyof typeof input.data.overrides] !== undefined,
            ),
          },
        },
      });
      const application = await transaction.application.create({
        data: {
          jobId: job.id,
          status: input.data.queueTailoring ? "TAILORING" : "CAPTURED",
          events: {
            create: {
              eventType: "captured",
              toValue: input.data.queueTailoring ? "TAILORING" : "CAPTURED",
            },
          },
        },
      });
      if (input.data.queueTailoring) {
        await transaction.tailoringRun.create({
          data: {
            applicationId: application.id,
            status: "QUEUED",
            runNumber: 1,
          },
        });
      }
      return { application, job };
    });

    return NextResponse.json(
      {
        id: record.application.id,
        duplicate: false,
        company: record.job.company,
        title: record.job.title,
        queued: input.data.queueTailoring,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.job.findUnique({
        where: { rawPasteSha256: parsed.rawPasteSha256 },
        include: { application: true },
      });
      if (duplicate?.application) {
        return NextResponse.json({
          id: duplicate.application.id,
          duplicate: true,
          company: duplicate.company,
          title: duplicate.title,
        });
      }
    }
    throw error;
  }
}
