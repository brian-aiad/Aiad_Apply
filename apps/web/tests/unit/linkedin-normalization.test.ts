import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLinkedInOpening, canonicalApplyUrl, sameRoleIdentity, employerRequisitionIdentity } from "../../src/lib/discovery/linkedin-normalization";
import { assessOpening } from "../../src/lib/discovery/matching";
import { DEFAULT_DISCOVERY_PREFERENCES as prefs } from "../../src/lib/discovery/types";
const raw = {
  externalId: "4458415638", sourceUrl: "https://www.linkedin.com/jobs/view/4458415638/?trk=search", company: "Radiometer", title: "Application Support Consultant", location: "Brea, CA",
  description: `The team is located in Brea, CA or New Brighton, MN.
Manage service tickets, incident response and troubleshooting. Perform user access management.
Required Qualifications
1+ years of experience in application support. Basic user administration and troubleshooting.
The annual salary range for this role is $85KUSD-$95KUSD.`,
  employmentType: "Full-time", workArrangement: "On-site", postedAt: "2026-10-12", topApplicant: true, premiumMatch: "High", contacts: [],
  applyUrl: "https://careers.danaher.com/job?id=123&utm_source=linkedin",
};
test("normalizes selected local worksite and full-description pay without keyword stuffing", () => {
  const result = normalizeLinkedInOpening(raw)!;
  assert.equal(result.salaryMin, 85000); assert.equal(result.salaryMax, 95000);
  assert.equal(result.location, "Brea, CA"); assert.equal(result.premiumMatch, "high");
  assert.equal(result.sourceUrl, "https://www.linkedin.com/jobs/view/4458415638/");
  assert.equal(result.applyUrl, "https://careers.danaher.com/job?id=123");
  assert.equal(assessOpening(result, prefs).qualified, true);
});
test("uses salary card and rejects conflicting pay bands", () => {
  assert.equal(normalizeLinkedInOpening({ ...raw, description: "Application support", salaryText: "$85K–$95K/year" })!.salaryMin, 85000);
  assert.equal(normalizeLinkedInOpening({ ...raw, salaryText: "$60K–$70K/year" })!.salaryMin, null);
});
test("employer annual-or-hourly boilerplate resolves K bands without inflating ordinary rates", () => {
  const normalize = (band: string) => normalizeLinkedInOpening({ ...raw,
    description: `The annual salary range OR the hourly range for this role is ${band}.`, salaryText: undefined })!;
  assert.equal(normalize("$85KUSD-$95KUSD").salaryMin, 85000);
  assert.equal(normalize("$55KUSD-$65KUSD").salaryMin, 55000);
  assert.equal(normalize("$30-$40").salaryMin, null);
  assert.equal(normalize("$85K/hour-$95K/hour").salaryMin, null);
});
test("validates LinkedIn identities, dates, and URL safety", () => {
  for (const patch of [{ externalId: "123" }, { sourceUrl: "https://linkedin.com.evil.test/jobs/view/4458415638" }, { sourceUrl: "https://www.linkedin.com/feed" }]) assert.equal(normalizeLinkedInOpening({ ...raw, ...patch }), null);
  assert.equal(normalizeLinkedInOpening({ ...raw, postedAt: "yesterday" })!.postedAt, null);
  assert.equal(normalizeLinkedInOpening({ ...raw, sourceUrl: "https://www.linkedin.com/jobs/search-results/?currentJobId=4458415638" })!.externalId, raw.externalId);
  for (const url of ["http://example.com", "https://172.16.0.1/job", "https://192.168.1.1/job", "javascript:alert(1)"]) assert.equal(canonicalApplyUrl(url), null);
  assert.equal(canonicalApplyUrl("https://example.com/apply?jobId=42&requisitionId=R1&utm_campaign=x&trackingId=z"), "https://example.com/apply?jobId=42&requisitionId=R1");
  assert.equal(canonicalApplyUrl("https://www.linkedin.com/jobs/view/4458415638/"), null);
  assert.equal(normalizeLinkedInOpening({ ...raw, company: "Unknown company" }), null);
});
test("cross-source identity normalizes suffixes and locations without collapsing cities", () => {
  assert.equal(sameRoleIdentity("Pacific Life Inc.", "Platform Engineer II", "Newport Beach CA-700"), sameRoleIdentity("Pacific Life", "Platform Engineer 2", "Newport Beach, California, United States"));
  assert.notEqual(sameRoleIdentity("Employer", "Support Engineer", "Irvine, CA"), sameRoleIdentity("Employer", "Support Engineer", "Brea, CA"));
});

test("salary units and lower bounds never inflate a below-floor posting", () => {
  const normalize = (salaryText: string) => normalizeLinkedInOpening({ ...raw, description: "Support duties", salaryText })!;
  assert.equal(normalize("$30/hr - $40/hr").salaryMin, 62400);
  assert.equal(normalize("$5,000 - $6,000 per month").salaryMin, 60000);
  assert.equal(normalize("Monthly salary: $10,000 - $12,000").salaryMin, 120000);
  assert.equal(normalize("Base Pay Range\n$113,490 - $138,710").salaryMin, 113490);
  assert.equal(normalize("$60,000/year - $80,000/year").salaryMin, 60000);
  assert.equal(normalize("$59,999.99/year - $80,000/year").salaryMin, 59999);
  assert.equal(normalize("Starting at $30/hr").salaryMin, 62400);
  assert.equal(normalize("Up to $80,000/year").salaryMin, null);
  assert.equal(normalize("CAD $80,000 - $95,000 per year").salaryMin, null);
  assert.equal(normalize("$30/hour - $80,000/year").salaryMin, null);
  assert.equal(normalizeLinkedInOpening({ ...raw, postedAt: "2026-02-30" })!.postedAt, null);
  assert.equal(canonicalApplyUrl("https://example.com:444/jobs"), null);
});


test("ATS identity ignores title slugs but preserves distinct boards and requisitions", () => {
  const base = "https://pacificlife.wd1.myworkdayjobs.com/en-US/PacificLife/job/Newport-Beach/Platform-Engineer-II_R17313";
  const id = employerRequisitionIdentity(base);
  assert.equal(id, "workday:pacificlife.wd1.myworkdayjobs.com:pacificlife:r17313");
  assert.equal(employerRequisitionIdentity(base.replace("Platform-Engineer-II", "Changed-Title").replace("en-US/", "")), id);
  assert.notEqual(employerRequisitionIdentity(base.replace("R17313", "R17314")), id);
  assert.notEqual(employerRequisitionIdentity(base.replace("/PacificLife/", "/OtherBoard/")), id);
  assert.equal(employerRequisitionIdentity("https://boards.greenhouse.io/vast/jobs/4707513006?gh_src=li"), employerRequisitionIdentity("https://job-boards.greenhouse.io/vast/jobs/4707513006"));
  assert.equal(employerRequisitionIdentity("https://example.com/job/123"), null);
  assert.equal(employerRequisitionIdentity("https://jobs.lever.co/company/12345678-1234-1234-1234-123456789abc/apply"), "lever:company:12345678-1234-1234-1234-123456789abc");
});
