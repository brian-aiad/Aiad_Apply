import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { activeBase, BASE_RESUME_KEY, verifiedBase } from "../workspace-material";
import { db } from "../db";
import { z } from "zod";
import { discoveryEvidence } from "./profile-evidence";

const exec = promisify(execFile);
type Base = { bytes: Buffer; sha256: string };
type Inspection = { sha256: string; paragraphs: { id: string; section: string; kind: string; text: string }[] };
export const INSPECTION_KEY = "workspace:discovery-base-inspection:v1";
export class DiscoveryEvidenceUnavailable extends Error {
  constructor() { super("Open Discover on your desktop to refresh verified resume evidence, then reload this page."); }
}
const inspectionSchema = z.object({
  version: z.literal(1), extractor: z.literal("protected-docx-parser-v1"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), extractedAt: z.string().datetime(),
  paragraphs: z.array(z.object({
    id: z.string().min(1).max(200), section: z.string().min(1).max(200),
    kind: z.enum(["summary", "skill_line", "bullet", "protected_body"]),
    text: z.string().min(1).max(10000),
  }).strict()).min(1).max(500),
}).strict();

export function verifiedInspection(value: unknown, hash: string): Inspection | null {
  const result = inspectionSchema.safeParse(value);
  if (!result.success || result.data.sha256 !== hash) return null;
  const paragraphs = result.data.paragraphs;
  if (new Set(paragraphs.map(p => p.id)).size !== paragraphs.length) return null;
  if (!paragraphs.every(p => p.kind === "summary" && p.section === "summary" ||
    p.kind === "skill_line" && p.section === "skills" ||
    p.kind === "bullet" && /^(experience|projects)\./.test(p.section) ||
    p.kind === "protected_body" && /^(education|certifications)$/.test(p.section))) return null;
  return { sha256: hash, paragraphs };
}

/** Cache extraction, never profile decisions; the bytes themselves establish identity. */
export function createEvidenceResolver(load: () => Promise<Base>, inspect: (base: Base) => Promise<Inspection>) {
  let cached: { hash: string; result: Promise<string[]> } | undefined;
  return async (profile?: Record<string, unknown>) => {
    const base = await load();
    if (createHash("sha256").update(base.bytes).digest("hex") !== base.sha256) throw new Error("Discovery base resume failed byte verification.");
    if (cached?.hash !== base.sha256) {
      const result = inspect(base).then(value => {
        if (value.sha256 !== base.sha256 || !Array.isArray(value.paragraphs)) throw new Error("Discovery inspection does not match the active base resume.");
        const evidence = value.paragraphs.filter(p => typeof p.text === "string" && p.text.trim() &&
          (p.kind === "summary" && p.section === "summary" || p.kind === "skill_line" && p.section === "skills" ||
           p.kind === "bullet" && /^(experience|projects)\./.test(p.section) ||
           p.kind === "protected_body" && /^(education|certifications)$/.test(p.section))).map(p => p.text);
        if (!evidence.length) throw new Error("No verified discovery evidence was extracted from the active base.");
        return evidence;
      });
      cached = { hash: base.sha256, result };
      result.catch(() => { if (cached?.result === result) cached = undefined; });
    }
    return discoveryEvidence(profile, await cached.result);
  };
}

async function inspectBase(base: Base): Promise<Inspection> {
  const shared = await db.setting.findUnique({ where: { key: INSPECTION_KEY } });
  const verified = verifiedInspection(shared?.value, base.sha256);
  if (verified) return verified;
  const root = path.resolve(process.cwd(), "../..");
  const python = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  try { await access(python); } catch {
    throw new DiscoveryEvidenceUnavailable();
  }
  const directory = await mkdtemp(path.join(tmpdir(), "aiad-discovery-base-"));
  try {
    const source = path.join(directory, "base.docx");
    await writeFile(source, base.bytes, { mode: 0o600 });
    const { stdout } = await exec(python, ["-X", "utf8", path.join(root, "scripts/discovery-base-evidence.py"), source], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    const parsed = JSON.parse(stdout) as Inspection;
    const paragraphs = parsed.paragraphs.filter(p =>
      p.kind === "summary" && p.section === "summary" || p.kind === "skill_line" && p.section === "skills" ||
      p.kind === "bullet" && /^(experience|projects)\./.test(p.section) ||
      p.kind === "protected_body" && /^(education|certifications)$/.test(p.section));
    const snapshot = { sha256: parsed.sha256, paragraphs, version: 1, extractor: "protected-docx-parser-v1", extractedAt: new Date().toISOString() };
    const inspection = verifiedInspection(snapshot, base.sha256);
    if (!inspection) throw new Error("The protected resume parser returned invalid evidence.");
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731092642)::text`;
      const current = await tx.setting.findUnique({ where: { key: BASE_RESUME_KEY } });
      if (current && verifiedBase(current.value)?.sha256 !== base.sha256) throw new Error("The active resume changed during evidence extraction. Retry with the current base.");
      await tx.setting.upsert({ where: { key: INSPECTION_KEY }, create: { key: INSPECTION_KEY, value: snapshot }, update: { value: snapshot } });
    });
    return inspection;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const currentDiscoveryEvidence = createEvidenceResolver(activeBase, inspectBase);
