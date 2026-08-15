import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const basePath = path.resolve(
    process.cwd(),
    "..",
    "..",
    "data",
    "resumes",
    "Brian_Aiad_BASE.docx",
  );
  const base = await readFile(basePath);
  const sha256 = createHash("sha256").update(base).digest("hex");

  await prisma.setting.upsert({
    where: { key: "product" },
    update: {
      value: {
        dailyGoal: 8,
        timezone: "America/Los_Angeles",
        outputRoot:
          "C:\\Users\\kingt\\OneDrive\\Downloads\\Resume_Builder\\OUTPUT_RESUMES",
        testFixturesVisible: false,
      },
    },
    create: {
      key: "product",
      value: {
        dailyGoal: 8,
        timezone: "America/Los_Angeles",
        outputRoot:
          "C:\\Users\\kingt\\OneDrive\\Downloads\\Resume_Builder\\OUTPUT_RESUMES",
        testFixturesVisible: false,
      },
    },
  });

  await prisma.resumeVersion.updateMany({
    data: { active: false },
  });
  await prisma.resumeVersion.upsert({
    where: { sha256 },
    update: { active: true, localPath: basePath },
    create: {
      label: "Brian Aiad Base",
      localPath: basePath,
      sha256,
      active: true,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
