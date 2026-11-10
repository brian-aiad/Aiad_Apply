import { db } from "@/lib/db";
import { readRefreshRequest, REFRESH_REQUEST_KEY } from "@/lib/discovery/refresh-request";
import { automationDeviceAllowed } from "@/lib/automation-device";
import { NextResponse } from "next/server";
import { workerAuthorized } from "@/lib/worker-security";
import { runDiscoveryAutomation } from "@/lib/discovery/service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!await automationDeviceAllowed(process.platform)) return NextResponse.json({ status: "other_device", message: "Scheduled collection runs on the primary Windows computer." });
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.pendingOnly === true && !readRefreshRequest((await db.setting.findUnique({ where: { key: REFRESH_REQUEST_KEY } }))?.value)) {
      return NextResponse.json({ status: "idle", queued: 0 });
    }
    return NextResponse.json(await runDiscoveryAutomation());
  }
  catch { return NextResponse.json({ error: "Scheduled search could not finish; the worker will retry later." }, { status: 503 }); }
}
