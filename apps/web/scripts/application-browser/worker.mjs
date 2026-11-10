import { loadCoverLetter } from './supplemental-document.mjs';
import { AccessPages } from './access-pages.mjs';
import { QueuePolling } from './worker-polling.mjs';
import { applicableMethodHints, withoutFailedMethods } from './portal-methods.mjs';
import { config } from 'dotenv';
import { ReceiptObservers } from './receipt-observers.mjs';
import {stepDisposition} from './step-disposition.mjs';
import { fstatSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApplicationBrowser, sha256 } from './driver.mjs';
import { verificationState, verificationReport } from './verification.mjs';
import { waitForVerificationCode } from './gmail-verification.mjs';
import { finishBrowserResult } from './final-result.mjs';
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
if (process.platform === 'win32') {
  const proof = JSON.parse(await readFile(path.join(runtime, 'application-launch.json'), 'utf8'));
  if (proof.pid !== process.ppid || proof.pid !== Number(process.env.AIADAPPLY_APPLICATION_PARENT_PID) || !proof.token || proof.token !== process.env.AIADAPPLY_APPLICATION_LOCK_TOKEN) throw new Error('Start the locked worker with scripts/application-worker.ps1 start.');
} else if (!Number.isInteger(lockDescriptor) || lockDescriptor < 3 || fstatSync(lockDescriptor).ino !== statSync(path.join(runtime, 'application-worker.lock')).ino) throw new Error('Start the exclusive application worker with bash scripts/application-worker.sh start.');
const workerId = await durableWorkerId(runtime);
const journal = new ApplicationJournal(runtime, workerId);
const claimFile = path.join(runtime, 'application-pending-claim.json');
const secret = process.env.WORKER_SECRET || process.env.CRON_SECRET;
if (!secret) throw new Error('WORKER_SECRET is required for the local application worker.');
let activeJob = null, pendingResult = null, driver = null, heartbeatLost = false, stopping = false;
const receiptObservers = new ReceiptObservers();
const accessPages = new AccessPages();
let browserContext = null;
if (process.platform === 'win32') {
  process.stdin.resume();
  process.stdin.on('end', () => { stopping = true; void browserContext?.close().finally(() => process.exit(1)); if (!browserContext) process.exit(1); });
}
async function send(action, detail = {}) {
  const response = await fetch(`${api}/api/worker/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ action, workerId, platform: process.platform, ...(activeJob ? { attemptId: activeJob.attemptId } : {}), ...detail }), signal: AbortSignal.timeout(45000) });
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
    if (previousDriver && !receiptObservers.entries.has(previousDriver.job.attemptId) && !accessPages.has(previousDriver)) { previousDriver.detach?.(); await previousDriver.page.close().catch(() => {}); }
    await journal.save(job, 'CLAIMED');
    await unlink(claimFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const bytes = Buffer.from(job.resumeBase64, 'base64');
    if (sha256(bytes) !== job.resumeSha256) throw new Error('Approved resume fingerprint mismatch.');
    await writeFile(resumePath, bytes, { mode: 0o600 });
    job.coverLetter = await loadCoverLetter(root, job);
    const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const extracted = spawnSync(python, ['-X', 'utf8', '-c', 'import fitz,sys; d=fitz.open(sys.argv[1]); print("\\n".join(p.get_text() for p in d))', resumePath], { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    if (extracted.status !== 0 || !extracted.stdout.trim()) throw new Error('Could not read the approved resume for application answers.');
    const setup = job.onboarding || JSON.parse(await readFile(path.join(root, '.runtime/application-onboarding.json'), 'utf8').catch(() => '{}'));
    const reusableAnswers = job.reusableAnswers || [];
    let portalMethods = [];
    const syncMethods = async observations => {
      try {
        const response = await fetch(`${api}/api/worker/application-methods`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({workerId,attemptId:job.attemptId,claimToken:job.claimToken,...(observations ? {observations} : {})}),signal:AbortSignal.timeout(5000)});
        if (response.ok) { portalMethods = (await response.json()).records || []; return true; }
      } catch { /* Optional method learning never blocks an application. */ }
      return false;
    };
    await syncMethods();
    const pendingMethods = [];
    const learnMethod = observation => {
      portalMethods = withoutFailedMethods(portalMethods,observation);
      pendingMethods.push(observation);
    };
    const flushMethods = async () => {
      if (!pendingMethods.length) return;
      const batch = pendingMethods.splice(0,20);
      if (!await syncMethods(batch)) pendingMethods.unshift(...batch.filter(item=>item.failed).slice(-20));
      // A concurrent refresh must not restore an invalidation awaiting delivery.
      for (const item of pendingMethods) portalMethods = withoutFailedMethods(portalMethods,item);
    };
    await journal.save(job, 'BROWSER_STARTED');
    driver = await ApplicationBrowser.launch({ existingContext: browserContext, existingPage: accessPages.take(job, browserContext), job, resumePath, outputDirectory: directory, profileDirectory: path.join(root, '.runtime/application-browser-profile'), checkpoint: detail => guard('checkpoint', detail), beforeSubmit: async detail => {
      if (job.prepareOnly) throw new Error('Preparation-only recheck: final submission is disabled until the missing questions are answered.');
      await flushMethods();
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
    browserContext = driver.context;
    let previousError = '', observationSteps = 0, repeatedError = '', repeats = 0, modelCalls = 0, routineFilled = 0, verificationAttempted = false;
    const saveEfficiency = () => atomicJson(path.join(directory, 'efficiency.json'), { modelCalls, routineFilled });
    const completeEmailVerification = async () => {
      const recipient = driver.verificationRecipient(job.profile.email);
      const requestedAt = driver.lastRequestAt || Date.parse(job.browserStartedAt || job.approvedAt);
      let code = await waitForVerificationCode({
        company: job.company,
        recipient,
        requestedAt,
        credentialsPath: path.join(runtime, 'application-gmail-oauth.json'),
        browserContext: driver.context,
      });
      try {
        if (driver.submissionStarted) await guard('before_verification', {});
        else await guard('checkpoint', { summary: 'Completing employer email verification', questions: driver.questions, unresolved: driver.unresolved });
        await driver.completeVerification(code);
      } finally {
        code = '';
      }
      return verificationState(driver.lastSnapshot);
    };
    let liveEligibilityVerified = job.authorizationMode !== "automatic";
    const progressWatch = new ProgressWatch();
    for (let step = 1; step <= 35; step++) {
      if (heartbeatLost || stopping) throw new Error('The worker disconnected or was stopped.');
      let snapshot = await driver.snapshot();
      if (!driver.submissionStarted) {
        const preSubmitVerification = verificationState(snapshot);
        if (preSubmitVerification === 'rejected' || preSubmitVerification === 'expired') {
          finalResult = { status: 'BLOCKED', ...verificationReport(preSubmitVerification) };
          break;
        }
        if (preSubmitVerification === 'required') {
          if (verificationAttempted) {
            const report = verificationReport('required');
            finalResult = { status: 'BLOCKED', summary: 'The employer still requires email verification after one code attempt. No second code was tried.', unresolved: report.unresolved };
            break;
          }
          verificationAttempted = true;
          try {
            const afterVerification = await completeEmailVerification();
            if (afterVerification === 'rejected' || afterVerification === 'expired') {
              finalResult = { status: 'BLOCKED', ...verificationReport(afterVerification) };
              break;
            }
            if (afterVerification === 'required') {
              const report = verificationReport('required');
              finalResult = { status: 'BLOCKED', summary: 'The employer did not accept the single newest matching email code. No other or older code was tried.', unresolved: report.unresolved };
              break;
            }
          } catch (error) {
            const report = verificationReport('required');
            finalResult = { status: driver.submissionStarted ? 'UNKNOWN' : 'BLOCKED', summary: `Email verification could not be completed: ${String(error.message).slice(0, 1500)}`, unresolved: report.unresolved };
            break;
          }
          continue;
        }
      }
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
            const afterVerification = await completeEmailVerification();
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
      if (!previousError && liveEligibilityVerified) {
        const routine = routineContactActions(snapshot, job.profile);
        if (routine.length) {
          try { await executeFormPlan(driver, routine, learnMethod); routineFilled += routine.length; }
          catch (error) { previousError = error.message; }
          await flushMethods();
          await saveEfficiency();
          snapshot = await driver.snapshot();
        }
      }
      const stalled = progressWatch.observe(snapshot);
      if (stalled >= 7 && !driver.submissionStarted) throw new Error('Automation could not commit a form answer after multiple recovery steps. Technical form-control issue; no new candidate fact is required.');
      if (stalled >= 3) previousError = `RECOVERY REQUIRED: ${stalled} steps without a committed answer or page change. Do not repeat the same open/close action. Use choose on an already open combobox or click its visible exact option. Searchable comboboxes can use choose with the confirmed exact answer. If a control is optional, leave it blank and complete remaining required fields. Earlier error: ${previousError}`;
      modelCalls++;
      await saveEfficiency();
      const decision = await decideApplicationStep({ job: { coverLetterAvailable: Boolean(job.coverLetter), company: job.company, title: job.title, destination: job.destination, posting: job.posting, discoverySource: job.discoverySource, authorizationMode: job.authorizationMode, liveEligibilityVerified, automaticRequirements: job.automaticRequirements, prepareOnly: job.prepareOnly === true }, profile: job.profile, setup, applicationAnswers: job.confirmedAnswers || [], reusableAnswers, applicationHistory: job.applicationHistory || [], approvedResumeText: extracted.stdout, portalMethodHints: applicableMethodHints(job, snapshot, portalMethods), snapshot, previousError, answeredQuestions: driver.questions }, directory, step);
      let verifiedThisStep=false;
      if (job.authorizationMode === 'automatic') {
        const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
        const visibleText = normalize((snapshot.frames || []).map(frame => frame.text || '').join('\n'));
        for (const action of decision.actions.filter(action => action.kind === 'verify_job')) {
          const proof = JSON.parse(action.value);
          if (!proof.evidenceText || !visibleText.includes(normalize(proof.evidenceText)) || proof.sourceUrl !== snapshot.url) throw new Error('Live job evidence did not match the observed page. Automatic application parked.');
          await guard('verify_eligibility', { liveEligibility: proof });
          liveEligibilityVerified = true;
          verifiedThisStep=true;
        }
        decision.actions = decision.actions.filter(action => action.kind !== 'verify_job');
        if (!liveEligibilityVerified && decision.actions.some(action => ['fill', 'select', 'choose', 'check', 'upload', 'submit'].includes(action.kind))) throw new Error('Live job eligibility must be verified before entering personal application data.');
      }

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
      if(stepDisposition(decision,verifiedThisStep)==='observe'){
        await guard('checkpoint',{summary:decision.summary,questions:driver.questions,unresolved:driver.unresolved});
        continue;
      }
      previousError = '';
      try { await executeFormPlan(driver, decision.actions, learnMethod); }
      catch (error) { previousError = error.message; }
      await flushMethods();
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
  finalResult = finishBrowserResult(finalResult, driver);
  const retainedAccess = accessPages.retain(job, driver, finalResult);
  if (retainedAccess === "capacity") finalResult.summary += " Six access tabs are already parked in the dedicated browser. This additional tab may close when the next job starts; reopen this employer there before resuming.";
  pendingResult = finalResult;
  try { await journal.save(job, 'RESULT', finalResult); }
  catch { console.error('Terminal journal write failed; retaining the result in memory and attempting the bound result copy.'); }
  if (driver && !finalResult.screenshot && !driver.verificationCodeMayRemain) {
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
  if (result.status === 'UNKNOWN' && driver?.submissionStarted && driver.job.attemptId === job.attemptId) receiptObservers.add(job, driver);
  else receiptObservers.remove(job.attemptId);
  activeJob = null; pendingResult = null; heartbeatLost = false;
}
async function observeUnconfirmedApplications() {
  await receiptObservers.poll(async entry => {
    const observedDriver = entry.driver;
    // Read-only, bound to the original attempt. Never repeat a final click.
    const receipt = await observedDriver.observeReceipt();
    if (!receipt) {
      const verification = verificationState(observedDriver.lastSnapshot);
      if (verification && verification !== entry.verification) {
        await send('verification', { attemptId: entry.job.attemptId, verification });
        entry.verification = verification;
      }
      return false;
    }
    const result = { status: 'SUBMITTED', summary: 'The employer confirmed receipt while observing the submitted application. The approved resume was verified before submission.', ...receipt, questions: observedDriver.questions, unresolved: [] };
    await publishResult(entry.job, result);
    return true;
  }, error => {
    if (pendingResult) throw error; // Preserve a failed receipt report for idempotent retry.
    console.error(`Parked receipt observation failed: ${error.message}`);
  });
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
console.log('Application browser worker started; checking authorized manual and automatic applications.');
try {
  let recovered = false;
  const polling = new QueuePolling();
  while (!stopping) {
    try {
      if (pendingResult && activeJob) await publishResult(activeJob, pendingResult);
      if (!recovered) { await recoverPending(); recovered = true; }
      await observeUnconfirmedApplications();
      // Pending result reporting must complete before claiming another job.
      if (!pendingResult && polling.due()) {
        let job;
        try { job = await claimNext(); }
        catch (error) { polling.failed(); throw error; }
        polling.observed(Boolean(job));
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
  if (browserContext) await browserContext.close().catch(() => {});
}
