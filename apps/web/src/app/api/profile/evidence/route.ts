import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crossOriginMutation } from "@/lib/web-url";
import { applyEvidenceDecision, evidenceDecisionSchema } from "@/lib/candidate-profile";
import { updateCandidateProfile } from "@/lib/workspace-material";

export async function PATCH(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const input = evidenceDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message || "Invalid evidence decision." }, { status: 400 });
  await db.$transaction(tx => updateCandidateProfile(tx, profile => applyEvidenceDecision(profile, input.data)));
  return NextResponse.json({ saved: true, shared: true, term: input.data.term, decision: input.data.decision, scope: input.data.scope });
}
