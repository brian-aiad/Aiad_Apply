import assert from "node:assert/strict";
import test from "node:test";
import { localWorkdayFacets, normalizeWorkday } from "../../src/lib/discovery/workday";
import { DEFAULT_DISCOVERY_PREFERENCES as prefs, type Source } from "../../src/lib/discovery/types";
const source: Source = { key: "workday:travismathew", provider: "workday", board: "TravisMathew-Careers", company: "TravisMathew", url: "https://tcbrands.wd1.myworkdayjobs.com/TravisMathew-Careers" };
const detail = { jobPostingInfo: { canApply: true, posted: true, jobReqId: "JR123", title: "Help Desk Support Representative", location: "TM - HQ - Huntington Beach", timeType: "Full time", startDate: "2026-09-30", externalUrl: "https://tcbrands.wd1.myworkdayjobs.com/en-US/TravisMathew-Careers/job/Help-Desk_JR123", jobDescription: "<h2>Requirements</h2><p>2 years of IT support experience. Support Microsoft 365, SQL, Jira and Windows users. Work with end users on incident troubleshooting.</p><p>The hourly pay range is $30.00 - $40.00 per hour.</p>" } };
test("public Workday detail preserves employer date, complete qualifications and annualized hourly pay", () => {
  const job = normalizeWorkday(source, detail)!;
  assert.equal(job.company, "TravisMathew");
  assert.equal(job.externalId, "JR123");
  assert.equal(job.postedAt?.toISOString(), "2026-09-30T00:00:00.000Z");
  assert.equal(job.salaryMin, 62400);
  assert.equal(job.employmentType, "Full-time");
  assert.ok(job.description.includes("Requirements\n2 years"));
});
test("Workday closed jobs, unexpected URLs and unregistered boards cannot become openings", () => {
  for (const change of [{ canApply: false }, { posted: false }, { externalUrl: "https://example.com/TravisMathew-Careers/job/Help-Desk_JR123" }, { externalUrl: "https://tcbrands.wd1.myworkdayjobs.com/Other/job/123" }]) assert.equal(normalizeWorkday(source, { jobPostingInfo: { ...detail.jobPostingInfo, ...change } }), null);
  assert.equal(normalizeWorkday({ ...source, key: "workday:unregistered" }, detail), null);
});
test("unknown posting date stays unknown, while a printed original date beats a refresh date", () => {
  const unknown = normalizeWorkday(source, { jobPostingInfo: { ...detail.jobPostingInfo, startDate: null, postedOn: "Posted Yesterday" } });
  assert.equal(unknown?.postedAt, null);
  const printed = normalizeWorkday(source, { jobPostingInfo: { ...detail.jobPostingInfo, jobDescription: "<p>Original Posting Date: 2026-08-01</p>" + detail.jobPostingInfo.jobDescription } });
  assert.equal(printed?.postedAt?.toISOString().slice(0, 10), "2026-08-01");
});
test("Workday local facets stay within the actual commute preference", () => {
  assert.deepEqual(localWorkdayFacets([{ facetParameter: "locationHierarchy1", values: [{ facetParameter: "locations", values: [{ id: "local", descriptor: "TM - HQ - Huntington Beach" }, { id: "far", descriptor: "San Diego, CA" }, { id: "remote", descriptor: "United States - Remote" }, { id: "nonUS", descriptor: "Canada - Remote" }] }] }], prefs), { locations: ["local"] });
});

test("annual midpoint bands preserve the actual minimum and maximum", () => {
  const job = normalizeWorkday(source, { jobPostingInfo: { ...detail.jobPostingInfo, jobDescription: detail.jobPostingInfo.jobDescription.replace("The hourly pay range is $30.00 - $40.00 per hour.", "71,400.00 - 89,300.00 - 107,200.00 USD Annual") } });
  assert.equal(job?.salaryMin, 71400);
  assert.equal(job?.salaryMax, 107200);
  assert.equal(normalizeWorkday(source, { jobPostingInfo: { ...detail.jobPostingInfo, startDate: "2026-02-31" } })?.postedAt, null);
});
