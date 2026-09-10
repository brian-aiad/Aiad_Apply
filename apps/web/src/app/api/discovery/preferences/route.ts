import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PREFS_KEY } from "@/lib/discovery/service";
const schema = z.object({ minimumSalary: z.number().int().min(60000).max(300000), radiusMiles: z.number().int().min(1).max(30), includeRemote: z.boolean() });
export async function PATCH(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Use a salary of at least $60,000 and a radius from 1 to 30 miles." }, { status: 400 });
  await db.setting.upsert({ where: { key: PREFS_KEY }, create: { key: PREFS_KEY, value: input.data }, update: { value: input.data } });
  return NextResponse.json(input.data);
}
