import assert from "node:assert/strict";
import test from "node:test";
import { eligibleForAutoTailoring } from "../../src/lib/discovery/automation-policy";
import { nextAdzunaBudget } from "../../src/lib/discovery/request-budget";
import { externalSources, integrationStatus, normalizeExternal } from "../../src/lib/discovery/external-providers";
import { DEFAULT_AUTOMATION, DEFAULT_DISCOVERY_PREFERENCES, readAutomationPreferences, type Source } from "../../src/lib/discovery/types";

const now = new Date("2026-10-02T12:00:00Z");
const settings = { ...DEFAULT_AUTOMATION, autoTailor: true };
const candidate = { sourceKey: "greenhouse:test", active: true, excluded: false, qualified: true, score: 90, cautions: [], description: "Real posting duties. ".repeat(30), dismissedAt: null, approvedApplicationId: null, postedAt: now, lastSeenAt: now };
const source = (provider: Source["provider"]): Source => ({ provider, key: `${provider}:test`, board: "test", company: "Test", url: "https://example.com" });

test("Adzuna caps minute and monthly requests and resets expired buckets", () => {
  let value = nextAdzunaBudget(null, now);
  for (let i = 1; i < 20; i++) value = nextAdzunaBudget(value, now);
  assert.throws(() => nextAdzunaBudget(value, now), /minute/);
  assert.equal(nextAdzunaBudget(value, new Date(now.getTime() + 60000)).minute.count, 1);
  assert.throws(() => nextAdzunaBudget({ month: { bucket: "2026-10", count: 2000 } }, now), /month/);
  assert.equal(nextAdzunaBudget({ month: { bucket: "2026-09", count: 2000 } }, now).month.count, 1);
});

test("automatic drafts require explicit enablement, full recent listings and clear fit", () => {
  assert.equal(eligibleForAutoTailoring(candidate, settings, now), true);
  assert.equal(eligibleForAutoTailoring(candidate, DEFAULT_AUTOMATION, now), false);
  for (const change of [{ active: false }, { excluded: true }, { qualified: false }, { score: 79 }, { cautions: ["Review required"] }, { description: "Excerpt" }, { approvedApplicationId: "saved" }, { dismissedAt: now }, { postedAt: null }, { postedAt: "invalid" }, { postedAt: "2026-09-01" }, { postedAt: "2026-10-03" }, { lastSeenAt: "2026-10-01" }, { sourceKey: "adzuna:test" }, { sourceKey: "usajobs:test" }]) {
    assert.equal(eligibleForAutoTailoring({ ...candidate, ...change }, settings, now), false, JSON.stringify(change));
  }
});

test("automation settings reject unsafe bounds and do not infer enablement", () => {
  assert.deepEqual(readAutomationPreferences({ dailyLimit: 100, minimumScore: 0, intervalHours: 0, autoTailor: "true" }), DEFAULT_AUTOMATION);
  assert.equal(readAutomationPreferences({ scheduledSearch: false }).scheduledSearch, false);
});

test("external sources require credentials or remote preference, never expose secrets", () => {
  assert.equal(externalSources(DEFAULT_DISCOVERY_PREFERENCES, {}).length, 0);
  const env = { ADZUNA_APP_ID: "private-id", ADZUNA_APP_KEY: "private-key", USAJOBS_API_KEY: "private-key", USAJOBS_EMAIL: "private-email" };
  const sources = externalSources({ ...DEFAULT_DISCOVERY_PREFERENCES, includeRemote: true }, env);
  assert.equal(sources.length, 8);
  assert.equal(JSON.stringify([sources, integrationStatus(env)]).includes("private-"), false);
});

test("Adzuna predictions remain unknown salary and excerpts remain identifiable", () => {
  const payload = { id: 1, title: "Application Support", company: { display_name: "Example" }, location: { display_name: "Long Beach, CA" }, description: "Troubleshoot SQL application incidents and support enterprise customers.", redirect_url: "https://www.adzuna.com/details/1", salary_min: 70000, salary_max: 90000, salary_is_predicted: "1", contract_time: "full_time" };
  assert.equal(normalizeExternal(source("adzuna"), payload)?.salaryMin, null);
  assert.equal(normalizeExternal(source("adzuna"), { ...payload, salary_is_predicted: "0" })?.salaryMin, 70000);
  assert.equal(normalizeExternal(source("adzuna"), { ...payload, redirect_url: "javascript:alert(1)" }), null);
});

test("Jobicy preserves full duties and USAJOBS preserves eligibility requirements", () => {
  const description = "Troubleshoot SQL application incidents and support enterprise customers.";
  const remote = normalizeExternal(source("jobicy"), { id: 2, jobTitle: "Support Analyst", companyName: "Example", jobGeo: "USA", jobDescription: `<p>${description}</p>`, url: "https://jobicy.com/jobs/2", jobType: ["full-time"], salaryMin: 70000, salaryMax: 90000, salaryCurrency: "USD", salaryPeriod: "year" });
  assert.equal(remote?.description, description);
  assert.equal(remote?.workArrangement, "Remote");
  assert.equal(remote?.employmentType, "Full-time");
  const federal = normalizeExternal(source("usajobs"), { MatchedObjectId: "3", MatchedObjectDescriptor: { PositionTitle: "IT Specialist", OrganizationName: "Agency", PositionURI: "https://www.usajobs.gov/job/3", UserArea: { Details: { JobSummary: description, WhoMayApply: { Name: "Current federal employees only" }, Requirements: ["Citizenship required"] } } } });
  assert.ok(federal?.description.includes("Current federal employees only"));
  assert.ok(federal?.description.includes("Citizenship required"));
});
