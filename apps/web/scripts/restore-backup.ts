import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

async function main() {
  const file = process.argv.find((v, i) => process.argv[i - 1] === "--file");
  if (!file) throw new Error("Usage: npm run backup:restore -- --file /path/to/backup.json [--apply]. Without --apply, validation only.");
  const value = JSON.parse(await readFile(file, "utf8"));
  if (value.format !== "aiadapply-workspace" || value.version !== 1) throw new Error("Unsupported backup format.");
  const tables = ["jobs", "applications", "tailoringRuns", "keywordDecisions", "changes", "artifacts", "events", "dailyGoals", "settings", "discoveries", "backups"];
  for (const name of tables) if (!Array.isArray(value[name])) throw new Error(`Missing backup table: ${name}`);
  const artifacts = new Map<string, { sha256?: string; byteSize?: number }>(value.artifacts.map((a: { id: string; sha256?: string; byteSize?: number }) => [a.id, a]));
  const backups = value.backups.map((b: { artifactId: string; contentBase64: string }) => {
    const artifact = artifacts.get(b.artifactId);
    if (!artifact || typeof b.contentBase64 !== "string") throw new Error("Backup contains an unrecognized file.");
    const content = Buffer.from(b.contentBase64, "base64");
    if (content.toString("base64") !== b.contentBase64 || (artifact.sha256 && artifact.sha256 !== createHash("sha256").update(content).digest("hex")) || (artifact.byteSize != null && artifact.byteSize !== content.byteLength)) throw new Error("File integrity check failed.");
    return { artifactId: b.artifactId, content };
  });
  const result = { applications: value.applications.length, runs: value.tailoringRuns.length, files: value.artifacts.length, portableFiles: backups.length };
  if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ validated: true, ...result, note: "No database changes made. Use --apply only with an empty destination database." })); return; }
  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9074032)`;
      if (await tx.job.count() || await tx.discoveryPosting.count()) throw new Error("Destination is not empty. Existing jobs will not be overwritten. Use a new database.");
      await tx.job.createMany({ data: value.jobs as Prisma.JobCreateManyInput[] });
      await tx.application.createMany({ data: value.applications as Prisma.ApplicationCreateManyInput[] });
      // Interrupted runs have no running worker on the new installation.
      const runs = value.tailoringRuns.map((r: Prisma.TailoringRunCreateManyInput) => ["RUNNING", "QUEUED"].includes(String(r.status)) ? { ...r, status: "CANCELLED", workerId: null, errorMessage: "Restored from backup. Start a new tailoring run when ready." } : r);
      await tx.tailoringRun.createMany({ data: runs });
      await tx.application.updateMany({ where: { status: "TAILORING" }, data: { status: "CAPTURED" } });
      await tx.keywordDecision.createMany({ data: value.keywordDecisions as Prisma.KeywordDecisionCreateManyInput[] });
      await tx.resumeChange.createMany({ data: value.changes as Prisma.ResumeChangeCreateManyInput[] });
      await tx.artifact.createMany({ data: value.artifacts as Prisma.ArtifactCreateManyInput[] });
      await tx.artifactBackup.createMany({ data: backups });
      await tx.applicationEvent.createMany({ data: value.events as Prisma.ApplicationEventCreateManyInput[] });
      await tx.dailyGoal.createMany({ data: value.dailyGoals as Prisma.DailyGoalCreateManyInput[], skipDuplicates: true });
      await tx.discoveryPosting.createMany({ data: value.discoveries as Prisma.DiscoveryPostingCreateManyInput[] });
      for (const setting of value.settings as Prisma.SettingCreateManyInput[]) {
        if (!["product", "discovery:preferences"].includes(setting.key)) continue;
        await tx.setting.upsert({ where: { key: setting.key }, create: setting, update: { value: setting.value } });
      }
    }, { timeout: 60_000 });
    console.log(JSON.stringify({ restored: true, ...result }));
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Restore failed."); process.exitCode = 1; });
