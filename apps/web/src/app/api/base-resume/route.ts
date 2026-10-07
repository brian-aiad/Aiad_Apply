import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { baseResumePath } from "@/lib/base-resume";

export const runtime = "nodejs";

export async function GET() {
  try {
    const candidate = await baseResumePath();
    const metadata = await stat(candidate);
    if (!metadata.isFile()) throw new Error("Base resume is not a file.");
    const content = await readFile(candidate);
    return new NextResponse(content, {
      headers: {
        "Content-Disposition": 'attachment; filename="Brian_Aiad_BASE.docx"',
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": String(content.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "The active base resume was not found." }, { status: 404 });
  }
}
