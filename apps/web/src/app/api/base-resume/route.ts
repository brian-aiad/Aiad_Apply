import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const registered = await db.resumeVersion.findFirst({ where: { active: true } });
  const fallback = path.resolve(
    process.cwd(),
    "..",
    "..",
    "data",
    "resumes",
    "Brian_Aiad_BASE.docx",
  );
  const candidates = [registered?.localPath, fallback].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    try {
      const metadata = await stat(candidate);
      if (!metadata.isFile()) continue;
      const content = await readFile(candidate);
      return new NextResponse(content, {
        headers: {
          "Content-Disposition": 'attachment; filename="Brian_Aiad_BASE.docx"',
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Length": String(content.length),
        },
      });
    } catch {
      // Try the repository fallback when a registered path moved.
    }
  }

  return NextResponse.json({ error: "The active base resume was not found." }, { status: 404 });
}
