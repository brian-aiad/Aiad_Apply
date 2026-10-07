import assert from "node:assert/strict";
import test from "node:test";
import { savedEvidenceStatus, transferableWithoutQuestion } from "../../src/lib/stretch-review";

test("explicit rejection wins over old confirmed skills, exposure and source evidence", () => {
  const profile = {
    confirmed_skills: ["Critical Thinking"], confirmed_exposure: ["critical thinking"],
    confirmed_evidence: [{ term: "critical thinking", scope: "source_specific", evidence_reference: "experience.csulb" }],
    rejected_terms: ["  CRITICAL THINKING  "],
  };
  assert.equal(savedEvidenceStatus(profile, " Critical Thinking "), "rejected");
  assert.equal(transferableWithoutQuestion("critical thinking", "DIRECT", profile), false);
});

test("all supported saved scopes display a saved decision without inventing new scopes", () => {
  for (const scope of ["skills_only", "general_exposure", "source_specific"]) {
    const profile = { confirmed_evidence: [{ term: "AI", scope, evidence_reference: scope === "source_specific" ? "projects.loavenly" : "" }] };
    const snapshot = JSON.stringify(profile);
    assert.equal(savedEvidenceStatus(profile, " ai "), "confirmed");
    assert.equal(savedEvidenceStatus(profile, "CRUD"), undefined);
    assert.equal(JSON.stringify(profile), snapshot);
  }
  assert.equal(savedEvidenceStatus({ confirmed_skills: ["Python"] }, "python"), "confirmed");
  assert.equal(savedEvidenceStatus({ confirmed_exposure: ["Case Management"] }, "case management"), "confirmed");
});

test("missing or malformed historical profile collections are not saved confirmations", () => {
  const profile = { confirmed_skills: "AI", confirmed_exposure: null, confirmed_evidence: [null, 3, {}, { other: "AI" }], rejected_terms: {} };
  assert.equal(savedEvidenceStatus(profile, "AI"), undefined);
  assert.equal(savedEvidenceStatus({}, "AI"), undefined);
  assert.equal(savedEvidenceStatus({ confirmed_skills: ["JavaScript"] }, "Java"), undefined);
  assert.equal(savedEvidenceStatus({ rejected_terms: ["case"] }, "case management"), undefined);
});

test("ordinary capabilities need recorded direct or strong evidence before automatic handling", () => {
  for (const term of ["critical thinking", "fast-paced environment", "communication skills", "case management", "cross-functional collaboration", "technical writing", "enterprise software", "automation"]) {
    for (const evidence of ["DIRECT", "STRONGLY_TRANSFERABLE"]) assert.equal(transferableWithoutQuestion(term, evidence, {}), true, `${term}: ${evidence}`);
    for (const evidence of ["WEAKLY_TRANSFERABLE", "UNSUPPORTED", "REJECTED", "UNKNOWN", undefined]) assert.equal(transferableWithoutQuestion(term, evidence, {}), false, `${term}: ${evidence}`);
  }
  assert.equal(transferableWithoutQuestion("Critical Thinking", "DIRECT", {}), true);
});

test("technical tools and implementations never become automatic through a generic label or saved Skills knowledge", () => {
  for (const term of ["AI", "CRUD", "Salesforce", "Zendesk", "knowledge base", "B2B SaaS"]) {
    for (const evidence of ["DIRECT", "STRONGLY_TRANSFERABLE", undefined]) {
      assert.equal(transferableWithoutQuestion(term, evidence, { confirmed_skills: [term] }), false, `${term}: ${evidence}`);
    }
  }
  assert.equal(transferableWithoutQuestion("critical thinking", undefined, { confirmed_skills: ["critical thinking"] }), false);
});

test("established basic technologies are automatic even on an older Skills-only report", () => {
  const profile = { established_technologies: ["Python", "APIs", "REST APIs", "Webhooks", "AWS", "CI/CD"] };
  for (const term of ["Python", "API", "REST API", "webhook", "Amazon Web Services", "Continuous Integration"]) {
    assert.equal(savedEvidenceStatus(profile, term), "confirmed");
    assert.equal(transferableWithoutQuestion(term, "UNSUPPORTED", profile), true);
  }
  for (const term of ["Go", "Rust", "Terraform", "Salesforce", "EC2"]) {
    assert.equal(transferableWithoutQuestion(term, "DIRECT", profile), false);
  }
  assert.equal(transferableWithoutQuestion("Amazon Web Services", "DIRECT",
    { ...profile, rejected_terms: ["AWS"] }), false);
});

test("broader common coding permission includes Go and Rust without a technology-by-technology question", () => {
  const profile = { established_technologies: ["Go", "Rust", "React", "Git", "Linux", "SQL"] };
  for (const term of ["Go", "Golang", "Rust", "React.js", "Git", "Linux", "SQL"]) {
    assert.equal(transferableWithoutQuestion(term, undefined, profile), true);
  }
  assert.equal(transferableWithoutQuestion("CAD", undefined, profile), false);
  assert.equal(transferableWithoutQuestion("Rust", undefined, { ...profile, rejected_terms: ["Rust"] }), false);
});

test("an explicit alias rejection overrides automatic and older confirmed knowledge", () => {
  const profile = { automatic_technical_policy: true, established_technologies: ["AWS"],
    confirmed_skills: ["AWS"], rejected_terms: ["Amazon Web Services"] };
  assert.equal(savedEvidenceStatus(profile, "AWS"), "rejected");
  assert.equal(transferableWithoutQuestion("AWS", "DIRECT", profile), false);
});
