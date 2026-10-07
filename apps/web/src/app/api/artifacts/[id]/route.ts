import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { readVerifiedArtifact } from "@/lib/verified-artifact";
import { safeArtifactName } from "@/lib/worker-security";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parameters = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!parameters.success) {
    return NextResponse.json({ error: "Invalid artifact identifier." }, { status: 400 });
  }
  const { id } = parameters.data;
  const artifact = await db.artifact.findUnique({
    where: { id },
    include: { run: { select: { outputFolder: true } } },
  });
  if (!artifact) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const types: Record<string, string> = {
    PDF: "application/pdf",
    DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    REPORT_JSON: "application/json", CHARACTER_AUDIT: "application/json",
    REPORT_MARKDOWN: "text/markdown; charset=utf-8", JOB_DESCRIPTION: "text/plain; charset=utf-8",
  };
  const content = await readVerifiedArtifact(artifact);
  const disposition = artifact.kind === "PDF" && new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment";
  if (content) return new NextResponse(new Uint8Array(content), { headers: {
    "Cache-Control": "private, no-store",
    "Content-Type": types[artifact.kind] || "application/octet-stream",
    "Content-Length": String(content.byteLength),
    "Content-Disposition": `${disposition}; filename="${safeArtifactName(artifact.fileName)}"`,
    "X-Content-Type-Options": "nosniff",
    "X-Artifact-SHA256": artifact.sha256!,
  } });

  return NextResponse.json(
    { error: "A verified copy of this file is unavailable. Generate a new resume version." },
    { status: 409 },
  );
}
