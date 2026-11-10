/** One-time, non-overwriting import of this installation's confirmed source material. */
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { baseResumePath } from "../src/lib/base-resume";
import { CANDIDATE_PROFILE_KEY, ONBOARDING_KEY, BASE_RESUME_KEY, AUTOMATION_POLICY_KEY } from "../src/lib/workspace-material";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const root = path.resolve(process.cwd(), "../..");
  const profile = JSON.parse(await readFile(path.join(root, "data/profile/Brian_Aiad_PROFILE.json"), "utf8"));
  const onboarding = JSON.parse(await readFile(path.join(root, ".runtime/application-onboarding.json"), "utf8"));
  // Never import credentials, sessions or verification codes into candidate knowledge.
  function safe(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(safe);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|cookie|verificationCode|oneTimeCode/i.test(key)).map(([key, v]) => [key, safe(v)]));
    return value;
  }
  const bytes = await readFile(await baseResumePath());
  if (bytes.length > 15_000_000) throw new Error("Base resume exceeds shared-material limit.");
  const material = [
    [CANDIDATE_PROFILE_KEY, safe(profile)], [ONBOARDING_KEY, safe(onboarding)],
    [BASE_RESUME_KEY, { contentBase64: bytes.toString("base64"), byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
    [AUTOMATION_POLICY_KEY, { browserPlatform: "win32", startup: "dashboard-tailoring", entry: "paste-first", linkedInSearches: "preferred-plus-support", ranking: "exact-fit-premium-tiebreak" }],
  ] as const;
  await db.$transaction(async tx => {
    for (const [key, value] of material) await tx.setting.upsert({ where: { key }, create: { key, value: JSON.parse(JSON.stringify(value)) }, update: {} });
  });
  console.log("Shared candidate facts, evidence, base resume and Windows automation policy initialized; existing values preserved. No private values printed.");
}
void main().catch(() => { console.error("Workspace import failed; existing records were not overwritten."); process.exitCode = 1; }).finally(() => db.$disconnect());
