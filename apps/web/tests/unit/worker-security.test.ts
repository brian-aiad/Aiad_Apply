import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  pathIsInside,
  safeArtifactName,
  staleWorkerCutoff,
  workerAuthorized,
  workerLeaseMilliseconds,
} from "../../src/lib/worker-security";

test("worker bearer authentication fails closed and accepts either configured secret", () => {
  const request = new Request("http://localhost/api/worker/claim", {
    headers: { Authorization: "Bearer correct-secret" },
  });
  assert.equal(workerAuthorized(request, {}), false);
  assert.equal(workerAuthorized(request, { WORKER_SECRET: "wrong-secret" }), false);
  assert.equal(workerAuthorized(request, { WORKER_SECRET: "correct-secret" }), true);
  assert.equal(workerAuthorized(request, { CRON_SECRET: "correct-secret" }), true);
});

test("worker lease defaults to thirty minutes and clamps unsafe values", () => {
  assert.equal(workerLeaseMilliseconds({}), 30 * 60 * 1000);
  assert.equal(workerLeaseMilliseconds({ WORKER_LEASE_SECONDS: "1" }), 10 * 60 * 1000);
  assert.equal(
    workerLeaseMilliseconds({ WORKER_LEASE_SECONDS: "999999" }),
    24 * 60 * 60 * 1000,
  );
  assert.equal(
    staleWorkerCutoff(new Date("2026-08-18T12:00:00Z"), {}).toISOString(),
    "2026-08-18T11:30:00.000Z",
  );
});

test("artifact helpers prevent traversal and response-header injection", () => {
  const root = path.resolve("outputs", "run-1");
  assert.equal(pathIsInside(root, path.join(root, "resume.pdf")), true);
  assert.equal(pathIsInside(root, path.resolve(root, "..", "secret.txt")), false);
  assert.equal(safeArtifactName('../bad\r\n"name.pdf'), "bad_name.pdf");
});
