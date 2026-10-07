import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicationProfileSchema, readApplicationProfile } from "@/lib/application-profile";
import { crossOriginMutation } from "@/lib/web-url";
const key = "application-profile";
export async function GET() {
  const row = await db.setting.findUnique({ where: { key } });
  return NextResponse.json({ profile: readApplicationProfile(row?.value), updatedAt: row?.updatedAt.toISOString() ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const input = z.object({ profile: applicationProfileSchema, updatedAt: z.string().datetime().nullable() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Check your email, links and answer lengths." }, { status: 400 });
  const saved = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM settings WHERE key = ${key} FOR UPDATE`;
    const current = await tx.setting.findUnique({ where: { key } });
    if ((current?.updatedAt.toISOString() ?? null) !== input.data.updatedAt) return null;
    return tx.setting.upsert({ where: { key }, create: { key, value: input.data.profile }, update: { value: input.data.profile } });
  }).catch(() => false as const);
  if (saved === false) return NextResponse.json({ error: "Profile storage is temporarily unavailable. Try saving again." }, { status: 503 });
  if (!saved) return NextResponse.json({ error: "Your profile changed in another tab. Reload the page before saving." }, { status: 409 });
  return NextResponse.json({ profile: input.data.profile, updatedAt: saved.updatedAt.toISOString() });
}
