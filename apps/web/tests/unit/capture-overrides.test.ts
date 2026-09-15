import assert from "node:assert/strict";
import test from "node:test";
import { applyCaptureOverrides } from "../../src/lib/capture-overrides";
import { parseCapture } from "../../src/lib/job-parser";

const posting = `Example Company
Support Analyst
Long Beach, CA
Full-time
About the job
Help customers investigate application incidents and document resolutions.
Required Qualifications
Experience troubleshooting business software with customers.`;

test("capture corrections preserve the original posting and fingerprint", () => {
  const parsed = parseCapture(posting);
  const corrected = applyCaptureOverrides(parsed, {
    company: "Corrected Company",
    title: "Application Support Analyst",
    location: "Irvine, CA",
    workArrangement: "Hybrid",
  });

  assert.equal(corrected.company, "Corrected Company");
  assert.equal(corrected.title, "Application Support Analyst");
  assert.equal(corrected.location, "Irvine, CA");
  assert.equal(corrected.workArrangement, "Hybrid");
  assert.equal(corrected.cleanDescription, parsed.cleanDescription);
  assert.equal(corrected.rawPasteSha256, parsed.rawPasteSha256);
});

test("blank optional corrections can clear uncertain inferred values", () => {
  const parsed = parseCapture(posting);
  const corrected = applyCaptureOverrides(parsed, {
    location: "",
    employmentType: "",
  });
  assert.equal(corrected.location, null);
  assert.equal(corrected.employmentType, null);
});
