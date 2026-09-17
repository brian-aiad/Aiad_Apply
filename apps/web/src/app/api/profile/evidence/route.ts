import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { crossOriginMutation } from "@/lib/web-url";

const inputSchema = z.object({
  term: z.string().trim().min(1).max(120),
  category: z.enum(["technology", "method", "domain", "qualification", "other"]),
  decision: z.enum(["confirmed", "rejected"]),
});
const profilePath = path.resolve(process.cwd(), "../../data/profile/Brian_Aiad_PROFILE.json");

export async function PATCH(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid evidence decision." }, { status: 400 });
  const profile = JSON.parse(await fs.readFile(profilePath, "utf8")) as Record<string, unknown>;
  const skills = new Set<string>(Array.isArray(profile.confirmed_skills) ? profile.confirmed_skills as string[] : []);
  const exposure = new Set<string>(Array.isArray(profile.confirmed_exposure) ? profile.confirmed_exposure as string[] : []);
  const rejected = new Set<string>(Array.isArray(profile.rejected_terms) ? profile.rejected_terms as string[] : []);
  const history = Array.isArray(profile.review_history) ? profile.review_history : [];
  const { term, category, decision } = input.data;
  skills.delete(term); exposure.delete(term); rejected.delete(term);
  if (decision === "confirmed") (category === "technology" ? skills : exposure).add(term);
  else rejected.add(term);
  profile.confirmed_skills = [...skills]; profile.confirmed_exposure = [...exposure]; profile.rejected_terms = [...rejected];
  profile.review_history = [...history, { term, category, decision, reviewed_at: new Date().toISOString() }];
  await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return NextResponse.json({ saved: true, term, decision });
}
