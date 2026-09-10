import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const fixtureRoot = path.resolve(process.cwd(), "..", "..", "data", "fixtures");
const fixtureFiles = [
  "jpmorgan_technology_support_ii_full.txt",
  "trade_desk_support_engineer_full.txt",
  "recent_floqast_integrations_support_2026_08_05.txt",
  "recent_cresta_application_support_2026_08_05.txt",
  "recent_goodleap_application_support_2026_08_05.txt",
  "bank_of_hope_encompass_full_2026_08_06.txt",
  "nesco_technical_client_operations_specialist_2026_08_12.txt",
  "liquid_iv_d365_technical_analyst_2026_08_12.txt",
  "live_linkedin_20260813/linkedin_4215127819_coreweave_technical_support_engineer_bare_metal.txt",
  "live_linkedin_20260813/linkedin_4369610709_infinite_giving_client_operations_specialist.txt",
  "live_linkedin_20260813/linkedin_4401508206_liveramp_technical_support_engineer.txt",
  "live_linkedin_20260813/linkedin_4431436073_crossover_technical_support_engineer_trilogy_remote_60_000_y.txt",
  "live_linkedin_20260813/linkedin_4432540287_kapsch_group_technical_support_engineer.txt",
  "live_linkedin_20260813/linkedin_4435487199_community_energy_labs_technical_support_engineer_field_engin.txt",
  "live_linkedin_20260813/linkedin_4453661445_southern_california_edison_sce_gis_and_system_support_specia.txt",
  "rtx_raytheon_systems_engineer_radar_integration_test_2026_08_10.txt",
  "rtx_collins_manufacturing_engineer_riverside_01865676.txt",
  "rtx_collins_product_quality_engineer_i_01863833.txt",
  "rtx_raytheon_semiconductor_manufacturing_engineer_01862457.txt",
  "rtx_raytheon_rf_microwave_antenna_engineer_i_01864246.txt",
  "rtx_raytheon_manufacturing_engineer_goleta_01864965.txt",
];

async function fixtures() {
  return Promise.all(
    fixtureFiles.map(async (name) => {
      const raw = await readFile(path.join(fixtureRoot, name), "utf8");
      const hash = createHash("sha256").update(raw.trim()).digest("hex");
      return { name, raw, hash };
    }),
  );
}

async function cleanFixtures() {
  const records = await fixtures();
  await prisma.job.deleteMany({
    where: { rawPasteSha256: { in: records.map((record) => record.hash) } },
  });
}

test.beforeAll(cleanFixtures);
test.afterAll(async () => {
  await cleanFixtures();
  await prisma.$disconnect();
});

