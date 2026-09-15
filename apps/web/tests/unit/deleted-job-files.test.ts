import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDeletedJobLocalFiles } from "../../src/lib/deleted-job-files";

test("local deletion removes verified packet/archive files but preserves unrelated and out-of-root files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "aiadapply-delete-"));
  const output = path.join(root, "OUTPUT_RESUMES"), packet = path.join(output, "packet"), archive = path.join(root, "USED_RESUME"), day = path.join(archive, "2026-09-14");
  const oldOutput = process.env.AIADAPPLY_OUTPUT_ROOT, oldArchive = process.env.AIADAPPLY_USED_RESUME_ROOT;
  process.env.AIADAPPLY_OUTPUT_ROOT = output; process.env.AIADAPPLY_USED_RESUME_ROOT = archive;
  try {
    await mkdir(packet, { recursive: true }); await mkdir(day, { recursive: true });
    const bytes = Buffer.from("fixture-pdf"), hash = createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(packet, "resume.pdf"), bytes); await writeFile(path.join(day, "resume.pdf"), bytes);
    await writeFile(path.join(day, "other.pdf"), "unrelated"); await writeFile(path.join(packet, "user-note.txt"), "keep");
    const outside = path.join(root, "protected-base.pdf"); await writeFile(outside, bytes);
    const runs = [{ outputFolder: packet, artifacts: [{ localPath: path.join(packet, "resume.pdf"), fileName: "resume.pdf", kind: "PDF", sha256: hash }] }, { outputFolder: root, artifacts: [{ localPath: outside, fileName: "protected-base.pdf", kind: "PDF", sha256: hash }] }] as unknown as Parameters<typeof removeDeletedJobLocalFiles>[0];
    const result = await removeDeletedJobLocalFiles(runs);
    assert.equal(result.removed, 2); assert.equal(result.unavailable, 1);
    await assert.rejects(readFile(path.join(packet, "resume.pdf")), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(day, "resume.pdf")), { code: "ENOENT" });
    assert.equal((await readFile(outside)).toString(), "fixture-pdf");
    assert.equal((await readFile(path.join(day, "other.pdf"))).toString(), "unrelated");
    assert.equal((await readFile(path.join(packet, "user-note.txt"))).toString(), "keep");
  } finally {
    if (oldOutput === undefined) delete process.env.AIADAPPLY_OUTPUT_ROOT; else process.env.AIADAPPLY_OUTPUT_ROOT = oldOutput;
    if (oldArchive === undefined) delete process.env.AIADAPPLY_USED_RESUME_ROOT; else process.env.AIADAPPLY_USED_RESUME_ROOT = oldArchive;
    await rm(root, { recursive: true, force: true });
  }
});

test("a PDF hash still referenced by another job is never removed locally", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "aiadapply-delete-shared-"));
  const old = process.env.AIADAPPLY_OUTPUT_ROOT;
  process.env.AIADAPPLY_OUTPUT_ROOT = root;
  try {
    const bytes = Buffer.from("shared-pdf"), hash = createHash("sha256").update(bytes).digest("hex"), file = path.join(root, "shared.pdf");
    await writeFile(file, bytes);
    const runs = [{ outputFolder: root, artifacts: [{ localPath: file, fileName: "shared.pdf", kind: "PDF", sha256: hash }] }] as unknown as Parameters<typeof removeDeletedJobLocalFiles>[0];
    assert.equal((await removeDeletedJobLocalFiles(runs, [hash])).removed, 0);
    assert.deepEqual(await readFile(file), bytes);
  } finally { if (old === undefined) delete process.env.AIADAPPLY_OUTPUT_ROOT; else process.env.AIADAPPLY_OUTPUT_ROOT = old; await rm(root, { recursive: true, force: true }); }
});
