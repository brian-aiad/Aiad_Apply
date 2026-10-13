import assert from "node:assert/strict";
import test from "node:test";
import { assessOpening, couldBeRelevant } from "../../src/lib/discovery/matching";
import { DEFAULT_DISCOVERY_PREFERENCES as prefs, type Opening } from "../../src/lib/discovery/types";

const opening: Opening = {
  externalId: "R17313", sourceKey: "workday:pacificlife", company: "Pacific Life",
  title: "Platform Engineer II", location: "Newport Beach, CA", sourceUrl: "https://pacificlife.wd1.myworkdayjobs.com/",
  employmentType: "Full-time", workArrangement: "On-site", salaryMin: 113490, salaryMax: 138710,
  salaryText: "$113,490–$138,710", postedAt: null,
  description: `Support enterprise end-user services and digital workplace platforms that reduce incidents and service requests.
Help build, test, deploy, and maintain reusable workflows and automations.
Develop operational scripts and API-based interactions under guidance.
Support platform administration, role-based permissions, integrations and data feeds.
The Experience You Bring
0–4 years of experience in enterprise IT supporting end-user services, platform administration, automation or analytics, including internships or co-ops.
Foundational experience maintaining scripts, API integrations and workflows using PowerShell, Python or HTTP-based calls.
Familiarity with enterprise identity and access governance.
What Makes You Stand Out
Experience creating dashboards and metrics for service performance.`,
};

test("platform descriptions are fetched and guided end-user platform duties qualify regardless of title", () => {
  assert.equal(couldBeRelevant(opening.title), true);
  const fit = assessOpening(opening, prefs);
  assert.equal(fit.excluded, false);
  assert.equal(fit.qualified, true);
  assert.ok(fit.matchReasons.some(reason => reason.startsWith("Digital-workplace platform duties")));
});

test("platform exception does not admit infrastructure roles or higher experience requirements", () => {
  for (const description of [
    "Required Qualifications\n2 years of Python, API, Jira incident and integration experience. Build Kubernetes infrastructure.",
    opening.description.replace("0–4 years", "5+ years"),
    opening.description.replace("What Makes You Stand Out", "Required Qualifications\nKubernetes and Terraform experience required.\nWhat Makes You Stand Out"),
  ]) assert.equal(assessOpening({ ...opening, description }, prefs).excluded, true);
  for (const title of ["Software Engineer II", "Site Reliability Engineer", "DevOps Engineer"]) {
    assert.equal(assessOpening({ ...opening, title }, prefs).excluded, true, title);
  }
});

test("duty-based exception preserves strict confirmed salary, radius and full-time requirements", () => {
  for (const patch of [
    { salaryMin: null }, { salaryMin: 59999 }, { location: "Ontario, CA" },
    { location: "Newport Beach, CA or New York, NY" },
    { employmentType: "Not listed" as const }, { employmentType: "Other" as const },
  ]) assert.equal(assessOpening({ ...opening, ...patch }, prefs).excluded, true);
});

test("senior title alone does not reject supported duties, but advanced scope still does", () => {
  const senior = { ...opening, title: "Senior Platform Engineer" };
  assert.equal(assessOpening(senior, prefs).qualified, true);
  for (const requirement of ["5 years of experience supporting platforms.", "Must have experience managing direct reports.", "Must own enterprise architecture."]) {
    const description = senior.description.replace("What Makes You Stand Out", `Requirements\n${requirement}\nWhat Makes You Stand Out`);
    assert.equal(assessOpening({ ...senior, description }, prefs).excluded, true, requirement);
  }
  assert.equal(assessOpening({ ...senior, salaryMin: 59000, topApplicant: true } as typeof senior, prefs).excluded, true);
});

const solutions = {
  ...opening, title: "Middleware Solutions Engineer I",
  description: `Resolve production issues and troubleshoot technical incidents.
Manage and prioritize support tickets. Support partner API integrations.
Requirements
2 to 5 years of customer-facing technical support or technical operations experience.
Working knowledge of SQL, Python, APIs and production systems in AWS.
Preferred qualifications
Restaurant technology experience.`,
};

test("solutions titles qualify from explicit support duties, not shared keywords alone", () => {
  assert.equal(couldBeRelevant(solutions.title), true);
  assert.equal(assessOpening(solutions, prefs).qualified, true);
  const sales = { ...solutions, description: "Requirements\n2 years of pre-sales experience. Present SQL, Python, API and AWS demonstrations. Resolve technical issues." };
  const result = assessOpening(sales, prefs);
  assert.equal(result.qualified, false);
  assert.ok(result.cautions.length > 0);
  for (const requirement of ["5 years of technical support experience.", "Must own enterprise architecture.", "Experience managing direct reports required."]) {
    assert.equal(assessOpening({ ...solutions, description: solutions.description.replace("Preferred qualifications", `${requirement}\nPreferred qualifications`) }, prefs).excluded, true, requirement);
  }
  for (const patch of [{ salaryMin: 59999 }, { location: "Ontario, CA" }, { employmentType: "Not listed" as const }]) {
    assert.equal(assessOpening({ ...solutions, ...patch }, prefs).excluded, true);
  }
});
