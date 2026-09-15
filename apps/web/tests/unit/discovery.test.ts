import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import evidence from "../../src/lib/discovery/candidate-evidence.json";
import { assessOpening, localDistance, roleFamily } from "../../src/lib/discovery/matching";
import { annualPay, employmentType, payFromText, safeExternalUrl, textFromHtml } from "../../src/lib/discovery/normalization";
import { normalizeOpening } from "../../src/lib/discovery/providers";
import { DEFAULT_DISCOVERY_PREFERENCES as prefs, readDiscoveryPreferences, type Opening, type Source } from "../../src/lib/discovery/types";

const opening: Opening = { externalId: "test", sourceKey: "lever:test", company: "Test employer", title: "Application Support Engineer", location: "Long Beach, CA", sourceUrl: "https://jobs.lever.co/test/test", description: "Troubleshoot SaaS production incidents using SQL, Jira, REST APIs and Postman. Support Microsoft 365 and Entra ID users. Work with incident escalations and SLA commitments.", employmentType: "Full-time", workArrangement: "Hybrid", salaryMin: 60000, salaryMax: 90000, salaryText: "$60,000–$90,000/year", postedAt: null };
const source = (provider: Source["provider"]): Source => ({ key: `${provider}:test`, board: "test", provider, company: "Test employer", url: "https://example.com" });

