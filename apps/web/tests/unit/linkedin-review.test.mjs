import assert from "node:assert/strict";
import test from "node:test";

import {
  assessFit,
  buildPaste,
  extractSalary,
  parseTopCardMetadata,
} from "../../scripts/linkedin-review.mjs";

test("top-card metadata stays scoped to the selected job", () => {
  const result = parseTopCardMetadata({
    title: "Technical Support Engineer (Bare Metal)",
    company: "CoreWeave",
    metadataText:
      "Sunnyvale, CA \u00b7 Reposted 2 weeks ago \u00b7 Over 100 people clicked apply",
  });

  assert.deepEqual(result, {
    location: "Sunnyvale, CA",
    posted: "Reposted 2 weeks ago",
    applicants: "Over 100 people clicked apply",
  });
});

test("salary extraction accepts typographic range dashes without trailing prose", () => {
  assert.equal(
    extractSalary("This role pays $62,000 \u2013 $110,000, based on location and experience."),
    "$62,000 - $110,000",
  );
});

test("company age is not treated as a candidate experience requirement", () => {
  const fit = assessFit({
    title: "Technical Support Engineer",
    description:
      "Our company has 130 years of experience. Troubleshoot production apps using SQL, Linux, Python, and Jira.",
  });

  assert.equal(fit.gaps.includes("requires 5+ years"), false);
  assert.equal(fit.qualified, true);
});

test("Central America does not create a false Microsoft Entra match", () => {
  const fit = assessFit({
    title: "Technical Support Engineer",
    description:
      "Candidates may be based in Central America. Support a cloud SaaS product using REST APIs and JSON.",
  });

  assert.equal(fit.strengths.includes("Microsoft 365/identity"), false);
});

test("fintech client operations and onboarding are recognized as a relevant path", () => {
  const fit = assessFit({
    title: "Client Operations Specialist",
    description:
      "Manage Intercom support tickets and technical onboarding for a fintech SaaS platform and financial operations.",
  });

  assert.equal(fit.qualified, true);
  assert.ok(fit.score >= 48);
});

test("specialized infrastructure and field-engineering roles are down-ranked", () => {
  const gpu = assessFit({
    title: "Technical Support Engineer (Bare Metal)",
    description:
      "Own bare-metal GPU fleets in a data center environment, including firmware and BIOS configuration.",
  });
  const building = assessFit({
    title: "Technical Support Engineer / Field Engineer",
    description:
      "Commission HVAC building controls, thermostat platforms, gateway devices, meters, and sensors during site visits.",
  });

  assert.equal(gpu.qualified, false);
  assert.equal(building.qualified, false);
  assert.ok(gpu.gaps.includes("specialized GPU/data-center infrastructure"));
  assert.ok(building.gaps.includes("specialized building-controls field work"));
});

test("fixture paste uses a clean LinkedIn metadata separator", () => {
  const paste = buildPaste({
    jobId: "1234567",
    title: "Technical Support Engineer",
    company: "Example",
    location: "Remote",
    posted: "2 hours ago",
    applicants: "20 applicants",
    salary: "",
    url: "https://www.linkedin.com/jobs/view/1234567/",
    description: "About the job\nTroubleshoot customer issues.",
  });

  assert.match(paste, /Remote \u00b7 2 hours ago \u00b7 20 applicants/);
  assert.equal(paste.includes("\u00c2"), false);
});
