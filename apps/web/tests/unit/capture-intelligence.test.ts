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
