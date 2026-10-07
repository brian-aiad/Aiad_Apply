import { NextResponse } from "next/server";
import { workerAuthorized } from "@/lib/worker-security";
import { runDiscoveryAutomation } from "@/lib/discovery/service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json(await runDiscoveryAutomation()); }
  catch { return NextResponse.json({ error: "Scheduled search could not finish; the worker will retry later." }, { status: 503 }); }
}
