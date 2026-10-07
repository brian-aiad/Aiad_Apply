import assert from "node:assert/strict";
import test from "node:test";
import { californiaLocations, normalizeRtx, rtxCareerLevel } from "../../src/lib/discovery/rtx";
import { rtxFit } from "../../src/lib/discovery/rtx-fit";
import { postedWithin, postingDateLabel } from "../../src/lib/discovery/freshness";
const now = new Date("2026-10-02T10:00:00Z");
const raw = { jobPostingInfo: { canApply: true, posted: true, title: "Software Engineer I", jobReqId: "123", startDate: "2026-10-01", location: "US-CA-EL SEGUNDO-R01", externalUrl: "https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway/job/test_123", timeType: "Full time", jobDescription: "<p>Date Posted:</p>2026-10-01<p>Position Role Type:</p>Onsite<p>Raytheon Software Engineering</p><h2>Qualifications You Must Have</h2><p>STEM degree and 2 years of experience. C/C&#43;&#43; software development.</p><p>The salary range for this role is 62,900 USD - 119,700 USD.</p>" } };
test("RTX uses actual dates, California worksites, complete descriptions, salary and requisition IDs", () => {
  const job = normalizeRtx(raw, now)!;
  assert.equal(job.externalId, "123"); assert.equal(job.company, "Raytheon"); assert.equal(job.salaryMin, 62900);
  assert.ok(job.description.includes("C/C++")); assert.equal(job.employmentType, "Full-time");
  for (const change of [{ canApply: false }, { location: "US-TX-DALLAS" }, { externalUrl: "https://other.com/job/test" }, { jobDescription: raw.jobPostingInfo.jobDescription.replace("2026-10-01", "2026-08-01") }]) assert.equal(normalizeRtx({ jobPostingInfo: { ...raw.jobPostingInfo, ...change } }, now), null);
});
test("RTX finds California facets recursively and excludes senior/student labels", () => {
  assert.deepEqual(californiaLocations([{ values: [{ facetParameter: "locations", values: [{ descriptor: "US-CA-REMOTE", id: "ca" }, { descriptor: "US-TX-AUSTIN", id: "tx" }] }] }]), ["ca"]);
  assert.equal(rtxCareerLevel("Software Engineer II"), "experienced"); assert.equal(rtxCareerLevel("Senior Software Engineer"), "experienced"); assert.equal(rtxCareerLevel("Software Intern"), "student");
});
test("freshness rejects unknown and future publication dates", () => {
  assert.equal(postedWithin(null, 21, now), false); assert.equal(postedWithin("2026-10-03", 21, now), false);
  assert.equal(postedWithin("2026-09-11", 21, now), true); assert.equal(postedWithin("2026-09-10", 21, now), false);
  assert.equal(postingDateLabel("2026-10-01"), "Oct 1, 2026");
});
test("RTX distinguishes existing clearance from clearance after day one", () => {
  const job = normalizeRtx(raw, now)!;
  const required = rtxFit({ ...job, description: `${job.description}\nActive and transferable U.S. government issued clearance required prior to start.` }, 20, ["SQL"], now);
  assert.ok(required.cautions.some((c) => c.startsWith("Existing clearance")));
  const after = rtxFit({ ...job, description: `${job.description}\nSecurity Clearance Status: Active and existing security clearance required after day 1.` }, 20, ["SQL"], now);
  assert.equal(after.cautions.some((c) => c.startsWith("Existing clearance")), false);
  assert.ok(after.cautions.some((c) => c.startsWith("Clearance eligibility")));
  assert.equal(rtxFit({ ...job, postedAt: new Date("2026-08-01") }, 20, [], now).excluded, true);
});

test("RTX prioritizes support experience and excludes experienced engineering despite keyword overlap", () => {
  const base = normalizeRtx(raw, now)!;
  const preference = { usCitizen: true, clearance: "none" as const };
  const support = rtxFit({ ...base, title: "IT Support Specialist", description: "Qualifications You Must Have\nUniversity degree and 2 years of experience supporting Windows users. Troubleshoot incidents and tickets." }, 15, ["SQL", "Python", "Windows"], now, preference);
  const swe2 = rtxFit({ ...base, title: "Software Engineer II" }, 15, ["SQL", "Python", "Windows", "APIs", "Git", "Linux"], now, preference);
  const entry = rtxFit({ ...base, title: "Software Engineer I" }, 15, ["SQL", "Python", "Windows"], now, preference);
  assert.equal(support.excluded, false);
  assert.equal(swe2.excluded, true);
  assert.ok(support.score > entry.score);
  assert.ok(entry.score < 50);
});

test("entry title does not override specialist experience, degree or clearance barriers", () => {
  const base = normalizeRtx(raw, now)!;
  for (const required of ["Experience developing real-time embedded software.", "Bachelor degree in electrical engineering.", "5 years of systems experience.", "Active and transferable Secret clearance required prior to start."]) {
    assert.equal(rtxFit({ ...base, description: `Qualifications You Must Have\n${required}` }, 15, [], now, {clearance:"none"}).excluded, true, required);
  }
  const alternate = rtxFit({ ...base, title: "Program Cost Controls Analyst", description: "Qualifications You Must Have\nUniversity degree and less than 2 years of experience. Excel and financial reporting." }, 15, [], now, {usCitizen:true,clearance:"none"});
  assert.equal(alternate.excluded, false);
  assert.ok(alternate.matchReasons.includes("Adjacent analyst or operations route"));
  const preferred = rtxFit({ ...base, title: "IT Support Specialist", description: "Qualifications You Must Have\n2 years in technical support.\nQualifications We Prefer\n5 years of embedded software experience." }, 15, [], now, {clearance:"none"});
  assert.equal(preferred.excluded, false);
});

test("unnumbered support engineer remains eligible when its actual requirements fit", () => {
  const base = normalizeRtx(raw, now)!;
  const description = "Qualifications You Must Have\n2 years of application support and incident troubleshooting.";
  for (const title of ["Application Support Engineer", "Technical Support Engineer"]) {
    assert.equal(rtxFit({ ...base, title, description }, 15, [], now, { clearance: "none" }).excluded, false);
    assert.equal(rtxFit({ ...base, title: `Senior ${title}`, description }, 15, [], now).excluded, true);
  }
  assert.equal(rtxFit({ ...base, title: "Software Engineer", description }, 15, [], now).excluded, true);
});


test("RTX independent requirements cannot be diluted by a shorter skill requirement or graduate pathway", () => {
  const base = normalizeRtx(raw, now)!;
  for (const description of [
    "Qualifications You Must Have\nFive years of support experience.\nOne year of SQL experience.",
    "Qualifications You Must Have\nBachelor degree and 5 years of experience or Master degree and 2 years of experience.",
  ]) {
    assert.equal(rtxFit({ ...base, title: "IT Support Specialist", description }, 15, [], now, {clearance:"none"}).excluded, true);
  }
});


test("RTX malformed pay stays unverified instead of showing a misleading annual amount", () => {
  const job = normalizeRtx({jobPostingInfo:{...raw.jobPostingInfo, jobDescription:raw.jobPostingInfo.jobDescription.replace("62,900 USD - 119,700 USD", "$42,000K/yr to $50,000K/yr")}}, now)!;
  assert.equal(job.salaryMin, null);
  assert.equal(job.salaryText, "Pay needs verification · employer formatting");
  assert.ok(job.description.includes("$42,000K/yr"));
});
