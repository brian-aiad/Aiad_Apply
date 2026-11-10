import assert from "node:assert/strict";
import test from "node:test";
import { approvalMatches, attemptInterrupted, browserWorkerOnline, canApproveAfter, readAttempt, attemptWithReceipt } from "../../src/lib/application-automation";
const attempt = { status: "QUEUED", runId: "a1111111-1111-4111-8111-111111111111", runNumber: 1, artifactId: "b1111111-1111-4111-8111-111111111111", resumeSha256: "a".repeat(64), fileName: "resume.pdf", destination: "https://example.com/job/1", approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary: "Waiting", questions: [], unresolved: [], attachmentVerified: false };
test("recorded receipts resolve only the exact parked attempt without inventing browser evidence", () => {
  const receipt = { runId: attempt.runId, resumeSha256: attempt.resumeSha256, destination: attempt.destination, confirmation: "Employer receipt" };
  for (const status of ["BLOCKED", "UNKNOWN"]) {
    const parked = readAttempt({ ...attempt, status, unresolved: ["Old blocker"] })!;
    const resolved = attemptWithReceipt(parked, receipt)!;
    assert.equal(resolved.status, "SUBMITTED");
    assert.deepEqual(resolved.unresolved, []);
    assert.equal(resolved.attachmentVerified, false);
    assert.equal(resolved.submissionStartedAt, undefined);
    for (const changed of [{ runId: "other" }, { resumeSha256: "b".repeat(64) }, { destination: "https://example.com/job/2" }, { confirmation: " " }]) {
      assert.equal(attemptWithReceipt(parked, { ...receipt, ...changed }), null);
    }
  }
  for (const status of ["QUEUED", "RUNNING", "SUBMITTING", "CANCELED", "SUBMITTED"]) assert.equal(attemptWithReceipt(readAttempt({ ...attempt, status }), receipt), null);
});
test("approval binds the run, artifact, content and exact application destination", () => {
  const parsed = readAttempt(attempt)!;
  assert.ok(approvalMatches(parsed, attempt.runId, attempt.artifactId, attempt.resumeSha256, attempt.destination));
  for (const changed of [{ runId: "other" }, { artifactId: "other" }, { resumeSha256: "b".repeat(64) }, { destination: "https://example.com/job/2" }]) {
    const next = { ...attempt, ...changed };
    assert.equal(approvalMatches(parsed, next.runId, next.artifactId, next.resumeSha256, next.destination), false);
  }
});
test("uncertain or completed submissions cannot be automatically reapproved", () => {
  for (const status of ["QUEUED", "RUNNING", "SUBMITTING", "SUBMITTED", "UNKNOWN"]) assert.equal(canApproveAfter(readAttempt({ ...attempt, status })), false);
  for (const status of ["BLOCKED", "CANCELED"]) assert.equal(canApproveAfter(readAttempt({ ...attempt, status })), true);
  assert.ok(canApproveAfter(null));
  assert.equal(browserWorkerOnline({ at: new Date(Date.now() - 60000).toISOString() }), false);
  assert.equal(browserWorkerOnline({ at: new Date().toISOString() }), true);
});

test("worker timestamps cannot report a future heartbeat as online", () => {
  assert.equal(browserWorkerOnline({ at: new Date(Date.now() + 60000).toISOString() }), false);
  assert.equal(browserWorkerOnline({ at: 'invalid' }), false);
});

test("only stale browser activity is interrupted, never an unstarted queue or terminal receipt", () => {
  const now = Date.now();
  const stale = { ...attempt, updatedAt: new Date(now - 121000).toISOString() };
  for (const status of ["RUNNING", "SUBMITTING"]) assert.equal(attemptInterrupted(readAttempt({ ...stale, status }), now), true);
  for (const status of ["QUEUED", "SUBMITTED", "BLOCKED", "UNKNOWN"]) assert.equal(attemptInterrupted(readAttempt({ ...stale, status }), now), false);
  assert.equal(attemptInterrupted(readAttempt({ ...attempt, status: "RUNNING", updatedAt: new Date(now).toISOString() }), now), false);
});

test('technical dropdown diagnostics do not request new candidate facts', async () => {
  const { isTechnicalApplicationBlocker } = await import('../../src/lib/application-automation');
  assert.equal(isTechnicalApplicationBlocker('Required ITAR status selection needs exact option wording.'), true);
  assert.equal(isTechnicalApplicationBlocker('What is your citizenship status for ITAR?'), false);
  assert.equal(isTechnicalApplicationBlocker('Will you require sponsorship?'), false);
});
