import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db } from "@/lib/db";

const payloadSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  outputFolder: z.string().optional(),
  report: z.record(z.string(), z.unknown()).optional(),
  keywords: z.array(z.record(z.string(), z.unknown())).default([]),
  changes: z.array(z.record(z.string(), z.unknown())).default([]),
  artifacts: z.array(z.record(z.string(), z.unknown())).default([]),
});

function authorized(request: Request) {
  const expected = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await context.params;
  const input = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid worker result." }, { status: 400 });
  }
  const run = await db.tailoringRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const report = input.data.report as Record<string, unknown> | undefined;
  const validation = report?.validation as Record<string, unknown> | undefined;
  const layout = report?.layout as Record<string, unknown> | undefined;
  const risks = Array.isArray(report?.claim_risks) ? report.claim_risks : [];
  const reviewRiskCount = risks.filter((risk) => {
    if (!risk || typeof risk !== "object" || Array.isArray(risk)) return false;
    const record = risk as Record<string, unknown>;
    const exportAllowed = record.exportAllowed ?? record.export_allowed;
    if (exportAllowed === false) return false;
    const level = String(record.riskLevel ?? record.risk_level ?? "").toLocaleUpperCase();
    return level === "MEDIUM" || level === "HIGH";
  }).length;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const uploadedArtifacts: Array<Record<string, unknown>> = [];
  for (const artifact of input.data.artifacts) {
    const normalized = { ...artifact };
    const encoded = artifact.contentBase64;
    if (
      typeof encoded === "string" &&
      encoded.length > 0 &&
      supabaseUrl &&
      serviceKey
    ) {
      const storagePath = `${run.applicationId}/${id}/${String(
        artifact.fileName ?? artifact.file_name ?? "artifact",
      )}`;
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });
      const { error } = await supabase.storage
        .from("resume-artifacts")
        .upload(storagePath, Buffer.from(encoded, "base64"), {
          upsert: true,
          contentType: String(artifact.contentType ?? "application/octet-stream"),
        });
      if (!error) normalized.storagePath = storagePath;
    }
    delete normalized.contentBase64;
    uploadedArtifacts.push(normalized);
  }

  await db.$transaction(async (transaction) => {
    await transaction.keywordDecision.deleteMany({ where: { runId: id } });
    await transaction.resumeChange.deleteMany({ where: { runId: id } });
    await transaction.artifact.deleteMany({ where: { runId: id } });
    if (input.data.success) {
      for (const keyword of input.data.keywords) {
        await transaction.keywordDecision.create({
          data: {
            runId: id,
            term: String(keyword.term ?? ""),
            normalized: String(keyword.normalized ?? keyword.term ?? "").toLocaleLowerCase(),
            kind: String(keyword.kind ?? "vocabulary"),
            priority: String(keyword.priority ?? "inferred"),
            occurrences: Number(keyword.occurrences ?? 0),
            sourceSections: keyword.sourceSections ?? keyword.source_sections ?? [],
            hiringImportance: Number(
              keyword.hiringImportance ?? keyword.hiring_importance ?? 0,
            ),
            placementUtility: Number(
              keyword.placementUtility ?? keyword.placement_utility ?? 0,
            ),
            accepted: Boolean(keyword.accepted),
            used: Boolean(keyword.used),
            evidenceLevel: String(
              keyword.evidenceLevel ?? keyword.evidence_level ?? "UNSUPPORTED",
            ).toLocaleUpperCase() as
              | "DIRECT"
              | "STRONGLY_TRANSFERABLE"
              | "WEAKLY_TRANSFERABLE"
              | "UNSUPPORTED",
            placement: keyword.placement ? String(keyword.placement) : null,
            rejectionReason: (keyword.rejectionReason ?? keyword.rejection_reason)
              ? String(keyword.rejectionReason ?? keyword.rejection_reason)
              : null,
            explanation: keyword.explanation ? String(keyword.explanation) : null,
          },
        });
      }
      for (const change of input.data.changes) {
        await transaction.resumeChange.create({
          data: {
            runId: id,
            paragraphId: String(change.paragraphId ?? change.paragraph_id ?? ""),
            section: String(change.section ?? ""),
            paragraphKind: String(change.paragraphKind ?? change.paragraph_kind ?? ""),
            beforeText: String(change.beforeText ?? change.before_text ?? ""),
            proposedText: String(change.proposedText ?? change.proposed_text ?? ""),
            finalText: String(change.finalText ?? change.final_text ?? ""),
            changeType: String(change.changeType ?? change.change_type ?? "reframed"),
            targetTerms: change.targetTerms ?? change.target_terms ?? [],
            evidenceIds: change.evidenceIds ?? change.evidence_ids ?? [],
            riskLevel: String(change.riskLevel ?? change.risk_level ?? "LOW").toLocaleUpperCase() as
              | "LOW"
              | "MEDIUM"
              | "HIGH",
            compressed: Boolean(change.compressed),
            explanation: change.explanation ? String(change.explanation) : null,
          },
        });
      }
      for (const artifact of uploadedArtifacts) {
        await transaction.artifact.create({
          data: {
            runId: id,
            kind: String(artifact.kind ?? "REPORT_JSON").toLocaleUpperCase() as
              | "DOCX"
              | "PDF"
              | "REPORT_JSON"
              | "REPORT_MARKDOWN"
              | "CHARACTER_AUDIT"
              | "JOB_DESCRIPTION"
              | "PREVIEW",
            fileName: String(artifact.fileName ?? artifact.file_name ?? ""),
            localPath: artifact.localPath ? String(artifact.localPath) : null,
            storagePath: artifact.storagePath ? String(artifact.storagePath) : null,
            sha256: artifact.sha256 ? String(artifact.sha256) : null,
            byteSize: artifact.byteSize ? Number(artifact.byteSize) : null,
          },
        });
      }
    }
    await transaction.tailoringRun.update({
      where: { id },
      data: {
        status: input.data.success ? "SUCCEEDED" : "FAILED",
        errorMessage: input.data.error,
        outputFolder: input.data.outputFolder,
        reportSnapshot: input.data.report as Prisma.InputJsonValue | undefined,
        engineVersion: report?.pipeline_version ? String(report.pipeline_version) : null,
        reasoner: report?.reasoner ? String(report.reasoner) : null,
        baseResumeSha256: report?.base_sha256 ? String(report.base_sha256) : null,
        keywordCoverage:
          typeof validation?.keyword_coverage === "number"
            ? validation.keyword_coverage
            : null,
        validationPassed:
          typeof validation?.passed === "boolean" ? validation.passed : null,
        pageCount: typeof layout?.page_count === "number" ? layout.page_count : null,
        riskCount: reviewRiskCount,
        completedAt: new Date(),
      },
    });
    await transaction.application.update({
      where: { id: run.applicationId },
      data: { status: input.data.success ? "REVIEW" : "CAPTURED" },
    });
    await transaction.applicationEvent.create({
      data: {
        applicationId: run.applicationId,
        eventType: input.data.success ? "tailoring_completed" : "tailoring_failed",
        toValue: id,
        detail: input.data.error ? { error: input.data.error } : undefined,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
