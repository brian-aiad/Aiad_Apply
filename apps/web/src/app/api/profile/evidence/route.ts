import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { crossOriginMutation } from "@/lib/web-url";
import { applyEvidenceDecision, evidenceDecisionSchema } from "@/lib/candidate-profile";

const profilePath = path.resolve(process.cwd(), "../../data/profile/Brian_Aiad_PROFILE.json");
let pending: Promise<unknown> = Promise.resolve();

export async function PATCH(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const input = evidenceDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message || "Invalid evidence decision." }, { status: 400 });
  const save = pending.then(async () => {
    const profile = JSON.parse(await fs.readFile(profilePath, "utf8")) as Record<string, unknown>;
    const updated = applyEvidenceDecision(profile, input.data);
    const temporary = `${profilePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await fs.rename(temporary, profilePath);
    } finally { await fs.rm(temporary, { force: true }); }
  });
  pending = save.catch(() => undefined);
  await save;
  return NextResponse.json({ saved: true, term: input.data.term, decision: input.data.decision, scope: input.data.scope });
}
