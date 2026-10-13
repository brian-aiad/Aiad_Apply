import { NextResponse } from "next/server";
import { workerAuthorized } from "@/lib/worker-security";
import { scanLinkedIn, queueLinkedIn } from "@/lib/discovery/linkedin";
export const runtime = "nodejs";
export const maxDuration = 600;
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const queue = await queueLinkedIn();
  return NextResponse.json({ ...await scanLinkedIn("both"), queue });
}
