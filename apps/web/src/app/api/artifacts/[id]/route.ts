import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const artifact = await db.artifact.findUnique({ where: { id } });
  if (!artifact) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if (artifact.localPath && existsSync(artifact.localPath)) {
    const file = await stat(artifact.localPath);
    const stream = Readable.toWeb(createReadStream(artifact.localPath)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Length": file.size.toString(),
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Content-Type":
          artifact.kind === "PDF"
            ? "application/pdf"
            : artifact.kind === "DOCX"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream",
      },
    });
  }

  if (artifact.storagePath) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await supabase.storage
        .from("resume-artifacts")
        .createSignedUrl(artifact.storagePath, 60);
      if (!error && data.signedUrl) return NextResponse.redirect(data.signedUrl);
    }
  }

  return NextResponse.json(
    { error: "This file is not available from the current server." },
    { status: 404 },
  );
}
