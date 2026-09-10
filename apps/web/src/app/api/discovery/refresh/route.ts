import { NextResponse } from "next/server";
import { refreshDiscovery } from "@/lib/discovery/service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  try {
    const result = await refreshDiscovery(input?.force === true);
    return NextResponse.json(result, { status: result.reason === "running" ? 202 : 200 });
  } catch {
    return NextResponse.json({ error: "The search could not finish. Your saved jobs are safe. Try refreshing again." }, { status: 503 });
  }
}
