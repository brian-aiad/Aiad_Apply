import { NextResponse } from "next/server";
import { z } from "zod";
import { parseCapture } from "@/lib/job-parser";
import { captureIntelligence } from "@/lib/capture-intelligence";
import { applyCaptureOverrides } from "@/lib/capture-overrides";
import { db } from "@/lib/db";
import { readDiscoveryPreferences } from "@/lib/discovery/types";

const overrideSchema = z.object({
  company: z.string().max(200).optional(),
  title: z.string().max(300).optional(),
  location: z.string().max(300).optional(),
  workArrangement: z.string().max(80).optional(),
  employmentType: z.string().max(80).optional(),
}).optional();
const schema = z.object({
  rawPaste: z.string().trim().min(100).max(500_000),
  overrides: overrideSchema,
});

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Paste at least 100 characters from the posting." }, { status: 400 });
  const parsed = applyCaptureOverrides(
    parseCapture(input.data.rawPaste),
    input.data.overrides,
  );
  const preference = await db.setting.findUnique({
    where: { key: "discovery:preferences" },
    select: { value: true },
  });
  return NextResponse.json(
    {
      parsed,
      intelligence: captureIntelligence(parsed, readDiscoveryPreferences(preference?.value)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
