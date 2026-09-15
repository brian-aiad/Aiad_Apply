import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseCapture } from "../../src/lib/job-parser";

const fixtureRoot = path.resolve(process.cwd(), "..", "..", "data", "fixtures");

function fixture(name: string) {
  return readFileSync(path.join(fixtureRoot, name), "utf8");
}

test("parses the structured LinkedIn review capture without shifting header fields", () => {
  const rawPaste = `Company logo for, GoFundMe.
GoFundMe
Technical Support Engineer I
United States (Remote) · 41 minutes ago · 100 applicants
Remote
Full-time
$59,500 - $82,000
Applicants
100
Source URL: https://www.linkedin.com/jobs/view/4450618917/
About the job
What You’ll Accomplish
Manage initial investigation of escalated cases.
Write accurate and clear JIRA tickets with steps to reproduce.
What You Bring (Required)
Technical knowledge of software applications, troubleshooting, and basic programming
Familiarity with Postman, Jira, observability platforms, and Chat AI LLMs
Strong written and verbal communication skills
Why you’ll love it here
Make an Impact through comprehensive healthcare benefits`;

  const parsed = parseCapture(rawPaste);

  assert.equal(parsed.company, "GoFundMe");
  assert.equal(parsed.title, "Technical Support Engineer I");
  assert.equal(parsed.location, "United States (Remote)");
  assert.equal(parsed.workArrangement, "Remote");
  assert.equal(parsed.employmentType, "Full-time");
  assert.equal(parsed.postedText, "41 minutes ago");
  assert.equal(parsed.applicantCount, 100);
  assert.equal(parsed.salaryMin, 59_500);
  assert.equal(parsed.salaryMax, 82_000);
  assert.deepEqual(parsed.responsibilities, [
    "Manage initial investigation of escalated cases.",
    "Write accurate and clear JIRA tickets with steps to reproduce.",
  ]);
  assert.deepEqual(parsed.requiredQualifications, [
    "Technical knowledge of software applications, troubleshooting, and basic programming",
    "Familiarity with Postman, Jira, observability platforms, and Chat AI LLMs",
    "Strong written and verbal communication skills",
  ]);
});

test("parses current Nesco client-operations boundaries and Unicode metadata", () => {
  const raw = fixture(
    "nesco_technical_client_operations_specialist_2026_08_12.txt",
  );
  const parsed = parseCapture(raw);

  assert.equal(parsed.company, "Nesco Resource");
  assert.equal(parsed.title, "Technical Client Operations Specialist");
  assert.equal(parsed.location, "Aliso Viejo, CA");
  assert.equal(parsed.workArrangement, "Remote");
  assert.equal(parsed.salaryMin, 80_000);
  assert.equal(parsed.salaryMax, 95_000);
  assert.equal(parsed.responsibilities.length, 11);
  assert.equal(parsed.requiredQualifications.length, 9);
  assert.equal(parsed.preferredQualifications.length, 6);

  const withoutLogo = raw.replace(/^Company logo for,.*\n/m, "");
  const fallback = parseCapture(withoutLogo);
  assert.equal(fallback.company, "Nesco Resource");
  assert.equal(fallback.title, "Technical Client Operations Specialist");
});

test("parses D365 duties without leaking section headings or benefits", () => {
  const parsed = parseCapture(
    fixture("liquid_iv_d365_technical_analyst_2026_08_12.txt"),
  );

  assert.equal(parsed.company, "Liquid I.V.");
  assert.equal(parsed.title, "D365 Technical Analyst");
  assert.equal(parsed.location, "El Segundo, CA");
  assert.equal(parsed.workArrangement, "Hybrid");
  assert.equal(parsed.responsibilities.length, 12);
  assert.equal(parsed.requiredQualifications.length, 9);
  assert.equal(parsed.preferredQualifications.length, 2);
  assert.ok(
    !parsed.responsibilities.includes("Application & End User Support"),
  );
  assert.ok(
    !parsed.requiredQualifications.some((line) => line.includes("401k")),
  );
  assert.ok(!parsed.cleanDescription.includes("Benefits found in job post"));
});

test("parses an RTX employer page without an About the job boundary", () => {
  const parsed = parseCapture(
    fixture("rtx_raytheon_systems_engineer_radar_integration_test_2026_08_10.txt"),
  );

  assert.equal(parsed.company, "Raytheon");
  assert.equal(
    parsed.title,
    "Systems Engineer I: Radar System Integration & Test - Onsite",
  );
  assert.match(parsed.location ?? "", /^El Segundo, California/);
  assert.equal(parsed.workArrangement, "On-site");
  assert.equal(parsed.employmentType, "Full-time");
  assert.equal(parsed.salaryMin, 62_900);
  assert.equal(parsed.salaryMax, 119_700);
  assert.equal(parsed.responsibilities.length, 11);
  assert.equal(parsed.requiredQualifications.length, 4);
  assert.equal(parsed.preferredQualifications.length, 5);
  assert.ok(!parsed.responsibilities.some((line) => line.startsWith("After completion")));
});

