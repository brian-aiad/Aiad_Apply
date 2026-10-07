import assert from "node:assert/strict";
import test from "node:test";
import { parseCapture } from "../../src/lib/job-parser";
import { captureIntelligence } from "../../src/lib/capture-intelligence";
import { wordDiff } from "../../src/lib/word-diff";

const posting = `Company logo for, Example.
Example
Application Support Engineer
Irvine, CA
Full-time
Hybrid
About the job
Responsibilities
Troubleshoot production SaaS applications with SQL and Python.
Required Qualifications
Experience with Jira and Postman for incident investigation.
`;

test("capture recommendation explains exact evidence without a probability", () => {
  const fit = captureIntelligence(parseCapture(posting));
  assert.equal(fit.recommendation, "Strong Apply");
  assert.ok(fit.matches.some((m) => m.term === "SQL" && m.source.includes("SQL")));
  assert.ok(!("score" in fit));
});

test("named platform gaps and eligibility requirements cannot become confirmed matches", () => {
  const fit = captureIntelligence(parseCapture(`${posting}ServiceNow administration is required for this position.
Active security clearance and U.S. citizenship required.`));
  assert.equal(fit.recommendation, "Needs Review");
  assert.ok(fit.gaps.some((g) => g.term === "ServiceNow"));
  assert.ok(fit.confirmedFacts.some((fact) => /citizenship/i.test(fact)));
  assert.ok(fit.checks.some((line) => /clearance/i.test(line)));
  assert.ok(!fit.matches.some((m) => m.term === "ServiceNow"));
  const tailoring = fit.dimensions.find((item) => item.key === "tailoring");
  assert.match(JSON.stringify(tailoring), /drafted into Loavenly with review flags/);
  assert.doesNotMatch(JSON.stringify(tailoring), /must stay out/);
});

test("fit dimensions explain decisions without treating normal experience as a blocker", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
Required Qualifications
3+ years of application support experience.
Bachelor's degree in Computer Science or a related technical field.
Must be authorized to work in the United States without sponsorship.
$85,000 - $105,000 per year.`));
  assert.ok(!fit.checks.some((line) => /3\+ years/i.test(line)));
  assert.ok(fit.confirmedRequirements.some((line) => /Bachelor/i.test(line)));
  assert.ok(fit.confirmedRequirements.some((line) => /sponsorship/i.test(line)));
  assert.deepEqual(
    ["role", "experience", "technical", "responsibilities", "education", "location", "employment", "compensation", "requirements", "tailoring"],
    fit.dimensions.map((item) => item.key),
  );
});

test("experience beyond protected evidence remains an explicit review item", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
Required Qualifications
6-8 years of production application support experience.`));
  assert.equal(fit.recommendation, "Needs Review");
  assert.ok(fit.checks.some((line) => /6-8 years/i.test(line)));
  assert.equal(fit.dimensions.find((item) => item.key === "experience")?.status, "Material gap");
});

test("zero-to-four years is an explicit entry-level requirement, not missing data", () => {
  const fit = captureIntelligence(parseCapture(`${posting}\n0–4 years of experience in enterprise IT.`));
  const experience = fit.dimensions.find((item) => item.key === "experience");
  assert.equal(experience?.status, "Supported");
  assert.match(experience?.detail ?? "", /no prior years/);
  assert.ok(fit.confirmedFacts.some((fact) => /3\+ years/.test(fact)));
  const unspecified = captureIntelligence(parseCapture(posting));
  assert.equal(unspecified.dimensions.find((item) => item.key === "experience")?.status, "Not explicit");
});

test("preferred tools remain preferences and posting repetitions do not inflate overlap", () => {
  const fit = captureIntelligence(parseCapture(`${posting}Preferred Qualifications
ServiceNow administration experience is preferred.
SQL SQL SQL SQL SQL SQL`));
  assert.equal(fit.gaps[0].importance, "Preferred");
  assert.equal(fit.matches.filter((m) => m.term === "SQL").length, 1);
});

