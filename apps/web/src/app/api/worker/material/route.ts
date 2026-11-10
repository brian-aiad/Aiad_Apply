import { NextResponse } from "next/server";
import { workspaceMaterial } from "@/lib/workspace-material";
import { workerAuthorized } from "@/lib/worker-security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await workspaceMaterial(), { headers: { "Cache-Control": "private, no-store" } });
}
