import assert from "node:assert/strict";
import test from "node:test";
import { applyEvidenceDecision, evidenceDecisionSchema } from "../../src/lib/candidate-profile";

test("project attribution requires an explicit location and completed-work detail", () => {
  const data = { term: "Java", category: "technology", decision: "confirmed", scope: "source_specific" };
  assert.equal(evidenceDecisionSchema.safeParse(data).success, false);
  assert.equal(evidenceDecisionSchema.safeParse({ ...data, evidenceReference: "projects.loavenly", notes: "Built an inventory API in Java." }).success, true);
  assert.equal(evidenceDecisionSchema.safeParse({ ...data, evidenceReference: "invented.employer", notes: "Invented details" }).success, false);
});

test("basic confirmation remains skills only; project confirmation stores attribution", () => {
  let profile: Record<string, unknown> = applyEvidenceDecision({}, evidenceDecisionSchema.parse({ term: "Java", category: "technology", decision: "confirmed" }));
  assert.equal((profile.confirmed_evidence as Record<string, unknown>[])[0].scope, "skills_only");
  profile = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "Java", category: "technology", decision: "confirmed", scope: "source_specific", evidenceReference: "projects.loavenly", notes: "Built an inventory API in Java." }));
  const evidence = profile.confirmed_evidence as Record<string, unknown>[];
  assert.equal(evidence.length, 2);
  assert.equal(evidence[1].evidence_reference, "projects.loavenly");
  assert.match(String(evidence[1].notes), /inventory API/);
});

test("rejection clears all scoped uses case-insensitively without removing JavaScript", () => {
  const profile = { confirmed_skills: ["Java", "JavaScript"], confirmed_evidence: [
    { term: "Java", scope: "source_specific", evidence_reference: "projects.loavenly" },
    { term: "JavaScript", scope: "skills_only", evidence_reference: "" },
  ] };
  const updated = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "java", category: "technology", decision: "rejected" }));
  assert.deepEqual(updated.confirmed_skills, ["JavaScript"]);
  assert.equal(updated.confirmed_evidence.length, 1);
  assert.deepEqual(updated.rejected_terms, ["java"]);
});

test("future rejection revokes everyday inference while unrelated decisions retain it", () => {
  const profile = { everyday_tools: ["Excel", "Claude"], confirmed_skills: ["Excel", "Claude"] };
  const updated = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "excel", category: "technology", decision: "rejected" }));
  assert.deepEqual(updated.everyday_tools, ["Claude"]);
  const unrelated = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "Tableau", category: "technology", decision: "confirmed" }));
  assert.deepEqual(unrelated.everyday_tools, ["Excel", "Claude"]);
});

test("profile decisions preserve established technical permission and explicit rejection revokes it", () => {
  const profile = { established_technologies: ["AWS", "CI/CD"] };
  const unrelated = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "Excel", category: "technology", decision: "confirmed" }));
  assert.deepEqual(unrelated.established_technologies, ["AWS", "CI/CD"]);
  const rejected = applyEvidenceDecision(profile, evidenceDecisionSchema.parse({ term: "AWS", category: "technology", decision: "rejected" }));
  assert.deepEqual(rejected.established_technologies, ["CI/CD"]);
});
