import { NextResponse } from "next/server";
import { discoverySnapshot } from "@/lib/discovery/service";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await discoverySnapshot(), { headers: { "Cache-Control": "private, no-store" } });
}
