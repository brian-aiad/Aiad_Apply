import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApplicationJournal, durableWorkerId, atomicJson, interruptedResult, recoverResult } from '../../scripts/application-browser/journal.mjs';
import { classifyReasonerFailure, validateDecision } from '../../scripts/application-browser/reasoner.mjs';

test('worker identity and confirmed receipt survive restart without browser replay', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'application-journal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workerId = await durableWorkerId(directory);
  assert.equal(await durableWorkerId(directory), workerId);
  const journal = new ApplicationJournal(directory, workerId);
  const job = { attemptId: randomUUID(), resumeSha256: 'a'.repeat(64), runId: randomUUID(), destination: 'https://example.com/jobs/123' };
  const receipt = { status: 'SUBMITTED', confirmation: 'Application received', screenshot: '/private/receipt.png', confirmationUrl: 'https://example.com/jobs/123/thanks' };
  await journal.save(job, 'SUBMITTING');
  const interrupted = (await new ApplicationJournal(directory, workerId).pending())[0];
  assert.equal(interruptedResult(interrupted).status, 'UNKNOWN');
  await journal.save(job, 'RESULT', receipt);
  const recovered = (await new ApplicationJournal(directory, workerId).pending())[0];
  assert.deepEqual(interruptedResult(recovered), receipt);
  assert.equal(recovered.job.resumeSha256, job.resumeSha256);
  await journal.save(job, 'PUBLISHED', receipt);
  assert.deepEqual(await journal.pending(), []);
});
test('atomic claims preserve replay token and filesystem errors fail before browser work', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'application-claim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const claim = { workerId: `browser-${randomUUID()}`, claimToken: randomUUID() };
  const file = path.join(directory, 'claim.json');
  await atomicJson(file, claim);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), claim);
  const blockedDirectory = path.join(directory, 'not-a-directory');
  await writeFile(blockedDirectory, 'file');
  await assert.rejects(atomicJson(path.join(blockedDirectory, 'result.json'), { status: 'BLOCKED' }));
  assert.equal(interruptedResult({ phase: 'BROWSER_STARTED' }).status, 'BLOCKED');
  assert.equal(interruptedResult({ phase: 'CLAIMED' }).status, 'BLOCKED');
});
test('diagnostics distinguish script, missing executable, authentication, timeout and limits', () => {
  assert.equal(classifyReasonerFailure({ code: 1, stderr: 'error: unexpected argument --bad-option' }).kind, 'script_or_schema');
  assert.equal(classifyReasonerFailure({ errorCode: 'ENOENT' }).kind, 'missing_executable');
  assert.equal(classifyReasonerFailure({ code: 1, stderr: '401 unauthorized' }).kind, 'authentication');
  assert.equal(classifyReasonerFailure({ timedOut: true }).kind, 'timeout');
  assert.equal(classifyReasonerFailure({ code: 1, stderr: 'You have hit your usage limit.' }).kind, 'usage_limit');
  assert.throws(() => validateDecision({ outcome: 'continue', actions: [{ kind: 'run_arbitrary_script' }] }), /Invalid/);
});

test('bound result copy recovers a receipt only for the identical approved attempt', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'application-copy-'));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const job = { attemptId: randomUUID(), runId: randomUUID(), resumeSha256: 'b'.repeat(64), destination: 'https://example.com/job' };
  const entry = { job, phase: 'SUBMITTING' };
  const receipt = { status: 'SUBMITTED', confirmation: 'Application received' };
  const file = path.join(runtime, 'application-attempts', job.attemptId, 'result.json');
  await atomicJson(file, { ...receipt, resumeIdentity: job });
  assert.deepEqual(await recoverResult(entry, runtime), receipt);
  await atomicJson(file, { ...receipt, resumeIdentity: { ...job, resumeSha256: 'c'.repeat(64) } });
  assert.equal((await recoverResult(entry, runtime)).status, 'UNKNOWN');
});
test('oversized model decisions stop before actions rather than poisoning result reporting', () => {
  const valid = { outcome: 'continue', summary: 'Ready', confirmationText: '', actions: [], unresolved: [] };
  assert.equal(validateDecision(valid), valid);
  assert.throws(() => validateDecision({ ...valid, unresolved: Array(101).fill('Unknown') }), /Invalid/);
  assert.throws(() => validateDecision({ ...valid, confirmationText: 'x'.repeat(4001) }), /Invalid/);
  const action = { kind: 'fill', ref: 'a1', value: 'test', source: 'saved_profile', explanation: 'Known' };
  assert.throws(() => validateDecision({ ...valid, actions: [{ ...action, value: 'x'.repeat(12001) }] }), /Invalid/);
  assert.throws(() => validateDecision({ ...valid, actions: [{ ...action, explanation: 'x'.repeat(4001) }] }), /Invalid/);
});
