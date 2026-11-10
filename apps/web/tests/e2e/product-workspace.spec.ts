import { createHash, randomUUID } from "node:crypto";
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
      keywordDecisions: { create: { term: "SQL", normalized: "sql", kind: "technical", priority: "required", hiringImportance: 1, placementUtility: 1, accepted: true, used: true, evidenceLevel: "DIRECT" } },
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
  const changedBullet = page.getByRole("region", { name: "Test", exact: true }).getByRole("article");
  await expect(changedBullet.getByRole("heading", { name: "Tailored · final resume", exact: true })).toBeVisible();
  await expect(changedBullet.locator("ins").first()).toHaveText("production");
  await expect(changedBullet.locator("del").first()).toHaveText("customer");
  await expect(page.locator("#role")).toBeHidden();
  await page.getByRole("tab", { name: "Job details" }).click();
  await expect(page.locator("#changes")).toBeHidden();
  await expect(page.locator("#role")).toBeVisible();
  await expect(page).toHaveURL(/tab=role/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Job details" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#role")).toBeVisible();
  await page.getByRole("tab", { name: "Job details" }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Resume" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#changes")).toBeVisible();
  await expect(page.locator("#keywords")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Keywords" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Job details" }).click();
  await expect(page.getByText("Capture recommendation", { exact: true })).toBeVisible();
  await expect(page.getByText("Stretch Apply", { exact: true })).toBeVisible();
  await page.locator(".review-evidence > summary").click();
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
  await page.getByRole("button", { name: "Answer kit" }).click();
  await expect(page.getByRole("dialog", { name: "Your reusable answers" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Answer kit" })).toBeFocused();
});

test("a failed rerun keeps the latest accepted resume available", async ({ page }) => {
  const bytes = Buffer.from("accepted resume fixture");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const fixture = await db.job.create({
    data: {
      company: "Accepted Version QA",
      title: "Support Engineer",
      rawPaste: raw,
      rawPasteSha256: randomUUID(),
      application: {
        create: {
          status: "REVIEW",
          tailoringRuns: {
            create: [
              {
                runNumber: 1,
                status: "SUCCEEDED",
                validationPassed: true,
                pageCount: 1,
                completedAt: new Date(),
                artifacts: {
                  create: {
                    kind: "PDF",
                    fileName: "Brian_Aiad_Resume_Accepted_Version_QA_Support_Engineer.pdf",
                    sha256: digest,
                    byteSize: bytes.length,
                    backup: { create: { content: bytes } },
                  },
                },
              },
              { runNumber: 2, status: "FAILED", errorMessage: "Renderer unavailable." },
            ],
          },
        },
      },
    },
    include: { application: true },
  });
  try {
    await page.goto(`/applications/${fixture.application!.id}`);
    await expect(page.getByRole("heading", { name: "This run needs attention" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Newest · Run 2 · failed · not sendable" })).toHaveCount(1);
    await expect(page.getByRole("option", { name: "Latest accepted · Run 1 · succeeded" })).toHaveCount(1);
    await expect(page.getByLabel("Status").getByRole("option", { name: "ready" })).toBeEnabled();
    await page.getByRole("combobox", { name: /^Resume version/ }).selectOption({ label: "Latest accepted · Run 1 · succeeded" });
    await expect(page.getByRole("link", { name: "PDF", exact: true })).toBeVisible();
  } finally {
    await db.job.delete({ where: { id: fixture.id } });
  }
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

test("application status refreshes on focus without triggering discovery or losing filters", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/discovery/refresh")) mutations.push(request.url()); });
  await page.goto("/applications");
  await page.getByPlaceholder("Search role, company, or location").fill("Workspace QA");
  await db.application.update({ where: {id: applicationId}, data: {status: "APPLIED",appliedAt: new Date()} });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByPlaceholder("Search role, company, or location")).toHaveValue("Workspace QA");
    const row = page.locator("tr").filter({hasText:"Workspace QA"});
    await expect(row).toContainText("Applied");
    expect(mutations).toEqual([]);
  } finally { await db.application.update({where:{id:applicationId},data:{status:"REVIEW",appliedAt:null}}); }
});

test("discovery observes the desktop request through completion without repeated collection", async ({ page }) => {
  const original = await (await page.request.get("/api/discovery")).json();
  let stage = "pending", posts = 0;
  const requestedAt = new Date().toISOString();
  await page.route("**/api/discovery/refresh", async route => { posts++; await route.fulfill({json:{reason:"requested",request:{id:"fixture-desktop",requestedAt}},status:202}); });
  await page.route("**/api/discovery", async route => route.fulfill({json:{...original,refreshRequest:stage==="complete"?null:{id:"fixture-desktop",requestedAt},scan:stage==="pending"?original.scan:{id:"fixture-scan",status:stage==="complete"?"completed":"running",startedAt:requestedAt,...(stage==="complete"?{completedAt:new Date().toISOString()}:{}),sources:[],found:0}}}));
  await page.goto("/discover");
  await page.getByRole("button",{name:"Refresh openings",exact:true}).click();
  await expect(page.getByRole("button",{name:"Waiting for Windows…",exact:true})).toBeDisabled();
  stage="running";
  await expect(page.getByRole("button",{name:"Checking openings…",exact:true})).toBeDisabled({timeout:10000});
  stage="complete";
  await expect(page.getByRole("button",{name:"Refresh openings",exact:true})).toBeEnabled({timeout:10000});
  await expect(page.getByText("Search queued for Windows.",{exact:false})).toHaveCount(0);
  expect(posts).toBe(1);
});
