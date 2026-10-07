import assert from "node:assert/strict";
import test from "node:test";
import { clearanceRequirement, experienceRequirement, requiredQualifications, roleConditions } from "../../src/lib/discovery/requirements";
import { assessOpening } from "../../src/lib/discovery/matching";
import { DEFAULT_DISCOVERY_PREFERENCES, type Opening } from "../../src/lib/discovery/types";

const opening: Opening = { externalId: "qualification-test", sourceKey: "greenhouse:sample", company: "Sample", title: "Application Support Analyst", location: "Long Beach, CA", sourceUrl: "https://example.com/jobs/support", description: "", employmentType: "Full-time", workArrangement: "Hybrid", salaryMin: 65000, salaryMax: 85000, salaryText: "$65,000–85,000/year", postedAt: new Date() };
const assess = (description: string) => assessOpening({ ...opening, description }, { ...DEFAULT_DISCOVERY_PREFERENCES, clearance: "none" });

test("required heading carries qualification context; preferred and benefits do not", () => {
  assert.deepEqual(requiredQualifications("About us\nEstablished 20 years ago.\nREQUIRED QUALIFICATIONS\n2+ years of technical support experience.\nExperience with SQL and Jira.\nPREFERRED QUALIFICATIONS\n5 years of SAP experience.\nBenefits\nFull-time employees receive benefits."), ["2+ years of technical support experience.", "Experience with SQL and Jira."]);
  assert.deepEqual(requiredQualifications("What You'll Bring\nTwo years of IT support experience.\nNice To Haves/Other\nFive years of Salesforce experience."), ["Two years of IT support experience."]);
});

test("independent specialist requirement does not disappear behind a lower tool threshold", () => {
  const requirements = requiredQualifications("Required Qualifications\n5+ years of support experience.\n1 year of SQL experience.");
  assert.equal(experienceRequirement(requirements)?.years, 5);
  assert.equal(assess("Required Qualifications\n5+ years of support experience.\n1 year of SQL experience.").excluded, true);
});

test("preferred seniority does not exclude an otherwise suitable support role", () => {
  assert.equal(assess("Requirements\n2 years of support experience with SQL, Jira, APIs and SaaS.\nPreferred Qualifications\n5 years of support experience.").excluded, false);
  assert.equal(assess("Minimum Qualifications: 2 years of support experience.\nPreferred Qualifications\n8 years of SAP experience.").cautions.some(c => c.startsWith("Required SAP")), false);
});

test("master degree shortcut cannot stand in for the candidate's bachelor pathway", () => {
  assert.equal(experienceRequirement(["Bachelor degree and 5 years of experience or master degree and 2 years of experience."])?.years, 5);
});

test("known alternative ticketing tools do not create a false specialist gap", () => {
  const result = assess("Required Qualifications\n2 years of support experience.\nExperience with ticketing systems (e.g., Zendesk, Salesforce, JIRA).\nExperience with SQL, REST APIs and SaaS applications.");
  assert.equal(result.cautions.some(c => c.startsWith("Required Salesforce")), false);
  assert.equal(assess("Required Qualifications\nSalesforce administration experience.").cautions.some(c => c.startsWith("Required Salesforce")), true);
});

test("negated requirements in separate sentences do not erase an actual experience barrier", () => {
  const lines = requiredQualifications("REQUIRED QUALIFICATIONS\n5+ years of operations experience. Manufacturing experience is not required.");
  assert.equal(experienceRequirement(lines)?.years, 5);
});

test("clearance status distinguishes current clearance from ability to obtain it", () => {
  assert.equal(clearanceRequirement("An active Secret security clearance is required."), "existing");
  assert.equal(clearanceRequirement("Ability to obtain and maintain a U.S. Secret security clearance."), "obtainable");
  assert.equal(clearanceRequirement("Existing security clearance required after day 1."), "obtainable");
  assert.equal(clearanceRequirement("Security Clearance Type: None"), null);
  assert.equal(clearanceRequirement("No security clearance required. We protect your social security number."), null);
  assert.equal(clearanceRequirement("Our secret is great support."), null);
});

test("required IT engineering experience is a stretch, not verified support experience", () => {
  const result = assessOpening({ ...opening, title: "IT Systems Engineer", description: "REQUIRED QUALIFICATIONS\n3+ years of experience in IT Engineering.\nPython, REST APIs, Webhooks, SQL, SaaS and Jira.\nPREFERRED QUALIFICATIONS\nTerraform experience." }, DEFAULT_DISCOVERY_PREFERENCES);
  assert.equal(result.qualified, false);
  assert.ok(result.cautions.some(c => c.includes("experience is not established")));
  assert.equal(result.cautions.some(c => c.startsWith("Required Terraform")), false);
});

test("work conditions are surfaced without inventing requirements", () => {
  assert.deepEqual(roleConditions("Willingness to travel up to 25%. Second shift. Participate in the on-call rotation."), ["Travel up to 25%", "Evening / second shift", "On-call rotation"]);
  assert.deepEqual(roleConditions("Our overnight success took years. Travel up to 0%."), []);
});
