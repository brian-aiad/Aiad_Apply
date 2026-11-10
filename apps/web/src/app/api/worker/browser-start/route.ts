import { AUTONOMY_KEY, readAutonomy } from "@/lib/application-autonomy-policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerAuthorized } from "@/lib/worker-security";
import { automationDeviceAllowed } from "@/lib/automation-device";
import { browserWorkerOnline, AUTOMATION_HEARTBEAT } from "@/lib/application-automation";
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const input = z.object({ platform: z.enum(["win32", "darwin", "linux"]) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid worker platform." }, { status: 400 });
  if (input.data.platform !== "win32" || !await automationDeviceAllowed(input.data.platform, "applications")) return NextResponse.json({ start: false });
  const [queued, heartbeat] = await Promise.all([
    db.applicationEvent.count({ where: { eventType: "application_automation", toValue: "QUEUED" } }),
    db.setting.findUnique({ where: { key: AUTOMATION_HEARTBEAT } }),
  ]);
  const automatic = readAutonomy((await db.setting.findUnique({ where: { key: AUTONOMY_KEY } }))?.value);
  return NextResponse.json({ start: (queued > 0 || automatic.enabled) && !browserWorkerOnline(heartbeat?.value) });
}
