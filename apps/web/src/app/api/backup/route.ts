import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await db.$transaction(async (tx) => {
    const [jobs, applications, tailoringRuns, keywordDecisions, changes, artifacts, events, dailyGoals, settings, discoveries, backups] = await Promise.all([
      tx.job.findMany(), tx.application.findMany(), tx.tailoringRun.findMany(), tx.keywordDecision.findMany(), tx.resumeChange.findMany(), tx.artifact.findMany(), tx.applicationEvent.findMany(), tx.dailyGoal.findMany(),
      // Never export worker secrets, heartbeat state, or arbitrary settings.
      tx.setting.findMany({ where: { key: { in: ["product", "discovery:preferences"] } } }), tx.discoveryPosting.findMany(), tx.artifactBackup.findMany(),
    ]);
    return { jobs, applications, tailoringRuns, keywordDecisions, changes, artifacts, events, dailyGoals, settings, discoveries, backups: backups.map((b) => ({ artifactId: b.artifactId, contentBase64: Buffer.from(b.content).toString("base64") })) };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
  const backup = { format: "aiadapply-workspace", version: 1, exportedAt: new Date().toISOString(), ...data };
  return NextResponse.json(backup, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="aiadapply-backup-${new Date().toISOString().slice(0, 10)}.json"`, "X-Content-Type-Options": "nosniff" } });
}
