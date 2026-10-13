import { expect, test, type Page } from "@playwright/test";
import type { DiscoveryData, Posting } from "../../src/components/discovery-board";

// Network fixtures only: no database writes, live LinkedIn navigation, scans or applications.
function fixture(count: number): DiscoveryData {
  const now = new Date().toISOString();
  const postings: Posting[] = Array.from({ length: count }, (_, index) => ({
    id: `linkedin-fixture-${index}`, externalId: `fixture-${index}`, sourceKey: "linkedin:day",
    company: `Fixture employer ${index}`, title: `Application Support Specialist ${index}`,
    location: "Long Beach, CA", sourceUrl: `https://www.linkedin.com/jobs/view/${9000000000 + index}/`,
    description: "Troubleshoot user access and application incidents. Truncated visible description.",
    requiredExcerpt: ["Full source requirement retained outside the short description."],
    employmentType: "Full-time", workArrangement: "On-site", salaryMin: 70000, salaryMax: 90000,
    salaryText: "$70,000–$90,000/year", postedAt: now, distanceMiles: 8, score: 95 - index,
    matchReasons: ["Documented application troubleshooting experience"], cautions: [], qualified: true,
    active: true, excluded: false, firstSeenAt: now, lastSeenAt: now, dismissedAt: null, approvedApplicationId: null,
    linkedin: { premiumSignal: index === 1 ? "TOP_APPLICANT" : "UNKNOWN", windows: ["day", "week"], destinationType: "EXTERNAL", applyUrl: "https://employer.example/apply", contacts: [{ name: "Pat Example", context: "Visible job poster", profileUrl: "https://www.linkedin.com/in/pat-example/" }] },
    pipeline: { status: index === 2 ? "deferred_capacity" : "eligible", reason: index === 2 ? "Four drafts are already pending" : "Meets saved criteria" },
  }));
  return { postings, preferences: { minimumSalary: 60000, radiusMiles: 30, includeRemote: false }, scan: null,
    linkedinConfig: { enabled: true, dailyLimit: 10 },
    linkedinState: { status: "blocked", message: "Source rate limit; no automatic retry during cooldown.", startedAt: now, lastSuccessfulAt: "2026-10-12T16:00:00Z", retryAfter: new Date(Date.now() + 86400000).toISOString(), window: "both", checked: 12, searchPages: 4, detailPages: 8, duplicatesAvoided: 3, durationMs: 12500, queued: 4, queueErrors: [{ postingId: "fixture-job", message: "Tailoring queue could not accept this job" }], imported: count, duplicates: 2, excluded: 3, errors: [{ message: "Source rate limit" }] },
    linkedinQueue: { qualified: count, queued: 0, deferred: count, errors: [] },
    linkedinSession: { status: "blocked", message: "Session requires attention", checkedAt: now },
  };
}
async function mount(page: Page, data: DiscoveryData) {
  await page.route("**/api/discovery", route => route.fulfill({ json: data }));
  await page.route("**/api/discovery/linkedin", route => route.fulfill({ json: { message: "Fixture session checked" } }));
  await page.route("**/api/discovery/refresh", route => route.fulfill({ json: { reason: "fresh" } }));
  await page.goto("/discover?channel=linkedin&period=active");
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.locator(".linkedin-discovery-panel")).toContainText("Session requires attention");
}
for (const count of [0, 5, 25, 100]) {
  test(`LinkedIn ${count} row fixture stays usable at narrow and desktop widths`, async ({ page }) => {
    await mount(page, fixture(count));
    await expect(page.locator(".opening-card")).toHaveCount(count);
    await expect(page.getByRole("button", { name: "Scan past day + week" })).toBeDisabled();
    await page.getByLabel("First inspection: LinkedIn job URL or job ID").fill("1234567890");
    await expect(page.getByRole("button", { name: "Inspect one job", exact: true })).toBeDisabled();
    await expect(page.locator(".linkedin-discovery-panel")).toContainText("Last attempted");
    await expect(page.locator(".linkedin-discovery-panel")).toContainText("Last successful");
    await expect(page.locator(".linkedin-discovery-panel")).toContainText("Next allowed scan");
    await page.getByText("Scan details & errors (2)", { exact: true }).click();
    await expect(page.locator(".linkedin-diagnostics")).toContainText("Tailoring queue could not accept this job");
    await expect(page.locator(".linkedin-diagnostics")).toContainText("Source rate limit");
    await expect(page.locator(".linkedin-diagnostics")).toContainText("12.5 seconds");
    await expect(page.locator(".linkedin-diagnostics")).toContainText("Duplicate detail reads avoided");
    await expect(page.locator(".linkedin-counts")).toContainText("Queued in last scan 4");
    if (count) {
      await expect(page.locator(".opening-card").first()).toContainText("Application Support Specialist 0");
      await expect(page.locator(".opening-card").first()).toContainText("Past day + Past week");
      await page.locator(".opening-card").first().getByText("Key qualifications", { exact: true }).click();
      await expect(page.locator(".opening-card").first()).toContainText("Full source requirement retained outside the short description.");
    }
    for (const width of [1100, 1000, 900, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `No horizontal document overflow at ${width}px`).toBe(true);
      await expect(page.getByRole("button", { name: "Check session", exact: true })).toBeVisible();
    }
    await page.getByText("Paste a LinkedIn job manually", { exact: true }).click();
    await expect(page.getByLabel("Full visible job text")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import and screen job" })).toBeDisabled();
  });
}

test("LinkedIn existing applications, exclusions and contact drafts remain distinct", async ({ page }) => {
  const data = fixture(5);
  data.postings[0].approvedApplicationId = "existing-application";
  data.postings[0].application = { id: "existing-application", status: "REVIEW", tailoringStatus: "SUCCEEDED" };
  data.postings[1].excluded = true;
  data.postings[1].cautions = ["Starting pay falls below the saved minimum"];
  await mount(page, data);
  await expect(page.locator(".opening-card")).toHaveCount(3);
  const first = page.locator(".opening-card").first();
  await first.getByText("Suggested contacts · draft only", { exact: true }).click();
  await expect(first.getByRole("textbox", { name: "Message draft for Pat Example" })).toBeVisible();
  await expect(first.getByRole("button", { name: /send/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^Approved/ }).click();
  await expect(page.getByRole("link", { name: "Open application" })).toHaveAttribute("href", "/applications/existing-application");
  await expect(page.locator(".opening-card")).toContainText("Tailoring: SUCCEEDED");
  await page.getByRole("button", { name: /^Excluded/ }).click();
  await expect(page.locator(".opening-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Tailor resume", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save job", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/tab=excluded/);
});


test("first collection submits exactly one selected job before enabling full scans", async ({ page }) => {
  const data = fixture(0);
  data.linkedinState = { ...data.linkedinState, status: "idle", retryAfter: null };
  await mount(page, data);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/discovery/linkedin", async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    await route.fulfill({ json: { message: "Fixture one-job inspection complete" } });
  });
  await expect(page.getByRole("button", { name: "Scan past day + week" })).toBeDisabled();
  await page.getByLabel("First inspection: LinkedIn job URL or job ID").fill("https://www.linkedin.com/jobs/view/1234567890/");
  await page.getByRole("button", { name: "Inspect one job", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ action: "scan", oneJob: "1234567890", window: "day" });
  await expect(page.getByRole("button", { name: "Inspect one job", exact: true })).toBeEnabled();
  await page.getByLabel("First inspection: LinkedIn job URL or job ID").fill("https://www.linkedin.com/jobs/search/?currentJobId=9876543210");
  await page.getByRole("button", { name: "Inspect one job", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({ action: "scan", oneJob: "9876543210", window: "day" });
  data.linkedinState = { ...data.linkedinState, firstExtractionAt: new Date().toISOString() };
  await page.getByRole("button", { name: "Check session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scan past day + week" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Inspect one job", exact: true })).toHaveCount(0);
});

test("preferred search can be saved during cooldown without starting collection", async ({ page }) => {
  await mount(page, fixture(0));
  const actions: Record<string, unknown>[] = [];
  await page.route('**/api/discovery/linkedin', route => {
    actions.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: 'Your LinkedIn search is saved.' } });
  });
  await page.getByText('Your preferred LinkedIn search', { exact: true }).click();
  const url = 'https://www.linkedin.com/jobs/search-results/?keywords=Application+Support+Engineer&geoId=104234982&distance=35&f_TPR=r604800';
  await page.getByLabel('Preferred LinkedIn search URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Save preferred search', exact: true }).click();
  await expect(page.getByText('Your LinkedIn search is saved.', { exact: true })).toBeVisible();
  expect(actions).toEqual([{ action: 'save-search', searchUrl: url }]);
  await expect(page.getByRole('button', { name: 'Scan past day + week' })).toBeDisabled();
});
