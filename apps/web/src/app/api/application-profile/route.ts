import { reusableQuestion } from "@/lib/reusable-answers";
import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicationProfileSchema, readApplicationProfile } from "@/lib/application-profile";
import { crossOriginMutation } from "@/lib/web-url";
const key = "application-profile";
export async function GET() {
  const row = await db.setting.findUnique({ where: { key } });
  const reusable = await db.setting.findUnique({ where: { key: "application:reusable-answers" } });
  return NextResponse.json({ reusableAnswers: reusable?.value ?? [], reusableUpdatedAt: reusable?.updatedAt.toISOString() ?? null, profile: readApplicationProfile(row?.value), updatedAt: row?.updatedAt.toISOString() ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const input = z.object({ profile: applicationProfileSchema, updatedAt: z.string().datetime().nullable(), reusableUpdatedAt: z.string().datetime().nullable().optional(), reusableAnswers: z.array(z.object({ question: z.string().min(1).max(2000).refine(reusableQuestion), answer: z.string().min(1).max(12000) })).max(100).optional() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Check your email, links and answer lengths." }, { status: 400 });
  const saved = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731092643)::text`;
    await tx.$queryRaw`SELECT key FROM settings WHERE key = ${key} FOR UPDATE`;
    const current = await tx.setting.findUnique({ where: { key } });
    if ((current?.updatedAt.toISOString() ?? null) !== input.data.updatedAt) return null;
    if (input.data.reusableAnswers) {
      const answerKey = "application:reusable-answers";
      const reusable = await tx.setting.findUnique({ where: { key: answerKey } });
      if ((reusable?.updatedAt.toISOString() ?? null) !== (input.data.reusableUpdatedAt ?? null)) return null;
      await tx.setting.upsert({ where: { key: answerKey }, create: { key: answerKey, value: input.data.reusableAnswers }, update: { value: input.data.reusableAnswers } });
    }
    return tx.setting.upsert({ where: { key }, create: { key, value: input.data.profile }, update: { value: input.data.profile } });
  }).catch(() => false as const);
  if (saved === false) return NextResponse.json({ error: "Profile storage is temporarily unavailable. Try saving again." }, { status: 503 });
  if (!saved) return NextResponse.json({ error: "Your profile changed in another tab. Reload the page before saving." }, { status: 409 });
  const reusable = await db.setting.findUnique({ where: { key: "application:reusable-answers" } });
  return NextResponse.json({ profile: input.data.profile, updatedAt: saved.updatedAt.toISOString(), reusableAnswers: reusable?.value ?? [], reusableUpdatedAt: reusable?.updatedAt.toISOString() ?? null });
}