test("negated tool and clearance requirements do not become gaps or blockers", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
Required Qualifications
No prior ServiceNow experience required.
Security clearance is not required.`));

  assert.ok(!fit.gaps.some((gap) => gap.term === "ServiceNow"));
  assert.ok(!fit.checks.some((line) => /clearance/i.test(line)));
  assert.notEqual(fit.recommendation, "Needs Review");
});

test("sparse postings make recommendation uncertainty explicit", () => {
  const fit = captureIntelligence(parseCapture(`Example
Application Support Engineer
Troubleshoot applications.`));

  assert.equal(fit.confidence, "Limited posting detail");
  assert.equal(fit.recommendation, "Needs Review");
});

test("capture previews software drafts without upgrading them to candidate evidence", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
Use Java and Kubernetes to support production services.
Preferred Qualifications
MATLAB, DuckDB, FastAPI and Apache Spark experience preferred.`));
  for (const term of ["Java", "Kubernetes", "MATLAB", "DuckDB", "FastAPI", "Apache Spark"]) {
    assert.ok(fit.draftTechnologies.some(item => item.term === term), term);
    assert.ok(!fit.matches.some(item => item.term === term), term);
    const gap = fit.gaps.find(item => item.term === term);
    if (gap) assert.match(gap.reason, /editable DOCX/);
  }
  assert.equal(fit.draftTechnologies.find(item => item.term === "MATLAB")?.importance, "Preferred");
  // Existing Skills knowledge is preserved; proposed project usage remains a draft.
  assert.ok(!fit.gaps.some(item => item.term === "MATLAB"));
  assert.match(fit.reason, /generate an editable draft now/);
});

test("credential-only requests and eligibility remain evidence checks", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
ServiceNow certification is required.
ITIL certification is required.
Active security clearance is required.`));
  assert.equal(fit.recommendation, "Needs Review");
  assert.deepEqual(fit.draftTechnologies, []);
  assert.ok(fit.checks.some(line => /ServiceNow certification/.test(line)));
  assert.ok(fit.checks.some(line => /clearance/.test(line)));
  assert.match(fit.dimensions.find(item => item.key === "tailoring")?.detail ?? "", /project drafting does not establish/);
});

test("software use alongside a credential can be drafted without claiming the credential", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
Administer ServiceNow incident workflows.
ServiceNow certification is required.`));
  assert.ok(fit.draftTechnologies.some(item => item.term === "ServiceNow"));
  assert.ok(fit.checks.some(line => /certification/.test(line)));
  assert.ok(!fit.confirmedFacts.some(line => /ServiceNow/.test(line)));
});

test("negated and unrelated technologies do not leak into the draft preview", () => {
  const fit = captureIntelligence(parseCapture(`${posting}
JavaScript skills are required.
No prior MATLAB experience required.
Preferred Qualifications
DuckDB experience preferred.`));
  assert.ok(!fit.draftTechnologies.some(item => ["Java", "MATLAB"].includes(item.term)));
  assert.ok(fit.draftTechnologies.some(item => item.term === "DuckDB"));
  assert.equal(fit.dimensions.find(item => item.key === "tailoring")?.status, "Project draft");
});

test("phrase diff preserves both texts and highlights separate edits", () => {
  const before = "Resolved customer tickets with SQL and wrote notes.";
  const after = "Resolved production tickets with SQL and wrote documentation.";
  const diff = wordDiff(before, after);
  assert.equal(diff.before.map((p) => p.text).join(""), before);
  assert.equal(diff.after.map((p) => p.text).join(""), after);
  assert.deepEqual(diff.after.filter((p) => p.changed && p.text.trim()).map((p) => p.text), ["production", "documentation."]);
  for (const [a, b] of [["", "new"], ["old", ""], ["a ".repeat(1000), "b ".repeat(1000)], ["same", "same"]]) {
    const result = wordDiff(a, b);
    assert.equal(result.before.map((p) => p.text).join(""), a);
    assert.equal(result.after.map((p) => p.text).join(""), b);
  }
});

test("support years do not automatically satisfy engineering years or a different degree", () => {
  const fit = captureIntelligence(parseCapture(`${posting}\n2 years of embedded software development experience.\nBachelor degree in mechanical engineering.`));
  assert.equal(fit.dimensions.find((d) => d.key === "experience")?.status, "Different field");
  assert.ok(fit.checks.some((line) => line.includes("embedded")));
  assert.ok(!fit.confirmedFacts.includes("B.S. in Computer Science"));
});

test("capture previews C++ and C# as separate unverified draft technologies", () => {
  const fit = captureIntelligence(parseCapture(`${posting}\nExperience building integrations with C++ and C#.`));
  assert.ok(fit.draftTechnologies.some((item) => item.term === "C++"));
  assert.ok(fit.draftTechnologies.some((item) => item.term === "C#"));
});
