import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Artifact, TailoringRun } from "@prisma/client";
import { pathIsInside } from "./worker-security";

type RunFiles = TailoringRun & { artifacts: Artifact[] };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Only exact, hash-verified artifact files are removed. Never recursively delete
// an arbitrary stored outputFolder, a user's Downloads, or a safety backup.
export async function removeDeletedJobLocalFiles(runs: RunFiles[], protectedHashes: string[] = []) {
  let removed = 0, unavailable = 0;
  const protectedFiles = new Set(protectedHashes);
  const pdfs = new Set(runs.flatMap(run => run.artifacts.filter(a => a.kind === "PDF" && a.sha256 && !protectedFiles.has(a.sha256)).map(a => a.sha256!)));
  const expand = (value: string) => value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : path.resolve(/* turbopackIgnore: true */ value);
  const homeDownloads = path.join(os.homedir(), "Downloads", "Resume_Builder");
  let outputRoot = process.env.AIADAPPLY_OUTPUT_ROOT;
  if (!outputRoot && process.platform === "win32") {
    try { await lstat(path.join(os.homedir(), "OneDrive", "Downloads")); outputRoot = path.join(os.homedir(), "OneDrive", "Downloads", "Resume_Builder", "OUTPUT_RESUMES"); } catch { /* Standard Downloads below. */ }
  }
  const output = expand(outputRoot || path.join(homeDownloads, "OUTPUT_RESUMES"));
  const broad = [os.homedir(), path.join(os.homedir(), "Downloads"), path.parse(output).root].map(value => path.resolve(/* turbopackIgnore: true */ value));
  let managedRoot: string | null = null;
  if (!broad.includes(output)) { try { const resolved = await realpath(output); if (!broad.includes(resolved)) managedRoot = resolved; } catch { /* No local output folder. */ } }
  for (const run of runs) {
    for (const artifact of run.artifacts) {
      if (!artifact.localPath || !run.outputFolder || !artifact.sha256 || protectedFiles.has(artifact.sha256)) continue;
      try {
        const [file, root] = await Promise.all([realpath(artifact.localPath), realpath(run.outputFolder)]);
        const info = await lstat(artifact.localPath);
        if (!managedRoot || file === managedRoot || !pathIsInside(managedRoot, file) || !info.isFile() || info.isSymbolicLink() || !pathIsInside(root, file) || path.basename(file) !== artifact.fileName) { unavailable++; continue; }
        if (digest(await readFile(file)) !== artifact.sha256) { unavailable++; continue; }
        await unlink(file); removed++;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") unavailable++; }
    }
    // Remove the packet folder only when empty; unrelated/user-added files survive.
    if (run.outputFolder) {
      try { const folder = await realpath(run.outputFolder); if (managedRoot && folder !== managedRoot && pathIsInside(managedRoot, folder)) await rmdir(folder); } catch { /* Missing/nonempty/remote directory stays. */ }
    }
  }
  const configured = process.env.AIADAPPLY_USED_RESUME_ROOT || path.join(path.dirname(output), "USED_RESUME");
  const archive = expand(configured);
  // Date-folder PDF copies belonging to this job are matched by content, not name.
  if (pdfs.size && !broad.includes(archive) && archive !== path.parse(archive).root) {
    try {
      if ((await lstat(archive)).isSymbolicLink()) return { removed, unavailable: unavailable + 1 };
      for (const day of await readdir(archive, { withFileTypes: true })) {
        if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
        const directory = path.join(archive, day.name);
        for (const file of await readdir(directory, { withFileTypes: true })) {
          if (!file.isFile() || !file.name.toLowerCase().endsWith(".pdf")) continue;
          const target = path.join(directory, file.name);
          if (pdfs.has(digest(await readFile(target)))) { await unlink(target); removed++; }
        }
        try { await rmdir(directory); } catch { /* Other PDFs remain. */ }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") unavailable++; }
  }
  return { removed, unavailable };
}
