import { config } from 'dotenv';
import { fstatSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApplicationBrowser, sha256 } from './driver.mjs';
import { verificationState, verificationReport } from './verification.mjs';
import { waitForVerificationCode } from './gmail-verification.mjs';
import { ProgressWatch } from './progress-watch.mjs';
import { checkPosting } from './posting-check.mjs';
import { executeFormPlan, routineContactActions } from './form-plan.mjs';
import { decideApplicationStep } from './reasoner.mjs';
import { atomicJson, durableWorkerId, ApplicationJournal, recoverResult } from './journal.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(webRoot, '../..');
config({ path: path.join(webRoot, '.env.local'), quiet: true });
config({ path: path.join(webRoot, '.env'), quiet: true });
const api = process.env.AIADAPPLY_APPLICATION_API_URL || 'http://127.0.0.1:3000';
const runtime = path.join(root, '.runtime');
const lockDescriptor = Number(process.env.AIADAPPLY_APPLICATION_LOCK_FD);
if (!Number.isInteger(lockDescriptor) || lockDescriptor < 3 || fstatSync(lockDescriptor).ino !== statSync(path.join(runtime, 'application-worker.lock')).ino) throw new Error('Start the exclusive application worker with bash scripts/application-worker.sh start.');
const workerId = await durableWorkerId(runtime);
const journal = new ApplicationJournal(runtime, workerId);
const claimFile = path.join(runtime, 'application-pending-claim.json');
const secret = process.env.WORKER_SECRET || process.env.CRON_SECRET;
if (!secret) throw new Error('WORKER_SECRET is required for the local application worker.');
let activeJob = null, pendingResult = null, driver = null, heartbeatLost = false, stopping = false;
let observationJob = null;
let lastVerificationState = null;
async function send(action, detail = {}) {
  const response = await fetch(`${api}/api/worker/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ action, workerId, ...(activeJob ? { attemptId: activeJob.attemptId } : {}), ...detail }), signal: AbortSignal.timeout(45000) });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Application worker update failed.'); error.status = response.status; throw error; }
  return result;
}
const heartbeat = setInterval(() => { void send('heartbeat').then(() => { heartbeatLost = false; }).catch(() => { heartbeatLost = true; }); }, 15000);
const guard = async (action, detail) => {
  if (heartbeatLost || stopping) throw new Error('Worker connection interrupted. No further form actions are authorized.');
  return send(action, detail);
};
async function execute(job) {
  activeJob = job;
  lastVerificationState = null;
  const previousDriver = driver;
  driver = null;
  const directory = path.join(root, '.runtime/application-attempts', job.attemptId);
  // Attempt isolation and content hashes stay internal, never in the employer's filename.
  const name = path.basename(job.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const resumePath = path.join(directory, name);
  let finalResult = null, submissionBoundary = false;
  try {
    await atomicJson(path.join(directory, 'efficiency.json'), { modelCalls: 0, routineFilled: 0 });
    await checkPosting(job);
    if (previousDriver) await previousDriver.context.close().catch(() => {});
    await journal.save(job, 'CLAIMED');
    await unlink(claimFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const bytes = Buffer.from(job.resumeBase64, 'base64');
    if (sha256(bytes) !== job.resumeSha256) throw new Error('Approved resume fingerprint mismatch.');
    await writeFile(resumePath, bytes, { mode: 0o600 });
    const extracted = spawnSync('uv', ['run', 'python', '-c', 'import fitz,sys; d=fitz.open(sys.argv[1]); print("\\n".join(p.get_text() for p in d))', resumePath], { cwd: root, encoding: 'utf8', timeout: 30000 });
    if (extracted.status !== 0 || !extracted.stdout.trim()) throw new Error('Could not read the approved resume for application answers.');
    const setup = JSON.parse(await readFile(path.join(root, '.runtime/application-onboarding.json'), 'utf8').catch(() => '{}'));
    await journal.save(job, 'BROWSER_STARTED');
    driver = await ApplicationBrowser.launch({ job, resumePath, outputDirectory: directory, profileDirectory: path.join(root, '.runtime/application-browser-profile'), checkpoint: detail => guard('checkpoint', detail), beforeSubmit: async detail => {
      if (job.prepareOnly) throw new Error('Preparation-only recheck: final submission is disabled until the missing questions are answered.');
      await journal.save(job, 'SUBMITTING');
      submissionBoundary = true;
      try { return await guard('before_submit', detail); }
      catch (error) {
        if (error.status === 400 || error.status === 401 || error.status === 409) {
          submissionBoundary = false;
          await journal.save(job, 'BROWSER_STARTED');
        }
        throw error;
      }
    } });
    let previousError = '', observationSteps = 0, repeatedError = '', repeats = 0, modelCalls = 0, routineFilled = 0, verificationAttempted = false;
    const saveEfficiency = () => atomicJson(path.join(directory, 'efficiency.json'), { modelCalls, routineFilled });
    const progressWatch = new ProgressWatch();
    for (let step = 1; step <= 35; step++) {
      if (heartbeatLost || stopping) throw new Error('The worker disconnected or was stopped.');
      let snapshot = await driver.snapshot();
      if (driver.submissionStarted) {
        const receipt = await driver.observeReceipt();
        if (receipt) { finalResult = { status: 'SUBMITTED', summary: 'The employer confirmed receipt. The approved resume was verified before submission.', ...receipt }; break; }
        const verification = verificationState(driver.lastSnapshot);
        if (verification === 'rejected' || verification === 'expired') {
          const report = verificationReport(verification);
          driver.unresolved = report.unresolved;
          finalResult = { status: 'UNKNOWN', ...report };
          break;
        }
        if (verification === 'required') {
          if (verificationAttempted) {
            const report = verificationReport('required');
            finalResult = { status: 'UNKNOWN', summary: 'The employer still requires email verification after one code attempt. No second code was tried and submission is not confirmed.', unresolved: report.unresolved };
            break;
          }
          verificationAttempted = true;
          try {
            const recipient = driver.verificationRecipient(job.profile.email);
            const requestedAt = Date.now();
            let code = await waitForVerificationCode({
              company: job.company,
              recipient,
              requestedAt,
              credentialsPath: path.join(runtime, 'application-gmail-oauth.json'),
            });
            await guard('before_verification', {});
            await driver.completeVerification(code);
            code = '';
            const afterVerification = verificationState(driver.lastSnapshot);
            if (afterVerification === 'rejected' || afterVerification === 'expired') {
              finalResult = { status: 'UNKNOWN', ...verificationReport(afterVerification) };
              break;
            }
            if (afterVerification === 'required') {
              const report = verificationReport('required');
              finalResult = { status: 'UNKNOWN', summary: 'The employer did not accept the single newest matching email code. No other or older code was tried; submission is not confirmed.', unresolved: report.unresolved };
              break;
            }
            observationSteps = 0;
          } catch (error) {
            const report = verificationReport('required');
            finalResult = { status: 'UNKNOWN', summary: `Email verification could not be completed: ${String(error.message).slice(0, 1500)} Submission is not confirmed.`, unresolved: report.unresolved };
            break;
          }
          continue;
        }
        if (verificationAttempted) {
          if (++observationSteps >= 30) {
            finalResult = { status: 'UNKNOWN', summary: 'The newest matching email code was entered in the existing application tab, but no explicit employer confirmation appeared. Do not retry this application.', unresolved: ['Check the employer application page for a receipt or a new verification error before taking further action.'] };
            break;
          }
        } else if (++observationSteps >= 3) {
          finalResult = { status: 'UNKNOWN', summary: 'No employer confirmation appeared after submission. Do not retry before checking the employer site.', unresolved: driver.unresolved };
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      if (!previousError) {
        const routine = routineContactActions(snapshot, job.profile);
        if (routine.length) {
          try { await executeFormPlan(driver, routine); routineFilled += routine.length; }
          catch (error) { previousError = error.message; }
          await saveEfficiency();
          snapshot = await driver.snapshot();
        }
      }
      const stalled = progressWatch.observe(snapshot);
      if (stalled >= 7 && !driver.submissionStarted) throw new Error('Automation could not commit a form answer after multiple recovery steps. Technical form-control issue; no new candidate fact is required.');
      if (stalled >= 3) previousError = `RECOVERY REQUIRED: ${stalled} steps without a committed answer or page change. Do not repeat the same open/close action. Use choose on an already open combobox or click its visible exact option. Searchable comboboxes can use choose with the confirmed exact answer. If a control is optional, leave it blank and complete remaining required fields. Earlier error: ${previousError}`;
      modelCalls++;
      await saveEfficiency();
      const decision = await decideApplicationStep({ job: { company: job.company, title: job.title, destination: job.destination, posting: job.posting, prepareOnly: job.prepareOnly === true }, profile: job.profile, setup, applicationAnswers: job.confirmedAnswers || [], applicationHistory: job.applicationHistory || [], approvedResumeText: extracted.stdout, snapshot, previousError, answeredQuestions: driver.questions }, directory, step);
      driver.unresolved = decision.unresolved;
      if (decision.outcome === 'confirmation') {
        const receipt = await driver.receipt(decision.confirmationText);
        if (!receipt) throw new Error('The browser did not show a verifiable new submission receipt.');
        finalResult = { status: 'SUBMITTED', summary: 'The employer confirmed receipt of this application. The approved job-specific resume was verified before submission.', ...receipt };
        break;
      }
      if (decision.outcome === 'blocked') {
        finalResult = { status: driver.submissionStarted ? 'UNKNOWN' : 'BLOCKED', summary: decision.summary };
        break;
      }
      if (driver.submissionStarted) continue;
      if (!Array.isArray(decision.actions) || !decision.actions.length || decision.actions.length > 100) throw new Error('No supported next action was available.');
      previousError = '';
      try { await executeFormPlan(driver, decision.actions); }
      catch (error) { previousError = error.message; }
      if (previousError) {
        repeats = previousError === repeatedError ? repeats + 1 : 1;
        repeatedError = previousError;
        if (repeats >= 3) throw new Error(`The form needs attention: ${previousError}`);
      } else { repeats = 0; repeatedError = ''; }
      await writeFile(path.join(directory, 'progress.json'), JSON.stringify({ questions: driver.questions, unresolved: driver.unresolved, previousError }, null, 2), { mode: 0o600 });
      if (!driver.submissionStarted) await guard('checkpoint', { summary: decision.summary, questions: driver.questions, unresolved: driver.unresolved });
    }
    if (!finalResult) throw new Error('The form exceeded the supported number of steps. Stopped without an automatic retry.');
  } catch (error) {
    finalResult = { status: submissionBoundary || driver?.submissionStarted ? 'UNKNOWN' : 'BLOCKED', summary: String(error.message).slice(0, 4000) };
  }
  finalResult.questions = driver?.questions || [];
  finalResult.unresolved = driver?.unresolved || [];
  pendingResult = finalResult;
  try { await journal.save(job, 'RESULT', finalResult); }
  catch { console.error('Terminal journal write failed; retaining the result in memory and attempting the bound result copy.'); }
  if (driver && !finalResult.screenshot) {
    const screenshot = path.join(directory, 'last-page.png');
    await driver.page.screenshot({ path: screenshot, fullPage: true, timeout: 10000 }).then(() => { finalResult.screenshot = screenshot; }).catch(() => {});
  }
  try { await atomicJson(path.join(directory, 'result.json'), { ...finalResult, resumeIdentity: { attemptId: job.attemptId, runId: job.runId, resumeSha256: job.resumeSha256, destination: job.destination } }); }
  catch { console.error('Could not save the result copy; preserving it in memory for server reporting.'); }
  await publishResult(job, finalResult);
}
async function publishResult(job, result) {
  activeJob = job; pendingResult = result;
  try { await journal.save(job, 'RESULT', result); }
  catch { console.error('Local result journal unavailable; attempting server report without repeating browser work.'); }
  try { await send('finish', result); }
  catch (error) {
    if (!(error.status === 409 && /no longer authorized|ownership changed|already has a final result/.test(error.message))) throw error;
    console.error('Saved browser result belongs to a canceled or already finalized attempt; no browser action was repeated.');
  }
  await journal.save(job, 'PUBLISHED', result);
  console.log(`Application ${job.applicationId}: ${result.status}`);
  if (result.status === 'UNKNOWN' && driver?.submissionStarted && driver.job.attemptId === job.attemptId) observationJob = job;
  else if (observationJob?.attemptId === job.attemptId) observationJob = null;
  activeJob = null; pendingResult = null; heartbeatLost = false;
}
async function observeUnconfirmedApplication() {
  if (!observationJob) return;
  if (!driver || driver.page.isClosed()) { observationJob = null; return; }
  // The user can finish an email/login verification in the existing browser.
  // Observation is read-only: never repeat a submit click or recreate the form.
  const receipt = await driver.observeReceipt();
  if (!receipt) {
    const verification = verificationState(driver.lastSnapshot);
    if (verification && verification !== lastVerificationState) {
      await send('verification', { attemptId: observationJob.attemptId, verification });
      lastVerificationState = verification;
    }
    return;
  }
  const result = { status: 'SUBMITTED', summary: 'The employer confirmed receipt while observing the submitted application. The approved resume was verified before submission.', ...receipt, questions: driver.questions, unresolved: [] };
  await publishResult(observationJob, result);
}
async function recoverPending() {
  for (const entry of await journal.pending()) {
    await publishResult(entry.job, await recoverResult(entry, runtime));
  }
}
async function claimNext() {
  let pending;
  try { pending = JSON.parse(await readFile(claimFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!pending) {
    pending = { workerId, claimToken: randomUUID() };
    await atomicJson(claimFile, pending);
  }
  if (pending.workerId !== workerId) throw new Error('A pending claim belongs to another worker identity. Resolve it before claiming new work.');
  const job = await send('claim', { claimToken: pending.claimToken });
  if (!job) await unlink(claimFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
  return job;
}
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
console.log('Application browser worker started; waiting for explicit resume approvals.');
try {
  let recovered = false;
  while (!stopping) {
    try {
      if (pendingResult && activeJob) await publishResult(activeJob, pendingResult);
      if (!recovered) { await recoverPending(); recovered = true; }
      if (observationJob) await observeUnconfirmedApplication();
      else {
        const job = await claimNext();
        if (job) await execute(job);
      }
    } catch (error) {
      console.error(`Application worker paused: ${error.message}`);
      // Keep pending results for idempotent report-only retries. Never reread a
      // nonexistent result file or relaunch an interrupted browser submission.
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
} finally {
  clearInterval(heartbeat);
  if (driver) await driver.context.close().catch(() => {});
}
