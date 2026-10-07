import assert from "node:assert/strict";
import test from "node:test";
import { applicationDestination, applicationPortal, handoffBlockers, reviewedArtifactMatches } from "../../src/lib/application-handoff";
import { applicationProfileSchema, autofillContact, emptyApplicationProfile, missingContactFields } from "../../src/lib/application-profile";
const run = { id: "run", status: "SUCCEEDED", validationPassed: true, pageCount: 1, reportSnapshot: { tailoring_mode: "evidence_only" }, artifacts: [{ id: "pdf", kind: "PDF", sha256: "hash" }] };
test("handoff requires a validated current-policy PDF and an unsubmitted application", () => {
  assert.deepEqual(handoffBlockers("REVIEW", run, false, "https://jobs.lever.co/company/job"), []);
  for (const status of ["APPLIED", "INTERVIEW", "CLOSED"]) assert.ok(handoffBlockers(status, run, false, "https://example.com/job").length);
  for (const changed of [{ ...run, pageCount: 2 }, { ...run, validationPassed: false }, { ...run, status: "FAILED" }, { ...run, reportSnapshot: { tailoring_mode: "aggressive_draft" } }, { ...run, artifacts: [] }]) assert.ok(handoffBlockers("REVIEW", changed, false, "https://example.com/job").length);
  assert.ok(handoffBlockers("READY", run, true, "https://example.com/job").length);
  assert.ok(handoffBlockers("READY", run, false, null).length);
});
test("application destinations prefer employer apply URLs and reject unsafe links", () => {
  assert.equal(applicationDestination("https://jobs.lever.co/company/job/apply", "https://linkedin.com/jobs/view/123"), "https://jobs.lever.co/company/job/apply");
  for (const url of ["javascript:alert(1)", "http://employer.com/job", "https://user:pass@employer.com/job", "https://127.0.0.1/job", "https://192.168.1.1/job"]) assert.equal(applicationDestination(url, null), null);
  assert.equal(applicationPortal("https://company.wd5.myworkdayjobs.com/jobs/123"), "Workday");
  assert.equal(applicationPortal("https://evilgreenhouse.io/jobs/123"), "Employer website");
});
test("review acknowledgement is specific to the exact resume version and bytes", () => {
  const detail = { runId: "r1", resumeSha256: "hash1" };
  assert.ok(reviewedArtifactMatches(detail, "r1", "hash1"));
  assert.equal(reviewedArtifactMatches(detail, "r2", "hash1"), false);
  assert.equal(reviewedArtifactMatches(detail, "r1", "hash2"), false);
  assert.equal(reviewedArtifactMatches(null, "r1", "hash1"), false);
});
test("automatic fields exclude eligibility, salary, clearance and other screening answers", () => {
  const profile = { ...emptyApplicationProfile, firstName: "Test", lastName: "Person", email: "test@example.com", phone: "5551234567", workAuthorization: "Answer", sponsorship: "Answer", clearance: "Answer", desiredSalary: "Answer" };
  assert.deepEqual(missingContactFields(profile), []);
  assert.equal(missingContactFields(emptyApplicationProfile).length, 4);
  const contact = autofillContact(profile);
  for (const key of ["workAuthorization", "sponsorship", "clearance", "desiredSalary", "startDate", "relocation"]) assert.equal(key in contact, false);
  assert.equal(contact.email, "test@example.com");
  assert.equal(applicationProfileSchema.safeParse({ ...profile, linkedin: "javascript:alert(1)" }).success, false);
});

test("application question evidence preserves exact validated text and excludes flagged claims", async () => {
  const { applicationEvidence } = await import("../../src/lib/application-evidence");
  const base = { paragraphId: "experience.original_insurance.bullet.1", section: "experience.original_insurance", paragraphKind: "bullet", finalText: "Resolved 200+ tickets in Jira.", riskLevel: "LOW", targetTerms: ["Jira"] };
  const snippets = applicationEvidence([base, { ...base, riskLevel: "HIGH", finalText: "Invented claim" }, { ...base, paragraphKind: "heading" }]);
  assert.equal(snippets.length, 1); assert.equal(snippets[0].text, base.finalText); assert.equal(snippets[0].source, "Original Insurance");
});
