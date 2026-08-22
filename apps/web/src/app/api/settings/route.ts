import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isValidTimezone, readProductSettings } from "@/lib/product-settings";

const settingsSchema = z.object({
  dailyGoal: z.number().int().min(1).max(50),
  timezone: z.string().min(1).max(100).refine(isValidTimezone),
});

export async function PATCH(request: Request) {
  const input = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Choose a daily goal from 1 to 50 and a valid timezone." },
      { status: 400 },
    );
  }

  const current = await db.setting.findUnique({ where: { key: "product" } });
  const existing = readProductSettings(current?.value);
  const value = { ...existing, ...input.data };
  await db.setting.upsert({
    where: { key: "product" },
    create: { key: "product", value },
    update: { value },
  });

  return NextResponse.json(value);
}
