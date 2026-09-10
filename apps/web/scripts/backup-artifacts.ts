import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { pathIsInside } from "../src/lib/worker-security";

const db = new PrismaClient();
async function main() {
let saved = 0, missing = 0;
try {
  const artifacts = await db.artifact.findMany({ where: { backup: { is: null }, localPath: { not: null } }, include: { run: { select: { outputFolder: true } } } });
  for (const item of artifacts) {
    try {
      if (!item.localPath || !item.run.outputFolder) { missing++; continue; }
      const [file, root] = await Promise.all([realpath(item.localPath), realpath(item.run.outputFolder)]);
      if (!pathIsInside(root, file) || path.basename(file) !== item.fileName) { missing++; continue; }
      const info = await stat(file);
      if (!info.isFile() || info.size > 7_500_000) { missing++; continue; }
      const bytes = await readFile(file);
      if (item.sha256 && createHash("sha256").update(bytes).digest("hex") !== item.sha256) { missing++; continue; }
      await db.artifactBackup.upsert({ where: { artifactId: item.id }, create: { artifactId: item.id, content: bytes }, update: {} });
      saved++;
    } catch { missing++; }
  }
  console.log(JSON.stringify({ saved, unavailableOrUnverified: missing }));
} finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Could not back up artifacts. Check database access and retry."); process.exitCode = 1; });
