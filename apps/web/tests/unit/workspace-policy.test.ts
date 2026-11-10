import test from "node:test";
import assert from "node:assert/strict";
import { captureSource } from "../../src/lib/job-source";
import { portableSettingKey, restoredEvent } from "../../src/lib/workspace-backup";
import { readApplicationProfile } from "../../src/lib/application-profile";
import { mergeReusableAnswers, reusableQuestion } from "../../src/lib/reusable-answers";
import { rankLinkedIn } from "../../src/lib/discovery/linkedin-policy";
import { compareLinkedInFit } from "../../src/lib/discovery/view-state";
import { verifiedBase } from "../../src/lib/workspace-material";
import { createHash } from "node:crypto";

test("paste source identifies actual employer boards without trusting lookalike domains", () => {
  assert.equal(captureSource("https://job-boards.greenhouse.io/example/jobs/1"), "greenhouse");
  assert.equal(captureSource("https://careers.example.com/jobs/1"), "employer");
  assert.equal(captureSource("https://linkedin.com.evil.test/job"), "employer");
  assert.equal(captureSource(null), "paste");
});
test("damaged profile fields do not erase valid contact facts", () => {
  const p = readApplicationProfile({ firstName: "Fixture", phone: "555", email: "invalid", linkedin: "bad" });
  assert.equal(p.firstName, "Fixture"); assert.equal(p.phone, "555"); assert.equal(p.email, "");
});
test("backup contains policies and candidate sources but never runtime leases or secrets", () => {
  for (const key of ["application-policy", "workspace:candidate-profile", "workspace:base-resume", "workspace:onboarding", "discovery:linkedin:job:123", "application:reusable-answers"]) assert.equal(portableSettingKey(key), true);
  for (const key of ["WORKER_SECRET", "worker:heartbeat:123", "application-browser:heartbeat", "discovery:linkedin:state"]) assert.equal(portableSettingKey(key), false);
  assert.equal(restoredEvent({ eventType: "application_automation", detail: { status: "SUBMITTING" } }).toValue, "UNKNOWN");
  assert.equal(restoredEvent({ eventType: "application_automation", detail: { status: "QUEUED" } }).toValue, "BLOCKED");
});
test("global answer promotion rejects consent, codes, salary and contradictory saved facts", () => {
  assert.equal(reusableQuestion("Are you a US citizen?"), true);
  for (const q of ["Consent to background screening?", "What salary do you expect?", "What is the verification code?", "Have you previously applied to this employer?"]) assert.equal(reusableQuestion(q), false);
  assert.throws(() => mergeReusableAnswers([{question:"Are you a US citizen?",answer:"Yes"}], [{question:"Are you a US citizen?",answer:"No"}]), /conflict|different/i);
});
test("queue and list agree: exact fit first, Premium resolves equal scores", () => {
  const a = { qualified: true, score: 89, postedAt: null, linkedin: { premiumSignal: "NONE" } };
  const b = { qualified: true, score: 81, postedAt: null, linkedin: { premiumSignal: "TOP_APPLICANT" } };
  assert.ok(rankLinkedIn(a,b) < 0); assert.ok(compareLinkedInFit(a,b) < 0);
  assert.ok(rankLinkedIn({...a,score:81},b) > 0); assert.ok(compareLinkedInFit({...a,score:81},b) > 0);
});
test("shared source never accepts missing, corrupt or mismatched base bytes", () => {
  const bytes = Buffer.from("fixture-docx");
  const v = { contentBase64:bytes.toString("base64"), byteSize:bytes.length, sha256:createHash("sha256").update(bytes).digest("hex") };
  assert.ok(verifiedBase(v)); assert.equal(verifiedBase({...v,byteSize:1}), null); assert.equal(verifiedBase({...v,sha256:"0".repeat(64)}), null);
});
