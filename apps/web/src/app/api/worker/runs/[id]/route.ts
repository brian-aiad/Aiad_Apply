import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db } from "@/lib/db";
import { validatedArtifactBytes } from "@/lib/artifact-content";
import {
  safeArtifactName,
  workerAuthorized,
  WORKER_ID_PATTERN,
} from "@/lib/worker-security";

const payloadSchema = z.object({
  workerId: z.string().trim().regex(WORKER_ID_PATTERN),
  success: z.boolean(),
  error: z.string().max(5_000).optional(),
  outputFolder: z.string().max(4_000).optional(),
  report: z.record(z.string(), z.unknown()).optional(),
  keywords: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]),
  changes: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]),
  artifacts: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
});

const evidenceLevels = new Set([
  "DIRECT",
  "STRONGLY_TRANSFERABLE",
  "WEAKLY_TRANSFERABLE",
  "UNSUPPORTED",
]);
const riskLevels = new Set(["LOW", "MEDIUM", "HIGH"]);
const artifactKinds = new Set([
  "DOCX",
  "PDF",
  "REPORT_JSON",
  "REPORT_MARKDOWN",
  "CHARACTER_AUDIT",
  "JOB_DESCRIPTION",
  "PREVIEW",
]);

function normalizedField(
  record: Record<string, unknown>,
  camelName: string,
  snakeName: string,
  fallback: string,
) {
  return String(record[camelName] ?? record[snakeName] ?? fallback).toLocaleUpperCase();
}

function workerRecordsAreValid(input: z.infer<typeof payloadSchema>) {
  const reportValidation = input.report?.validation;
  const reportLayout = input.report?.layout;
  if (
    (input.success &&
      (!reportValidation ||
        typeof reportValidation !== "object" ||
        Array.isArray(reportValidation) ||
        (reportValidation as Record<string, unknown>).passed !== true ||
        !reportLayout ||
        typeof reportLayout !== "object" ||
        Array.isArray(reportLayout) ||
        (reportLayout as Record<string, unknown>).page_count !== 1)) ||
    (!input.success && !input.error)
  ) {
    return false;
  }
  if (
    input.keywords.some(
      (keyword) =>
        typeof keyword.term !== "string" ||
        keyword.term.length < 1 ||
        keyword.term.length > 250 ||
        typeof keyword.accepted !== "boolean" ||
        typeof keyword.used !== "boolean" ||
        !Number.isFinite(Number(keyword.occurrences ?? 0)) ||
        !Number.isFinite(
          Number(keyword.hiringImportance ?? keyword.hiring_importance ?? 0),
        ) ||
        !Number.isFinite(
          Number(keyword.placementUtility ?? keyword.placement_utility ?? 0),
        ) ||
        !evidenceLevels.has(
          normalizedField(keyword, "evidenceLevel", "evidence_level", "UNSUPPORTED"),
        ),
    ) ||
    input.changes.some(
      (change) =>
        typeof (change.paragraphId ?? change.paragraph_id) !== "string" ||
        String(change.paragraphId ?? change.paragraph_id).length > 250 ||
        typeof change.section !== "string" ||
        change.section.length > 250 ||
        typeof (change.beforeText ?? change.before_text) !== "string" ||
        String(change.beforeText ?? change.before_text).length > 10_000 ||
        typeof (change.finalText ?? change.final_text) !== "string" ||
        String(change.finalText ?? change.final_text).length > 10_000 ||
        !riskLevels.has(normalizedField(change, "riskLevel", "risk_level", "LOW")),
    )
  ) {
    return false;
  }
  return input.artifacts.every((artifact) => {
    const kind = normalizedField(artifact, "kind", "kind", "REPORT_JSON");
    const fileName = artifact.fileName ?? artifact.file_name;
    const encoded = artifact.contentBase64;
    return (
      artifactKinds.has(kind) &&
      typeof fileName === "string" &&
      fileName.length > 0 &&
      fileName.length <= 255 &&
      (artifact.localPath === undefined ||
        (typeof artifact.localPath === "string" && artifact.localPath.length <= 4_000)) &&
      (encoded === undefined ||
        (typeof encoded === "string" &&
          encoded.length <= 10_000_000 &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(encoded))) &&
      (artifact.byteSize === undefined ||
        (typeof artifact.byteSize === "number" &&
          Number.isInteger(artifact.byteSize) &&
          artifact.byteSize >= 0))
    );
  });
}

class RunOwnershipError extends Error {}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) {
    return NextResponse.json({ error: "Invalid run identifier." }, { status: 400 });
  }
  const { id } = parameters.data;
  const rawBody = await request.text();
  if (rawBody.length > 20_000_000) {
    return NextResponse.json({ error: "Worker result is too large." }, { status: 413 });
  }
  const input = payloadSchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })(),
  );
  if (!input.success || !workerRecordsAreValid(input.data)) {
    return NextResponse.json({ error: "Invalid worker result." }, { status: 400 });
  }
  try {
    for (const artifact of input.data.artifacts) validatedArtifactBytes(artifact);
  } catch {
    return NextResponse.json({ error: "An artifact failed its file-integrity check. Retry the upload." }, { status: 400 });
  }
  const run = await db.tailoringRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (["SUCCEEDED", "FAILED"].includes(run.status) && run.workerId === input.data.workerId) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (run.status !== "RUNNING" || run.workerId !== input.data.workerId) {
    return NextResponse.json(
      { error: "This run is no longer owned by this worker." },
      { status: 409 },
    );
  }

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
      const fileName = safeArtifactName(
        String(artifact.fileName ?? artifact.file_name ?? "artifact"),
      );
      const storagePath = `${run.applicationId}/${id}/${input.data.workerId}/${fileName}`;
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
    // Retain bytes until the transaction has stored a portable database copy.
    uploadedArtifacts.push(normalized);
  }

  try {
    await db.$transaction(async (transaction) => {
      const finished = await transaction.tailoringRun.updateMany({
        where: { id, status: "RUNNING", workerId: input.data.workerId },
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
      if (finished.count !== 1) throw new RunOwnershipError();
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
            fileName: safeArtifactName(
              String(artifact.fileName ?? artifact.file_name ?? "artifact"),
            ),
            localPath: artifact.localPath ? String(artifact.localPath) : null,
            storagePath: artifact.storagePath ? String(artifact.storagePath) : null,
            sha256: artifact.sha256 ? String(artifact.sha256) : null,
            byteSize: artifact.byteSize ? Number(artifact.byteSize) : null,
            ...(typeof artifact.contentBase64 === "string" && artifact.contentBase64.length > 0 ? {
              backup: { create: { content: Buffer.from(artifact.contentBase64, "base64") } },
            } : {}),
          },
        });
      }
    }
      const otherActiveRuns = await transaction.tailoringRun.count({
        where: {
          applicationId: run.applicationId,
          id: { not: id },
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });
      // Completion owns processing state, never the user's submitted/closed state.
      const previousValidRun = !input.data.success && await transaction.tailoringRun.findFirst({
        where: { applicationId: run.applicationId, id: { not: id }, status: "SUCCEEDED", validationPassed: true },
        select: { id: true },
      });
      await transaction.application.updateMany({
        where: { id: run.applicationId, status: "TAILORING" },
        data: {
          status:
            otherActiveRuns > 0
              ? "TAILORING"
              : input.data.success
                ? "REVIEW"
                : previousValidRun ? "REVIEW" : "CAPTURED",
        },
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
  } catch (error) {
    if (error instanceof RunOwnershipError) {
      return NextResponse.json(
        { error: "This run is no longer owned by this worker." },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
