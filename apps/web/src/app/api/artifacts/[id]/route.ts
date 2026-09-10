import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pathIsInside, safeArtifactName } from "@/lib/worker-security";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const localPath = artifact.localPath;
  const outputFolder = artifact.run.outputFolder;
  if (
    localPath &&
    outputFolder &&
    pathIsInside(outputFolder, localPath) &&
    path.basename(localPath) === artifact.fileName &&
    existsSync(localPath)
  ) {
    try {
      const file = await stat(localPath);
      if (!file.isFile()) throw new Error("Artifact is not a regular file.");
      const stream = Readable.toWeb(createReadStream(localPath)) as ReadableStream;
      const fileName = safeArtifactName(artifact.fileName);
      return new NextResponse(stream, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Length": file.size.toString(),
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "X-Content-Type-Options": "nosniff",
          "Content-Type":
            artifact.kind === "PDF"
              ? "application/pdf"
              : artifact.kind === "DOCX"
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : artifact.kind === "REPORT_JSON" || artifact.kind === "CHARACTER_AUDIT"
                  ? "application/json"
                  : artifact.kind === "REPORT_MARKDOWN"
                    ? "text/markdown; charset=utf-8"
                    : artifact.kind === "JOB_DESCRIPTION"
                      ? "text/plain; charset=utf-8"
                      : "application/octet-stream",
        },
      });
    } catch {
      // The local file may have moved between the existence check and the read.
    }
  }

  if (artifact.storagePath) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await supabase.storage
        .from("resume-artifacts")
        .createSignedUrl(artifact.storagePath, 60);
      if (!error && data.signedUrl) {
        const response = NextResponse.redirect(data.signedUrl);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    }
  }

  const backup = await db.artifactBackup.findUnique({ where: { artifactId: id } });
  if (backup) {
    const types: Record<string, string> = { PDF: "application/pdf", DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", REPORT_JSON: "application/json", CHARACTER_AUDIT: "application/json", REPORT_MARKDOWN: "text/markdown; charset=utf-8", JOB_DESCRIPTION: "text/plain; charset=utf-8" };
    return new NextResponse(Buffer.from(backup.content), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": types[artifact.kind] || "application/octet-stream",
        "Content-Length": String(backup.content.byteLength),
        "Content-Disposition": `attachment; filename="${safeArtifactName(artifact.fileName)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return NextResponse.json(
    { error: "This file is not available from the current server." },
    { status: 404 },
  );
}
