import { NextResponse } from "next/server";
import { activeBase } from "@/lib/workspace-material";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { bytes: content } = await activeBase();
    return new NextResponse(new Uint8Array(content), {
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
