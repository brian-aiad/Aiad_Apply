import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Artifact } from "@prisma/client";
import { db } from "./db";
import { artifactBytesMatch } from "./artifact-content";
import { pathIsInside } from "./worker-security";

export async function readVerifiedArtifact(artifact: Artifact & { run: { outputFolder: string | null } }): Promise<Buffer | null> {
  const { localPath, fileName, run: { outputFolder } } = artifact;
  if (localPath && outputFolder && pathIsInside(outputFolder, localPath) && path.basename(localPath) === fileName) {
    try { const bytes = await readFile(localPath); if (artifactBytesMatch(bytes, artifact)) return bytes; } catch { /* Try verified backup. */ }
  }
  const backup = await db.artifactBackup.findUnique({ where: { artifactId: artifact.id } });
  if (backup) { const bytes = Buffer.from(backup.content); if (artifactBytesMatch(bytes, artifact)) return bytes; }
  if (artifact.storagePath) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await client.storage.from("resume-artifacts").download(artifact.storagePath);
      if (!error && data) { const bytes = Buffer.from(await data.arrayBuffer()); if (artifactBytesMatch(bytes, artifact)) return bytes; }
    }
  }
  return null;
}