test("parses the five-role RTX manufacturing, quality, semiconductor, and RF stress set", () => {
  const cases = [
    ["rtx_collins_manufacturing_engineer_riverside_01865676.txt", "Collins Aerospace", "Manufacturing Engineer", "Riverside, California, United States of America", 9, 5, 6],
    ["rtx_collins_product_quality_engineer_i_01863833.txt", "Collins Aerospace", "Product Quality Engineer I (Onsite)", "Fairfield, California, United States of America", 11, 4, 7],
    ["rtx_raytheon_semiconductor_manufacturing_engineer_01862457.txt", "Raytheon", "Semiconductor Manufacturing Engineer - Goleta, CA", "Goleta, California, United States of America", 8, 3, 8],
    ["rtx_raytheon_rf_microwave_antenna_engineer_i_01864246.txt", "Raytheon", "RF/Microwave Antenna Electrical Engineer I (Onsite)", "El Segundo, California", 3, 3, 10],
    ["rtx_raytheon_manufacturing_engineer_goleta_01864965.txt", "Raytheon", "Manufacturing Engineer", "Goleta, California, United States of America", 8, 2, 8],
  ] as const;

  for (const [name, company, title, location, responsibilities, required, preferred] of cases) {
    const parsed = parseCapture(fixture(name));
    assert.equal(parsed.company, company, name);
    assert.equal(parsed.title, title, name);
    assert.equal(parsed.location, location, name);
    assert.equal(parsed.workArrangement, "On-site", name);
    assert.equal(parsed.employmentType, "Full-time", name);
    assert.equal(parsed.responsibilities.length, responsibilities, name);
    assert.equal(parsed.requiredQualifications.length, required, name);
    assert.equal(parsed.preferredQualifications.length, preferred, name);
    assert.ok(!parsed.cleanDescription.includes("necessary cookies"), name);
    assert.ok(!parsed.cleanDescription.includes("Similar Jobs"), name);
    assert.ok(!parsed.cleanDescription.includes("Workday, Inc."), name);
  }
});

test("parses the dated live LinkedIn corpus consistently", () => {
  const cases = [
    ["linkedin_4215127819_coreweave_technical_support_engineer_bare_metal.txt", 83_000, 145_000, 13, 13, 0],
    ["linkedin_4369610709_infinite_giving_client_operations_specialist.txt", null, null, 3, 7, 3],
    ["linkedin_4401508206_liveramp_technical_support_engineer.txt", 75_000, 109_000, 5, 15, 3],
    ["linkedin_4431436073_crossover_technical_support_engineer_trilogy_remote_60_000_y.txt", 60_000, null, 1, 6, 4],
    ["linkedin_4432540287_kapsch_group_technical_support_engineer.txt", 62_000, 110_000, 10, 7, 0],
    ["linkedin_4435487199_community_energy_labs_technical_support_engineer_field_engin.txt", 75_000, 100_000, 17, 12, 6],
    ["linkedin_4453661445_southern_california_edison_sce_gis_and_system_support_specia.txt", null, null, 5, 1, 6],
  ] as const;

  for (const [name, salaryMin, salaryMax, responsibilities, required, preferred] of cases) {
    const parsed = parseCapture(fixture(path.join("live_linkedin_20260813", name)));
    assert.equal(parsed.salaryMin, salaryMin, name);
    assert.equal(parsed.salaryMax, salaryMax, name);
    assert.equal(parsed.responsibilities.length, responsibilities, name);
    assert.equal(parsed.requiredQualifications.length, required, name);
    assert.equal(parsed.preferredQualifications.length, preferred, name);
  }
});

test("extracts usable sections from every saved real-posting fixture", () => {
  const fixtureFiles: string[] = [];
  const collect = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (entry.name.endsWith(".txt")) fixtureFiles.push(fullPath);
    }
  };
  collect(fixtureRoot);

  assert.ok(fixtureFiles.length >= 35, "expected the real-posting fixture corpus");
  for (const filePath of fixtureFiles) {
    const parsed = parseCapture(readFileSync(filePath, "utf8"));
    const label = path.relative(fixtureRoot, filePath);
    assert.notEqual(parsed.company, "Unknown company", label);
    assert.notEqual(parsed.title, "Untitled role", label);
    assert.ok(parsed.cleanDescription.length >= 100, label);
    assert.ok(parsed.responsibilities.length > 0, `${label}: responsibilities`);
    assert.ok(parsed.requiredQualifications.length > 0, `${label}: requirements`);
  }
});

test("parses Greenhouse banner navigation and custom application-support headings", () => {
  const parsed = parseCapture(
    fixture("inspire_home_loans_technology_operations_engineer_2026_09_14.txt"),
  );

  assert.equal(parsed.company, "Inspire Home Loans");
  assert.equal(parsed.title, "Technology Operations Engineer");
  assert.equal(parsed.location, "Newport Beach, CA");
  assert.equal(parsed.responsibilities.length, 20);
  assert.equal(parsed.requiredQualifications.length, 11);
  assert.equal(parsed.preferredQualifications.length, 2);
  assert.ok(!parsed.cleanDescription.includes("Apply for this job"));
});
