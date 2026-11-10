import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { baseResumePath } from "./base-resume";

export const CANDIDATE_PROFILE_KEY = "workspace:candidate-profile";
export const ONBOARDING_KEY = "workspace:onboarding";
export const BASE_RESUME_KEY = "workspace:base-resume";
export const AUTOMATION_POLICY_KEY = "workspace:automation";
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function candidateProfile() {
  const shared = await db.setting.findUnique({ where: { key: CANDIDATE_PROFILE_KEY } });
  if (shared) return record(shared.value);
  return record(JSON.parse(await readFile(path.resolve(process.cwd(), "../../data/profile/Brian_Aiad_PROFILE.json"), "utf8")));
}
export function verifiedBase(value: unknown): { bytes: Buffer; sha256: string } | null {
  const v = record(value);
  if (typeof v.contentBase64 !== "string" || v.contentBase64.length > 20_000_000 || typeof v.sha256 !== "string") return null;
  const bytes = Buffer.from(v.contentBase64, "base64");
  if (bytes.toString("base64") !== v.contentBase64 || bytes.length !== v.byteSize || createHash("sha256").update(bytes).digest("hex") !== v.sha256) return null;
  return { bytes, sha256: v.sha256 };
}
export async function activeBase() {
  const shared = await db.setting.findUnique({ where: { key: BASE_RESUME_KEY } });
  if (shared) {
    const base = verifiedBase(shared.value);
    if (!base) throw new Error("The shared base resume failed verification. Restore the verified source before tailoring.");
    return { ...base, source: "Shared workspace base resume", updatedAt: shared.updatedAt };
  }
  const source = await baseResumePath();
  const bytes = await readFile(source);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), source, updatedAt: null };
}
export async function workspaceMaterial() {
  const [profile, onboarding, base] = await Promise.all([
    candidateProfile(), db.setting.findUnique({ where: { key: ONBOARDING_KEY } }), activeBase(),
  ]);
  return { candidateProfile: profile, onboarding: record(onboarding?.value), baseResume: { contentBase64: base.bytes.toString("base64"), sha256: base.sha256, byteSize: base.bytes.length } };
}
export async function updateCandidateProfile(tx: Prisma.TransactionClient, update: (profile: Record<string, unknown>) => Record<string, unknown>) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(731092642)::text`;
  const shared = await tx.setting.findUnique({ where: { key: CANDIDATE_PROFILE_KEY } });
  const profile = shared ? record(shared.value) : await candidateProfile();
  const value = JSON.parse(JSON.stringify(update(profile)));
  return tx.setting.upsert({ where: { key: CANDIDATE_PROFILE_KEY }, create: { key: CANDIDATE_PROFILE_KEY, value }, update: { value } });
}
