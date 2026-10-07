import { NextResponse } from "next/server";
import { z } from "zod";
import { approvePosting } from "@/lib/discovery/service";
const schema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(10), tailor: z.boolean().default(true) });
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Select between 1 and 10 openings." }, { status: 400 });
  const results = [];
  for (const id of new Set(input.data.ids)) {
    try { results.push({ postingId: id, ...await approvePosting(id, input.data.tailor) }); }
    catch (error) { results.push({ postingId: id, error: error instanceof Error ? error.message : "Could not queue this opening." }); }
  }
  return NextResponse.json({ results });
}
