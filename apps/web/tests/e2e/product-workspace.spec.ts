import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const db = new PrismaClient();
const marker = randomUUID();
let applicationId: string;
let jobId: string;
const raw = `Company logo for, Workspace QA.
Workspace QA
Application Support Engineer
Irvine, CA
Hybrid
Full-time
$85,000 - $105,000
About the job
Responsibilities
Troubleshoot production SaaS applications using SQL and Python.
Required Qualifications
Use Jira and Postman to investigate customer incidents.
ServiceNow administration experience is required.
Preferred Qualifications
Experience documenting incident response procedures.`;

test.beforeAll(async () => {
  const job = await db.job.create({ data: {
    company: "Workspace QA with a deliberately long company name for responsive review",
    title: "Application Support Engineer for Customer Integrations and Production Operations",
    location: "Irvine, CA", rawPaste: raw, rawPasteSha256: marker,
    extractedMetadata: { captureIntelligence: {
      recommendation: "Stretch Apply",
      reason: "Strong support evidence, with ServiceNow administration intentionally excluded.",
      dimensions: [
        { key: "role", label: "Role family", status: "Strong", detail: "Direct application support role.", tone: "positive" },
        { key: "tailoring", label: "Tailoring potential", status: "Bounded", detail: "ServiceNow remains unsupported.", tone: "caution" },
      ],
    }, correctedFields: ["company"] },
    application: { create: { status: "REVIEW", tailoringRuns: { create: {
      status: "SUCCEEDED", validationPassed: true, pageCount: 1, completedAt: new Date(),
      changes: { create: { paragraphId: "experience.test.bullet.1", section: "experience.test", paragraphKind: "bullet", beforeText: "Resolved customer tickets with SQL and wrote notes.", proposedText: "Resolved production tickets with SQL and wrote documentation.", finalText: "Resolved production tickets with SQL and wrote documentation.", changeType: "rewritten", explanation: "Makes the production support context explicit using the original evidence." } },
    } } } },
  }, include: { application: true } });
  jobId = job.id; applicationId = job.application!.id;
});

test.afterAll(async () => { if (jobId) await db.job.delete({ where: { id: jobId } }); await db.$disconnect(); });

test("capture previews requirements and evidence before creating any application", async ({ page }) => {
  const before = await db.application.count();
  await page.goto("/capture");
  await page.getByLabel("Complete job posting paste").fill(raw);
  await expect(page.getByRole("region", { name: "Posting preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stretch Apply", exact: true })).toBeVisible();
  await expect(page.getByText("ServiceNow", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Application Support Engineer", exact: true })).toBeVisible();
  await page.getByText("Correct extracted details", { exact: true }).click();
  await page.getByLabel("Company", { exact: true }).fill("Workspace QA Corrected");
  await expect(page.locator(".preview-company")).toHaveText("Workspace QA Corrected");
  expect(await db.application.count()).toBe(before);
  await page.getByLabel("Complete job posting paste").fill("short");
  await expect(page.getByRole("region", { name: "Posting preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save and tailor" })).toBeDisabled();
});

test("review highlights phrases and keyboard search focuses the application filter", async ({ page }) => {
  await page.goto(`/applications/${applicationId}`);
  await expect(page.locator(".diff-after ins").first()).toHaveText("production");
  await expect(page.getByText("Capture recommendation", { exact: true })).toBeVisible();
  await expect(page.getByText("Stretch Apply", { exact: true })).toBeVisible();
  await expect(page.getByText("1 page confirmed", { exact: true })).toBeVisible();
  await page.goto("/applications");
  // Wait for the client search controls to hydrate before dispatching a global key.
  await page.getByRole("searchbox", { name: "Search applications" }).fill("Workspace QA");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.locator("h1").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search applications" })).toBeFocused();
  await page.keyboard.type("Workspace QA");
  await expect(page.getByRole("link", { name: /Application Support Engineer for Customer/ }).first()).toBeVisible();
});

test("major pages stay within all six viewport widths", async ({ page }) => {
  test.setTimeout(180_000);
  const pages = ["/", "/discover", "/capture", "/applications", `/applications/${applicationId}`, "/analytics", "/settings"];
  const sizes = [[320, 568], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const route of pages) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      expect(overflow, `${route} overflows at ${width}x${height}`).toBe(false);
      if (route === "/capture") {
        await page.getByLabel("Complete job posting paste").fill(raw);
        await expect(page.getByRole("region", { name: "Posting preview" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      }
      await page.screenshot({ path: path.resolve("../../output/playwright", `workspace-${route === "/" ? "today" : route.startsWith("/applications/") ? "review" : route.slice(1)}-${width}.png`), fullPage: true });
    }
  }
});
