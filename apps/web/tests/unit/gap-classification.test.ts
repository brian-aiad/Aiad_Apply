import assert from "node:assert/strict";
import test from "node:test";
import { isEligibilityConstraint } from "../../src/lib/gap-classification";

test("separates legal, clearance, and degree constraints from buildable skills", () => {
  for (const term of [
    "U.S. citizenship",
    "U.S. Person",
    "active Secret clearance",
    "work authorization",
    "Bachelor's degree",
  ]) {
    assert.equal(isEligibilityConstraint(term), true, term);
  }
});

test("keeps tools, methods, and technical domains in the skill-gap queue", () => {
  for (const term of ["CATIA V5", "root cause analysis", "composite fabrication", "SaaS"] ) {
    assert.equal(isEligibilityConstraint(term), false, term);
  }
});
