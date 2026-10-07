import assert from "node:assert/strict";
import test from "node:test";
import { buildTechnologyReview } from "../../src/lib/technology-review";

const project = "projects.loavenly.bullet.3";
const employer = "experience.original_insurance.bullet.3";

test("known everyday tools available for useful edits are not mandatory export gaps", () => {
  const review = buildTechnologyReview({
    tailoring_mode: "evidence_based",
    keyword_coverage: [{ term: "Excel", accepted: true, status: "available",
      eligible_bullet_ids: [employer], required_bullet_groups: [], placements: [] }],
  });
  assert.equal(review.hasOmissions, false);
  assert.deepEqual(review.missingSupportedTerms, []);
  assert.deepEqual(review.draftTerms, []);
});

const report = {
  tailoring_mode: "aggressive_draft",
  draft_technologies: [
    { term: "Python", required: true, paragraph_ids: [project] },
    { term: "AWS S3", required: true, paragraph_ids: [project] },
    { term: "AWS", required: false, paragraph_ids: [project] },
  ],
  keyword_coverage: [
    { term: "Python", accepted: true, status: "draft_assumption", placements: [employer, project] },
    { term: "AWS S3", accepted: true, status: "missing_draft", placements: ["skills.tools"] },
    { term: "AWS", accepted: true, status: "missing_draft", placements: [] },
  ],
  changes: [{ paragraph_id: project, final_text: "Validated reporting records with Python.", proposed_text: "Stored Python results in AWS S3." }],
};

test("review uses final project placements and wording, never Skills or proposed text", () => {
  const review = buildTechnologyReview(report);
  assert.equal(review.requiredTotal, 2);
  assert.equal(review.requiredPlaced, 1);
  assert.deepEqual(review.missingProjectTerms, ["AWS S3"]);
  assert.deepEqual(review.draftTerms, ["Python"]);
  assert.deepEqual(review.paragraphs, [{ paragraphId: project, finalText: "Validated reporting records with Python.", terms: ["Python"] }]);
});

test("a removed project term cannot keep its draft placement from an employer mention", () => {
  const review = buildTechnologyReview({ ...report, keyword_coverage: report.keyword_coverage.map(row => row.term === "Python" ? { ...row, placements: [employer], status: "covered" } : row) });
  assert.equal(review.requiredPlaced, 0);
  assert.deepEqual(review.draftTerms, []);
  assert.deepEqual(review.missingProjectTerms, ["Python", "AWS S3"]);
  assert.deepEqual(review.paragraphs, []);
});

test("a missing employer placement does not hide the unverified project assumption", () => {
  const review = buildTechnologyReview({ ...report, keyword_coverage: report.keyword_coverage.map(row => row.term === "Python" ? { ...row, placements: [project], status: "missing_supported" } : row) });
  assert.deepEqual(review.missingSupportedTerms, ["Python"]);
  assert.deepEqual(review.draftTerms, ["Python"]);
  assert.equal(review.requiredPlaced, 1);
});

test("legacy reports retain final text fallback without inventing coverage totals", () => {
  const review = buildTechnologyReview({ tailoring_mode: "aggressive_draft", keyword_coverage: [{ term: "Python", status: "draft_assumption", placements: [employer, project] }] }, [{ paragraphId: project, finalText: "Final saved project text." }]);
  assert.equal(review.requiredTotal, null);
  assert.equal(review.requiredPlaced, null);
  assert.deepEqual(review.paragraphs, [{ paragraphId: project, finalText: "Final saved project text.", terms: ["Python"] }]);
  assert.deepEqual(review.draftTerms, ["Python"]);
});

test("missing and malformed metadata never implies complete coverage", () => {
  for (const snapshot of [null, [], { draft_technologies: report.draft_technologies }, { keyword_coverage: [null, "bad", {}] }]) {
    const review = buildTechnologyReview(snapshot);
    assert.equal(review.requiredTotal, null);
    assert.equal(review.requiredPlaced, null);
    assert.deepEqual(review.paragraphs, []);
  }
});

test("omission warnings survive old reports with no technology rows", () => {
  const review = buildTechnologyReview({ tailoring_mode: "aggressive_draft", validation: { issues: [{ code: "draft_technology_unplaced", message: "Add AWS S3 before applying." }] } });
  assert.deepEqual(review.omissionWarnings, ["Add AWS S3 before applying."]);
  assert.equal(review.requiredTotal, null);
});

test("rejected technologies and optional umbrella omissions do not count as required gaps", () => {
  const review = buildTechnologyReview({ ...report, keyword_coverage: report.keyword_coverage.map(row => row.term === "AWS S3" ? { ...row, accepted: false, status: "excluded" } : row) });
  assert.deepEqual(review.missingProjectTerms, []);
  assert.equal(review.requiredTotal, 1);
  assert.equal(review.requiredPlaced, 1);
  assert.ok(!review.draftTerms.includes("AWS S3"));
});