test("captures a noisy JPMorgan posting and tracks application progress", async ({
  page,
}) => {
  const [jpmorgan] = await fixtures();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.getByRole("link", { name: "Capture job" }).first().click();
  await page.getByLabel("Complete job posting paste").fill(jpmorgan.raw);
  await page.getByRole("button", { name: "Save only" }).click();

  await expect(page.getByRole("heading", { name: "Technology Support II" })).toBeVisible();
  await expect(page.getByText("JPMorganChase").first()).toBeVisible();
  await expect(page.getByText("$86K–$130K")).toBeVisible();
  await expect(page.locator("span.status", { hasText: "Captured" })).toBeVisible();
  await expect(page.getByText("URL can be added later")).toBeVisible();

  await page.getByLabel("Status").selectOption("APPLIED");
  await page.getByLabel("Private notes").fill("Follow up with the recruiting team.");
  await page.getByLabel("Follow-up reminder").fill("2026-08-25T09:30");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("span.status", { hasText: "Applied" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Private notes")).toHaveValue(
    "Follow up with the recruiting team.",
  );

  await page.goto("/");
  await expect(page.getByText("1 / 8")).toBeVisible();
  await expect(page.getByText("Technology Support II").first()).toBeVisible();
});

test("captures The Trade Desk posting without merging it into scanner noise", async ({
  page,
}) => {
  const [, tradeDesk] = await fixtures();
  await page.goto("/capture");
  await page.getByLabel("Complete job posting paste").fill(tradeDesk.raw);
  await page.getByRole("button", { name: "Save only" }).click();

  await expect(page.getByRole("heading", { name: "Support Engineer" })).toBeVisible();
  await expect(page.getByText("The Trade Desk").first()).toBeVisible();
  await expect(page.getByText("21 extracted")).toBeVisible();
  await page.screenshot({
    path: "test-results/trade-desk-application.png",
    fullPage: true,
  });
});

test("remains usable at a mobile viewport", async ({ page, request }) => {
  const [jpmorgan] = await fixtures();
  const capture = await request.post("/api/jobs", {
    data: { rawPaste: jpmorgan.raw, queueTailoring: false },
  });
  expect([200, 201]).toContain(capture.status());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/capture");
  await expect(page.getByRole("heading", { name: "Capture a job" })).toBeVisible();
  await expect(page.getByLabel("Complete job posting paste")).toBeVisible();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Apps" }).click();
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search applications" }).fill("Technology Support");
  await expect(page.getByRole("link", { name: "Technology Support II", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Support Engineer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({ path: "test-results/mobile-applications.png", fullPage: true });
  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toMatchObject({ database: true, baseResume: true });

  await page.getByRole("link", { name: "Technology Support II", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Technology Support II" })).toBeVisible();
  const detailColumns = await page.locator(".application-detail-grid").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
  );
  expect(detailColumns).toHaveLength(1);
  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("captures current application-support postings with their core fields", async ({
  page,
}) => {
  const records = await fixtures();
  const recent = records.slice(2, 5);
  const expectations = [
    {
      company: "FloQast",
      title: "Technical Support Engineer (Integrations)",
      location: "Los Angeles, CA",
      requirements: "12 extracted",
      url: "https://jobs.lever.co/floqast/e7138177-4869-49cc-8201-ef254a2d1506",
    },
    {
      company: "Cresta",
      title: "Application Support Engineer",
      location: "United States (Remote)",
      requirements: "12 extracted",
      url: "https://job-boards.greenhouse.io/cresta/jobs/5318826008",
    },
    {
      company: "GoodLeap",
      title: "Application Support Engineer",
      location: "Remote, US",
      requirements: "8 extracted",
      url: "https://jobs.lever.co/goodleap/2235409f-41a3-4ff2-b0dd-64408465edb2",
    },
  ];

  for (const [index, record] of recent.entries()) {
    const expected = expectations[index];
    await page.goto("/capture");
    await page.getByLabel("Complete job posting paste").fill(record.raw);
    await page.getByRole("button", { name: "Save only" }).click();

    await expect(page.getByRole("heading", { name: expected.title })).toBeVisible();
    await expect(page.getByText(expected.company).first()).toBeVisible();
    await expect(page.getByText(expected.location, { exact: true })).toBeVisible();
    await expect(page.getByText(expected.requirements)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open posting" })).toHaveAttribute(
      "href",
      expected.url,
    );
  }

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByText("Buildable skill gaps")).toBeVisible();
});

test("captures unheaded Encompass duties and nested qualification sections", async ({
  page,
}) => {
  const records = await fixtures();
  const bankOfHope = records[5];
  await page.goto("/capture");
  await page.getByLabel("Complete job posting paste").fill(bankOfHope.raw);
  await page.getByRole("button", { name: "Save only" }).click();

  await expect(page.getByRole("heading", { name: "Analyst - Encompass" })).toBeVisible();
  await expect(page.getByText("Bank of Hope").first()).toBeVisible();
  await expect(page.getByText("Irvine, CA", { exact: true })).toBeVisible();
  await expect(page.getByText("7 extracted")).toBeVisible();

  const job = await prisma.job.findUnique({ where: { rawPasteSha256: bankOfHope.hash } });
  expect(job?.responsibilities).toHaveLength(8);
  expect(job?.requiredQualifications).toHaveLength(1);
  expect(job?.preferredQualifications).toHaveLength(6);
});

test("captures supplied LinkedIn and employer postings without section leakage", async ({
  page,
}) => {
  const records = await fixtures();
  const cases = [
    {
      record: records[6],
      company: "Nesco Resource",
      title: "Technical Client Operations Specialist",
      location: "Aliso Viejo, CA",
      arrangement: "Remote",
      responsibilities: 11,
      required: 9,
      preferred: 6,
    },
    {
      record: records[7],
      company: "Liquid I.V.",
      title: "D365 Technical Analyst",
      location: "El Segundo, CA",
      arrangement: "Hybrid",
      responsibilities: 12,
      required: 9,
      preferred: 2,
    },
    {
      record: records[15],
      company: "Raytheon",
      title: "Systems Engineer I: Radar System Integration & Test - Onsite",
      location: "El Segundo, California, United States of America",
      arrangement: "On-site",
      responsibilities: 11,
      required: 4,
      preferred: 5,
    },
    {
      record: records[16],
      company: "Collins Aerospace",
      title: "Manufacturing Engineer",
      location: "Riverside, California, United States of America",
      arrangement: "On-site",
      responsibilities: 9,
      required: 5,
      preferred: 6,
    },
    {
      record: records[17],
      company: "Collins Aerospace",
      title: "Product Quality Engineer I (Onsite)",
      location: "Fairfield, California, United States of America",
      arrangement: "On-site",
      responsibilities: 11,
      required: 4,
      preferred: 7,
    },
    {
      record: records[18],
      company: "Raytheon",
      title: "Semiconductor Manufacturing Engineer - Goleta, CA",
      location: "Goleta, California, United States of America",
      arrangement: "On-site",
      responsibilities: 8,
      required: 3,
      preferred: 8,
    },
    {
      record: records[19],
      company: "Raytheon",
      title: "RF/Microwave Antenna Electrical Engineer I (Onsite)",
      location: "El Segundo, California",
      arrangement: "On-site",
      responsibilities: 3,
      required: 3,
      preferred: 10,
    },
    {
      record: records[20],
      company: "Raytheon",
      title: "Manufacturing Engineer",
      location: "Goleta, California, United States of America",
      arrangement: "On-site",
      responsibilities: 8,
      required: 2,
      preferred: 8,
    },
  ];

  for (const item of cases) {
    await page.goto("/capture");
    await page.getByLabel("Complete job posting paste").fill(item.record.raw);
    await page.getByRole("button", { name: "Save only" }).click();
    await expect(page.getByRole("heading", { name: item.title })).toBeVisible();
    await expect(page.getByText(item.company).first()).toBeVisible();
    await expect(page.getByText(item.location, { exact: true })).toBeVisible();
    await expect(page.getByText(item.arrangement, { exact: true })).toBeVisible();

    const job = await prisma.job.findUnique({
      where: { rawPasteSha256: item.record.hash },
    });
    expect(job?.responsibilities).toHaveLength(item.responsibilities);
    expect(job?.requiredQualifications).toHaveLength(item.required);
    expect(job?.preferredQualifications).toHaveLength(item.preferred);
    expect(job?.cleanDescription).not.toContain("Benefits found in job post");
  }
});

test("ingests and deduplicates the dated live LinkedIn stress corpus", async ({
  page,
  request,
}) => {
  const records = (await fixtures()).slice(8, 15);
  const expected = [
    ["CoreWeave", "Technical Support Engineer (Bare Metal)", 13, 13, 0],
    ["Infinite Giving", "Client Operations Specialist", 3, 7, 3],
    ["LiveRamp", "Technical Support Engineer", 5, 15, 3],
    [
      "Crossover",
      "Technical Support Engineer, Trilogy (Remote) - $60,000/year USD",
      1,
      6,
      4,
    ],
    ["Kapsch Group", "Technical Support Engineer", 10, 7, 0],
    ["Community Energy Labs", "Technical Support Engineer / Field Engineer", 17, 12, 6],
    ["Southern California Edison (SCE)", "GIS and System Support Specialist", 5, 1, 6],
  ] as const;

  let lastId = "";
  for (const [index, record] of records.entries()) {
    const response = await request.post("/api/jobs", {
      data: { rawPaste: record.raw, queueTailoring: false },
    });
    expect([200, 201]).toContain(response.status());
    const payload = (await response.json()) as { id: string; duplicate: boolean };
    expect(payload.duplicate).toBe(false);
    lastId = payload.id;

    const job = await prisma.job.findUnique({ where: { rawPasteSha256: record.hash } });
    const [company, title, responsibilities, required, preferred] = expected[index];
    expect(job?.company).toBe(company);
    expect(job?.title).toBe(title);
    expect(job?.responsibilities).toHaveLength(responsibilities);
    expect(job?.requiredQualifications).toHaveLength(required);
    expect(job?.preferredQualifications).toHaveLength(preferred);
  }

  const duplicate = await request.post("/api/jobs", {
    data: { rawPaste: records[0].raw, queueTailoring: false },
  });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({ duplicate: true });

  await page.goto(`/applications/${lastId}`);
  await expect(
    page.getByRole("heading", { name: "GIS and System Support Specialist" }),
  ).toBeVisible();
  await expect(page.getByText("Southern California Edison (SCE)").first()).toBeVisible();
});

test("rejects malformed captures and returns an existing duplicate", async ({
  request,
}) => {
  const invalid = await request.post("/api/jobs", {
    data: { rawPaste: "too short", queueTailoring: false },
  });
  expect(invalid.status()).toBe(400);
  await expect(invalid.json()).resolves.toMatchObject({
    error: "Paste a complete job posting before saving.",
  });

  const [jpmorgan] = await fixtures();
  const first = await request.post("/api/jobs", {
    data: { rawPaste: jpmorgan.raw, queueTailoring: false },
  });
  expect([200, 201]).toContain(first.status());
  const duplicate = await request.post("/api/jobs", {
    data: { rawPaste: jpmorgan.raw, queueTailoring: false },
  });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({ duplicate: true });

  const noisyDuplicate = await request.post("/api/jobs", {
    data: {
      rawPaste: `0 notifications\nLinkedIn navigation\n${jpmorgan.raw}\nMessaging overlay`,
      queueTailoring: false,
    },
  });
  expect(noisyDuplicate.status()).toBe(200);
  await expect(noisyDuplicate.json()).resolves.toMatchObject({ duplicate: true });

  const unauthorizedWorker = await request.post("/api/worker/claim", {
    data: { workerId: "unauthorized-test" },
  });
  expect(unauthorizedWorker.status()).toBe(401);
});

test("records authenticated worker progress and displays the current stage", async ({
  page,
  request,
}) => {
  const records = await fixtures();
  const goodLeap = records[4];
  const workerSecret = process.env.WORKER_SECRET || process.env.CRON_SECRET;
  expect(workerSecret).toBeTruthy();
  const registration = await request.post("/api/worker/register", {
    headers: { Authorization: `Bearer ${workerSecret}` },
    data: {
      rawPaste: goodLeap.raw,
      workerId: "playwright-progress-test",
    },
  });
  expect(registration.status()).toBe(201);
  const registered = (await registration.json()) as {
    applicationId: string;
    runId: string;
  };

  const progress = await request.post(`/api/worker/runs/${registered.runId}/progress`, {
    headers: { Authorization: `Bearer ${workerSecret}` },
    data: {
      stage: "Building candidate evidence and role transferability",
      workerId: "playwright-progress-test",
    },
  });
  expect(progress.status(), await progress.text()).toBe(200);

  await page.goto(`/applications/${registered.applicationId}`);
  await expect(
    page.locator(".review-guide").getByText("Building candidate evidence and role transferability"),
  ).toBeVisible();
  await expect(page.getByText("Tailoring Progress")).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("TAILORING");
  await expect(page.getByLabel("Status")).toBeDisabled();

  const completed = await request.post(`/api/worker/runs/${registered.runId}`, {
    headers: { Authorization: `Bearer ${workerSecret}` },
    data: {
      workerId: "playwright-progress-test",
      success: true,
      report: {
        validation: { passed: true, keyword_coverage: 50 },
        layout: { page_count: 1 },
        claim_risks: [
          { claim: "Direct evidence", risk_level: "low" },
          { claim: "Needs review", risk_level: "medium" },
          { claim: "Do not claim", risk_level: "high" },
        ],
      },
      keywords: [
        {
          term: "documentation",
          normalized: "documentation",
          kind: "action",
          priority: "tier_1",
          occurrences: 2,
          source_sections: ["responsibilities"],
          hiring_importance: 40,
          placement_utility: 35,
          accepted: true,
          used: true,
          evidence_level: "direct",
          placement: "summary",
        },
        {
          term: "scanner noise",
          normalized: "scanner noise",
          kind: "noise",
          priority: "inferred",
          occurrences: 1,
          source_sections: ["simplify"],
          hiring_importance: 0,
          placement_utility: 0,
          accepted: false,
          used: true,
          evidence_level: "unsupported",
          placement: "skills.tools",
          rejection_reason: "Rejected as scanner-only noise.",
        },
      ],
      changes: [],
      artifacts: [],
    },
  });
  expect(completed.status()).toBe(200);

  const storedRun = await prisma.tailoringRun.findUnique({
    where: { id: registered.runId },
    include: { keywordDecisions: true },
  });
  expect(storedRun).toMatchObject({ status: "SUCCEEDED", riskCount: 2 });
  expect(
    storedRun?.keywordDecisions.find((decision) => decision.term === "documentation"),
  ).toMatchObject({ evidenceLevel: "DIRECT", accepted: true, used: true });
  expect(
    storedRun?.keywordDecisions.find((decision) => decision.term === "scanner noise"),
  ).toMatchObject({
    accepted: false,
    used: true,
    rejectionReason: "Rejected as scanner-only noise.",
  });

  await page.reload();
  await expect(page.locator("span.status", { hasText: "Review" }).first()).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("REVIEW");
  await expect(page.getByText("Direct")).toBeVisible();
  await expect(page.getByText("Not assessed")).toBeVisible();
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Review flags", { exact: true }).locator("..")).toContainText("2");
});
