import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewGuide, hasValidatedResume, isRunActive } from "../../src/lib/application-review";
import { buildTechnologyReview } from "../../src/lib/technology-review";

const run = { status: "SUCCEEDED", validationPassed: true, riskCount: 0, artifacts: [{ kind: "DOCX" }] };
const options = { run, technology: buildTechnologyReview(null), historical: false, applicationStatus: "REVIEW", hasPreviousResume: false };

test("a historical version remains reviewable while the application is tailoring", () => {
  const guide = buildReviewGuide({ ...options, historical: true, applicationStatus: "TAILORING" });
  assert.equal(guide.headline, "Review this saved version");
  assert.equal(isRunActive(run), false);
  assert.equal(isRunActive({ status: "RUNNING" }), true);
});

test("queued and running versions describe their own progress", () => {
  assert.match(buildReviewGuide({ ...options, run: { ...run, status: "QUEUED" } }).headline, /queued/);
  const guide = buildReviewGuide({ ...options, run: { ...run, status: "RUNNING" }, progressStage: "Checking layout" });
  assert.equal(guide.copy, "Checking layout");
  assert.equal(guide.tone, "neutral");
});

test("missing technology placements cannot appear ready even with zero claim flags", () => {
  const technology = buildTechnologyReview({ tailoring_mode: "aggressive_draft", keyword_coverage: [{ term: "AWS S3", accepted: true, status: "missing_draft", placements: ["skills.tools"] }] });
  const guide = buildReviewGuide({ ...options, technology, applicationStatus: "READY" });
  assert.equal(guide.headline, "Edit missing technology placements");
  assert.equal(guide.tone, "warning");
});

test("legacy omission warnings and failed validation override a ready status", () => {
  const technology = buildTechnologyReview({ validation: { issues: [{ code: "draft_technology_unplaced", message: "Missing Python" }] } });
  assert.equal(buildReviewGuide({ ...options, technology }).tone, "warning");
  assert.match(buildReviewGuide({ ...options, run: { ...run, validationPassed: false }, applicationStatus: "READY" }).headline, /validation/);
});

test("draft assumptions still require review when no model risk flags were stored", () => {
  const technology = buildTechnologyReview({ tailoring_mode: "aggressive_draft" });
  assert.equal(buildReviewGuide({ ...options, technology }).tone, "warning");
  assert.equal(buildReviewGuide({ ...options, technology, historical: true }).headline, "Review this saved draft");
});

test("application progress describes the current version, never a historical version", () => {
  const technology = buildTechnologyReview({ tailoring_mode: "aggressive_draft" });
  assert.equal(buildReviewGuide({ ...options, technology, applicationStatus: "APPLIED" }).headline, "Application submitted");
  assert.equal(buildReviewGuide({ ...options, technology, applicationStatus: "APPLIED", historical: true }).headline, "Review this saved draft");
  assert.notEqual(buildReviewGuide({ ...options, applicationStatus: "READY", historical: true }).tone, "success");
});

test("validated files require success, validation and a resume artifact", () => {
  assert.equal(hasValidatedResume(run), true);
  for (const candidate of [{ ...run, status: "FAILED" }, { ...run, validationPassed: null }, { ...run, artifacts: [{ kind: "REPORT_JSON" }] }]) {
    assert.equal(hasValidatedResume(candidate), false);
    assert.notEqual(buildReviewGuide({ ...options, run: candidate, applicationStatus: "READY" }).tone, "success");
  }
});

test("empty and failed runs provide actionable guidance without a success icon", () => {
  assert.equal(buildReviewGuide({ ...options, run: undefined }).tone, "neutral");
  const failed = { ...run, status: "FAILED", errorMessage: "Layout failed" };
  assert.equal(buildReviewGuide({ ...options, run: failed }).copy, "Layout failed");
  assert.match(buildReviewGuide({ ...options, run: failed, hasPreviousResume: true }).copy, /validated version remains available/);
});
