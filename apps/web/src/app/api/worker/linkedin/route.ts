import { automationDeviceAllowed } from "@/lib/automation-device";
import { NextResponse } from "next/server";
import { workerAuthorized } from "@/lib/worker-security";
import { scanLinkedIn, queueLinkedIn } from "@/lib/discovery/linkedin";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await automationDeviceAllowed(process.platform)) return NextResponse.json({ status: "other_device", message: "Windows owns browser discovery." });
  const queue = await queueLinkedIn();
  return NextResponse.json({ ...await scanLinkedIn("both"), queue });
}
