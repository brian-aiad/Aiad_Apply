import { NextResponse } from "next/server";
import { discoverySnapshot } from "@/lib/discovery/service";
import { DiscoveryEvidenceUnavailable } from "@/lib/discovery/current-evidence";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await discoverySnapshot(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof DiscoveryEvidenceUnavailable)) throw error;
    return NextResponse.json({ code: "resume_evidence_unavailable", error: error.message }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
