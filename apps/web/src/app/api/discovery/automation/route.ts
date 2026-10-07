import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTOMATION_KEY } from "@/lib/discovery/service";
const schema = z.object({ scheduledSearch: z.boolean(), intervalHours: z.number().int().min(4).max(24), autoTailor: z.boolean(), dailyLimit: z.number().int().min(1).max(5), minimumScore: z.number().int().min(75).max(100) });
export async function PATCH(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Use a 4–24 hour search interval, 1–5 drafts per day, and a minimum score of 75–100." }, { status: 400 });
  await db.setting.upsert({ where: { key: AUTOMATION_KEY }, create: { key: AUTOMATION_KEY, value: input.data }, update: { value: input.data } });
  return NextResponse.json(input.data);
}