test("discovery evidence stays tied to the protected resume inspection", () => {
  const bytes = readFileSync(path.resolve(process.cwd(), "../..", evidence.source), "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), evidence.sourceSha256, "Refresh candidate-evidence.json when the protected resume inspection changes.");
  assert.ok(evidence.evidence.length >= 6);
  const inspection = JSON.parse(bytes) as { document: { paragraphs: { text: string }[] } };
  for (const excerpt of evidence.evidence) {
    assert.ok(inspection.document.paragraphs.some((p) => p.text === excerpt), "Every discovery excerpt must exist verbatim in the protected inspection.");
  }
  const profileBytes = readFileSync(path.resolve(process.cwd(), "../..", evidence.profileSource), "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(profileBytes).digest("hex"), evidence.profileSha256, "Refresh candidate-evidence.json when the candidate profile changes.");
  const profile = JSON.parse(profileBytes) as { confirmed_skills: string[]; confirmed_exposure: string[] };
  assert.deepEqual(evidence.confirmedSkills, profile.confirmed_skills);
  assert.deepEqual(evidence.confirmedExposure, profile.confirmed_exposure);
});

test("supports the user's exact full-time, local, $60k boundary", () => {
  const fit = assessOpening(opening, prefs);
  assert.equal(fit.qualified, true); assert.equal(fit.excluded, false);
  assert.ok(fit.matchReasons.includes("SQL & databases"));
  assert.ok(fit.distanceMiles! < 6);
  assert.equal(assessOpening({ ...opening, salaryMax: 59999, salaryMin: 50000 }, prefs).excluded, true);
  assert.equal(assessOpening({ ...opening, salaryMin: 55000 }, prefs).qualified, false);
});
test("does not invent salary, employment type, remote eligibility, or clearance", () => {
  assert.equal(assessOpening({ ...opening, salaryMin: null, salaryMax: null }, prefs).qualified, false);
  assert.equal(assessOpening({ ...opening, employmentType: "Not listed" }, prefs).qualified, false);
  assert.equal(assessOpening({ ...opening, employmentType: "Other" }, prefs).excluded, true);
  assert.equal(assessOpening({ ...opening, workArrangement: "Remote" }, prefs).excluded, true);
  assert.equal(assessOpening({ ...opening, description: `${opening.description} Must have an active security clearance.` }, prefs).qualified, false);
  assert.equal(assessOpening({ ...opening, title: "Senior Application Support Engineer" }, prefs).qualified, false);
});
test("excludes distant and ambiguous same-name locations instead of inventing proximity", () => {
  for (const location of ["San Jose, CA", "Palo Alto, CA", "Vandenberg, CA", "San Diego, CA", "Lakewood, CO", "Irvine, Scotland", "Burbank, CA"]) assert.equal(assessOpening({ ...opening, location }, prefs).excluded, true, location);
  assert.equal(localDistance("Irvine, Scotland"), null);
  assert.ok(localDistance("Irvine, California")! < 30);
  assert.equal(localDistance("Irvine, CA or Long Beach, CA"), null);
});
test("does not recommend aerospace hardware integration as software integrations", () => {
  for (const title of ["Integration Engineer, Avionics Test", "Integration Engineer, Fluid Systems Test", "Integration Engineer, Environmental Test", "Payload Integration Engineer II", "Mission Integration Engineer (Starshield)", "Mechanical Support Engineer", "Head of IT Support"]) assert.equal(roleFamily(title), null, title);
  assert.equal(roleFamily("Integration Support Engineer"), "core");
  assert.equal(roleFamily("IT Systems Administrator"), "adjacent");
});
test("normalizes hourly salaries at 2,080 hours and rejects unsupported currencies/periods", () => {
  assert.equal(annualPay(30, 40, "USD", "per-hour-wage").salaryMin, 62400);
  assert.equal(annualPay(5000, 6500, "USD", "month").salaryMin, 60000);
  for (const args of [[30, 40, "CAD", "hour"], [80, 30, "USD", "hour"], [30, 40, "USD", "unknown"], [NaN, 40, "USD", "hour"]] as const) assert.equal(annualPay(args[0], args[1], args[2], args[3]).salaryMin, null);
});
test("parses role-specific hourly bands without blending senior and junior pay", () => {
  const text = "Pay Range\nIS Support Specialist II: $31/hr - $44/hr\nSenior IS Support Specialist: $43/hr - $61/hr";
  assert.equal(payFromText(text, "IS Support Specialist II").salaryMin, 64480);
  assert.equal(payFromText(text, "IS Support Specialist II").salaryMax, 91520);
  assert.equal(payFromText(text).salaryMin, null);
  assert.equal(payFromText("Base salary: $60k–$90k per year").salaryMin, 60000);
  assert.equal(payFromText("Salary: CAD $60,000 - $90,000 per year").salaryMin, null);
  assert.equal(payFromText("Base salary: CAD $60,000 - $90,000 per year").salaryMin, null);
  assert.equal(payFromText("Bonus $10,000 - $20,000 annually").salaryMin, null);
});
test("employment benefits never imply this role is full-time", () => {
  assert.equal(employmentType(null, "Full-time employees receive benefits."), "Not listed");
  assert.equal(employmentType("Full-Time"), "Full-time");
  assert.equal(employmentType("Full-time contract"), "Other");
  assert.equal(employmentType(null, "This is a full-time employment position."), "Full-time");
});
test("live-source salary blurbs and specialist titles do not create false matches", () => {
  const job = normalizeOpening(source("greenhouse"), { id: 1, title: opening.title, location: { name: opening.location }, content: opening.description, absolute_url: "https://job-boards.greenhouse.io/test/jobs/1", pay_input_ranges: [{ min_cents: 6410000, max_cents: 11750000, currency_type: "USD", title: "Base Salary", blurb: "Sick leave: 1 hour per 30 hours worked." }] });
  assert.equal(job?.salaryMin, 64100);
  assert.equal(annualPay(64100, 117500, "USD", "hour").salaryMin, null);
  assert.equal(payFromText("Base salary $64,100 - $117,500 annually. Sick leave is 1 hour per 30 hours worked.").salaryMin, 64100);
  for (const title of ["Mission Support Engineer, EW", "Flight Test & Integration Specialist", "Senior RF Integration Engineer", "Systems Integration Engineer, High Speed Missiles", "Staff Propulsion Integration Engineer"]) assert.equal(roleFamily(title), null, title);
  for (const title of ["NX CAD Support Engineer", "AV Systems Administrator", "Information Systems Security Officer"]) assert.equal(assessOpening({ ...opening, title }, prefs).qualified, false, title);
  for (const description of ["Maintain an active U.S. Top Secret security clearance.", "Eligible to obtain a U.S. Security Clearance.", "4 – 6 years relevant work experience in Technical and/or Application Support."]) assert.equal(assessOpening({ ...opening, description: `${opening.description}\n${description}` }, prefs).qualified, false, description);
});
test("decodes double-escaped descriptions and strips executable markup", () => {
  assert.equal(textFromHtml("&amp;lt;p&amp;gt;SQL &amp;amp; APIs&amp;lt;/p&amp;gt;"), "SQL & APIs");
  assert.equal(textFromHtml("<script>alert(1)</script><p>Support</p>"), "Support");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("https://127.0.0.1/x"), null);
  assert.equal(safeExternalUrl("https://jobs.lever.co/test/id?utm_source=spam#apply"), "https://jobs.lever.co/test/id");
});
test("preserves descriptions and metadata for all four public providers", () => {
  const common = { id: "posting1" };
  const lever = normalizeOpening(source("lever"), { ...common, text: opening.title, categories: { location: opening.location, commitment: "Full-Time" }, descriptionPlain: opening.description, lists: [{ text: "Requirements", content: "<li>SQL</li>" }], salaryRange: { min: 30, max: 40, currency: "USD", interval: "per-hour-wage" }, hostedUrl: opening.sourceUrl, workplaceType: "hybrid" });
  assert.equal(lever?.salaryMin, 62400); assert.equal(lever?.employmentType, "Full-time"); assert.match(lever!.description, /Requirements\nSQL/);
  const greenhouse = normalizeOpening(source("greenhouse"), { ...common, title: opening.title, location: { name: opening.location }, content: opening.description, absolute_url: "https://job-boards.greenhouse.io/test/jobs/1", updated_at: "2026-09-01", metadata: [{ name: "Employment Type", value: "Full-time" }], pay_input_ranges: [{ min_cents: 6000000, max_cents: 9000000, currency_type: "USD" }] });
  assert.equal(greenhouse?.postedAt, null); assert.equal(greenhouse?.salaryMin, 60000);
  const ashby = normalizeOpening(source("ashby"), { ...common, title: opening.title, location: opening.location, descriptionPlain: opening.description, jobUrl: "https://jobs.ashbyhq.com/test/1", employmentType: "FullTime", isRemote: true, workplaceType: "Hybrid", compensation: { summaryComponents: [{ compensationType: "Salary", currencyCode: "USD", minValue: 60000, maxValue: 90000, interval: "1 YEAR" }] } });
  assert.equal(ashby?.workArrangement, "Hybrid"); assert.equal(ashby?.salaryMin, 60000);
  const smart = normalizeOpening(source("smartrecruiters"), { ...common, name: opening.title, location: { fullLocation: opening.location, remote: false }, typeOfEmployment: { label: "Full-time" }, postingUrl: "https://jobs.smartrecruiters.com/test/1", jobAd: { sections: { jobDescription: { title: "Description", text: opening.description } } } });
  assert.equal(smart?.employmentType, "Full-time"); assert.equal(smart?.workArrangement, "On-site");
});
test("preferences cannot silently widen the agreed 30-mile, $60k constraints", () => {
  assert.deepEqual(readDiscoveryPreferences({ radiusMiles: 100, minimumSalary: 20000 }), prefs);
  assert.deepEqual(readDiscoveryPreferences({ radiusMiles: 10, minimumSalary: 70000, includeRemote: true }), { radiusMiles: 10, minimumSalary: 70000, includeRemote: true });
});
