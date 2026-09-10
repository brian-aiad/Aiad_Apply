import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { approvePosting } from "@/lib/discovery/service";
const inputSchema = z.object({ action: z.enum(["approve", "dismiss", "restore"]), tailor: z.boolean().default(false) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!/^[a-f0-9]{64}$/.test(id) || !input.success) return NextResponse.json({ error: "Invalid discovery action." }, { status: 400 });
  try {
    if (input.data.action === "approve") return NextResponse.json(await approvePosting(id, input.data.tailor));
    const changed = await db.discoveryPosting.updateMany({ where: { id, approvedApplicationId: null }, data: { dismissedAt: input.data.action === "dismiss" ? new Date() : null } });
    if (!changed.count) return NextResponse.json({ error: "This posting was already approved or is no longer available." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && /Posting not found|no longer listed|not been checked/.test(error.message) ? error.message : "Unable to save this decision. Try again.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
