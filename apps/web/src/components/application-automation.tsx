"use client";
import { reusableQuestion } from "@/lib/reusable-answers";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download } from "lucide-react";
import { activeAutomationStates, approvalMatches, canApproveAfter, isTechnicalApplicationBlocker, isPortalAccessBlocker, missingCandidateQuestions, type ApplicationAttempt } from "@/lib/application-automation";
import { APPLICATION_STATUS_EVENT } from "./application-status-pill";

type Props = { automatic?:boolean; initialAttempt?:(ApplicationAttempt & {id:string})|null; id: string; runId: string; runNumber: number; pdfId: string | null; resumeSha256: string; fileName: string; destination: string | null; blockers: string[]; submitted: boolean };
type Attempt = ApplicationAttempt & { id: string };
const labels: Record<string, string> = { QUEUED: "Queued · waiting to start", RUNNING: "Filling the application", SUBMITTING: "Checking submission", SUBMITTED: "Submission confirmed", BLOCKED: "Needs your attention · not submitted", UNKNOWN: "Submission not confirmed", CANCELED: "Canceled" };
export function ApplicationAutomation(props: Props) {
  const router = useRouter();
  const [applicationPlatform,setApplicationPlatform] = useState<string|null>(null);
  const [automatic, setAutomatic] = useState(props.automatic??false);
  const [attempt, setAttempt] = useState<Attempt | null>(props.initialAttempt??null);
  const [onDemandAvailable, setOnDemandAvailable] = useState(false);
  const [online, setOnline] = useState(false), [loaded, setLoaded] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [saveForFuture, setSaveForFuture] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let stopped = false;
    let lastStatus = "";
    const refresh = async () => {
      try {
        const response = await fetch(`/api/applications/${props.id}/automation`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the application worker status.");
        const data = await response.json();
        if (stopped) return;
        setApplicationPlatform(data.applicationPlatform ?? null); setAutomatic(!!data.automatic); setAttempt(data.attempt); setOnline(data.workerOnline); setOnDemandAvailable(!!data.onDemandAvailable); setInterrupted(!!data.interrupted); setLoaded(true); setMessage("");
        if (lastStatus && lastStatus !== data.attempt?.status) {
          router.refresh();
          if (data.attempt?.status === "SUBMITTED") window.dispatchEvent(new CustomEvent(APPLICATION_STATUS_EVENT, { detail: { applicationId: props.id, status: "APPLIED" } }));
        }
        lastStatus = data.attempt?.status || "none";
      } catch (error) { if (!stopped) { setOnline(false); setMessage(error instanceof Error ? error.message : "Status unavailable."); } }
    };
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [props.id, router]);
  async function command(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/applications/${props.id}/automation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const statusResponse = await fetch(`/api/applications/${props.id}/automation`, { cache: "no-store" });
      if (!statusResponse.ok) throw new Error("Your action was saved, but its status could not be refreshed. Wait for the next update before trying again.");
      const view = await statusResponse.json();
      setApplicationPlatform(view.applicationPlatform ?? null); setAttempt(view.attempt); setOnline(view.workerOnline); setOnDemandAvailable(!!view.onDemandAvailable); setInterrupted(!!view.interrupted); setAnswers({}); setApproved(false); setRetryAcknowledged(false); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this application."); }
    finally { setBusy(false); }
  }
  if(props.submitted)return <div className="apply-automation">
    <header className="apply-heading"><div><div className="eyebrow">Application record</div><h2>Submission confirmed</h2><p className="apply-success"><Check size={16}/>Applied · employer confirmation recorded</p></div></header>
    <p>The submission is saved in your application history. This job will not be submitted again automatically.</p>
    {attempt && attempt.status !== "SUBMITTED" ? <details className="apply-disclosure"><summary>Earlier browser attempt</summary><p>{labels[attempt.status]} · Resume version {attempt.runNumber}</p><p className="muted">{attempt.summary}</p><p className="field-help">This attempt is separate from the confirmed submission recorded above.</p></details> : null}
  </div>;
  const matches = attempt && props.pdfId && approvalMatches(attempt, props.runId, props.pdfId, props.resumeSha256, props.destination);
  const platformName = (platform: string | null | undefined) => platform === "win32" ? "Windows desktop" : platform === "darwin" ? "Mac" : platform === "linux" ? "Linux computer" : "application computer";
  const resumeLatest = automatic && attempt?.status === "BLOCKED" && !attempt.submissionStartedAt && !matches && !!props.pdfId && attempt.destination === props.destination;
  const active = attempt && activeAutomationStates.includes(attempt.status);
  const allowApprove = loaded && canApproveAfter(attempt) && !props.submitted;
  const candidateQuestions = missingCandidateQuestions(attempt);
  const accessBlocked = attempt?.unresolved.some(isPortalAccessBlocker) || isPortalAccessBlocker(attempt?.summary || "");
  const technicalBlocked = attempt?.status === "BLOCKED" && (attempt.unresolved.some(isTechnicalApplicationBlocker) || isTechnicalApplicationBlocker(attempt.summary));
  const needsVerification = attempt?.status === "UNKNOWN" && /verification|security code|one.time code/i.test([attempt.summary, ...attempt.unresolved].join(" "));
  return <div className="apply-automation">
    <header className="apply-heading"><div><div className="eyebrow">Tailor → verify → apply → report</div><h2>{interrupted ? "Browser connection interrupted" : needsVerification ? "Email verification needed · submission unconfirmed" : attempt ? automatic && attempt.status === "BLOCKED" ? "Parked · continuing with other jobs" : labels[attempt.status] : automatic ? "Automatic application selection enabled" : "Approve your resume, then we apply"}</h2><p>Resume version {props.runNumber || "—"} · {!loaded ? "Checking application browser…" : online ? "Application browser worker online" : onDemandAvailable ? "Windows browser starts when work is ready" : "Application browser worker offline"}</p></div></header>
    <ol className="apply-steps">
      <li><span className="apply-step-number">1</span><div><h3>{automatic ? "Job-specific resume selected" : "Approve this job’s tailored resume"}</h3><p>{automatic ? "This validated PDF is tied to this job. The selected application computer checks eligibility and verifies the uploaded file before submitting." : "Your approval authorizes filling and submitting this application with this exact resume. A different version or employer link needs a new approval."}</p>
        {props.pdfId ? <a className="apply-file" href={`/api/artifacts/${props.pdfId}`}><Download size={16} /><span>{props.fileName}</span></a> : null}
        {allowApprove && !automatic ? <><label className="apply-check"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} /><span>I approve version {props.runNumber} and authorize this application’s submission.</span></label>
          <button className="button button-primary" disabled={busy || !approved || props.blockers.length > 0} onClick={() => command({ action: "approve", approved: true, runId: props.runId, artifactId: props.pdfId, resumeSha256: props.resumeSha256, destination: props.destination })}><Check size={16} />{busy ? "Saving approval…" : "Auto apply with approved resume"}</button></> : null}
        {props.blockers.length > 0 && !props.submitted && !active ? <ul className="apply-blockers">{props.blockers.map(b => <li key={b}>{b}</li>)}</ul> : null}
        {attempt && !matches ? <p className="field-help">The attempt below belongs to resume version {attempt.runNumber}, not the currently selected resume or destination. Its approval does not transfer.</p> : null}
      </div></li>
      <li><span className="apply-step-number">2</span><div><h3>{attempt?.prepareOnly ? "Prepare and verify the application" : "Fill, verify and submit"}</h3><p>{attempt?.prepareOnly ? "This is a preparation-only recheck. The worker fills known answers and uploads your approved resume. Final submission is disabled for this attempt." : "The worker uses your saved answers and approved resume, checks the attachment, then submits. Missing facts, login requirements or unsupported form controls pause the attempt."}</p>
        {loaded && !online && !props.submitted ? <p className="field-help">Approved work waits here until the selected application computer’s browser worker is running. <a href="/apply-help">Browser setup and help</a></p> : null}
        {attempt ? <><p role="status">{attempt.summary}</p>{interrupted ? <p role="alert">The worker has stopped reporting progress. {attempt.status === "SUBMITTING" ? "Submission may have occurred. Do not retry until the employer result is checked." : "This is not a submission confirmation. Reconnect the worker to resolve the interruption."}</p> : null}<p className="muted">Last update: {new Date(attempt.updatedAt).toLocaleString()}</p></> : <p className="muted">{automatic ? "The selected application computer handles eligible jobs automatically. Jobs with missing facts stay parked." : "No application will be sent before you approve above."}</p>}
        {attempt && ["QUEUED", "RUNNING"].includes(attempt.status) ? <button className="button" disabled={busy} onClick={() => command({ action: "cancel", attemptId: attempt.id })}>Cancel before submission</button> : null}
      </div></li>
      <li><span className="apply-step-number">3</span><div><h3>Application report</h3>
        {attempt ? <>
          <p><strong>{labels[attempt.status]}</strong> · Resume version {attempt.runNumber}</p>
          <p className="muted">{attempt.fileName} · {attempt.attachmentVerified ? "Approved attachment verified before submission" : attempt.uploadedResumeVerified ? "Correct resume uploaded · file bytes verified" : "Resume upload not yet verified"}</p>
          {attempt.confirmation ? <p>{attempt.confirmation}</p> : null}
          {attempt.confirmationUrl ? <a href={attempt.confirmationUrl} target="_blank" rel="noreferrer">Employer confirmation page ↗</a> : null}
          {attempt.status === "UNKNOWN" ? <p>{needsVerification ? "Complete the verification in the existing employer tab. Keep that tab open and do not start a new application. We still need an employer receipt before marking this application submitted." : "Do not apply again yet. Check the employer site for a receipt; a missing confirmation does not mean submission failed."}</p> : null}
          {attempt.status === "UNKNOWN" && props.pdfId && props.destination && !props.blockers.length ? <details className="apply-disclosure"><summary>Retry only after checking the employer receipt</summary><p>Check the existing employer application and email first. A missing receipt does not prove the earlier submission failed.</p><label className="apply-check"><input type="checkbox" checked={retryAcknowledged} disabled={busy} onChange={event => setRetryAcknowledged(event.target.checked)} /><span>I checked for confirmation and understand that a retry could create a duplicate application.</span></label><label className="apply-check"><input type="checkbox" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} /><span>I approve version {props.runNumber} and authorize one new attempt with this exact PDF.</span></label><button className="button" disabled={busy || !retryAcknowledged || !approved} onClick={() => command({ action: "retry_unconfirmed", attemptId: attempt.id, acknowledgeUnconfirmedSubmission: true, approved: true, runId: props.runId, artifactId: props.pdfId, resumeSha256: props.resumeSha256, destination: props.destination })}>Authorize one explicit retry</button></details> : null}
          {needsVerification ? <div className="apply-verification-recovery">
            <h4>{attempt.verification === "rejected" ? "The employer rejected the code" : attempt.verification === "expired" ? "The code expired" : "Verification email missing or delayed?"}</h4>
            <p>The employer requested a code. This worker has not confirmed email delivery. Check the recipient shown in the existing employer tab, then search that mailbox’s Inbox, Spam and All Mail for the employer or “security code”.</p>
            <p>If it has not arrived, wait for the employer’s resend timer and use its Resend code control if available. Use the newest code. If there is no resend control, keep this tab open and request help; starting another application may create a duplicate.</p>
            <p>Enter the code only in the employer tab and complete verification there. Keep the tab open so the worker can detect the employer’s receipt.</p>
          </div> : null}
          {attempt.unresolved.length ? <><h4>{technicalBlocked ? "Automation issues to resolve" : "Missing facts or access steps"}</h4><ul>{attempt.unresolved.map((item, i) => <li key={i}>{item}</li>)}</ul></> : null}
          {attempt.status === "BLOCKED" && (matches || resumeLatest) && !props.blockers.length ? <div>
            <h4>{candidateQuestions.length ? "Answer and resume this application" : "Resume this application"}</h4>{accessBlocked ? <p>Sign in or complete the access check in the dedicated application browser on {platformName(applicationPlatform)} before resuming. {attempt.executionPlatform && attempt.executionPlatform !== applicationPlatform ? `The previous attempt ran on ${platformName(attempt.executionPlatform)}; its browser sign-in does not transfer automatically.` : "If the employer tab is no longer open, open the employer application in that dedicated browser."} Enter passwords and verification codes only on the employer site.</p> : null}{technicalBlocked ? <p>The browser could not finish a form control. You do not need to supply option wording or repeat saved personal facts.</p> : null}<p className="muted">These answers apply only to this employer application. {resumeLatest ? `Resuming will bind validated resume version ${props.runNumber} and verify its upload again.` : "Resuming uses the same verified resume."}</p>
            {candidateQuestions.map((question, index) => <label key={index} style={{ display: "block", marginTop: 12 }}><span>{question}</span><textarea value={answers[question] ?? ""} maxLength={12000} onChange={event => setAnswers(previous => ({ ...previous, [question]: event.target.value }))} placeholder="Answer here if this requires a fact from you" style={{ display: "block", width: "100%" }} />{reusableQuestion(question) ? <span><input type="checkbox" checked={!!saveForFuture[question]} onChange={event => setSaveForFuture(previous => ({ ...previous, [question]: event.target.checked }))} /> Save for future applications</span> : null}</label>)}
            <button className="button button-primary" disabled={busy} onClick={() => command({ action: resumeLatest ? "resume_latest" : "resume", attemptId: attempt.id, ...(resumeLatest ? {runId:props.runId,artifactId:props.pdfId,resumeSha256:props.resumeSha256,destination:props.destination} : {prepareOnly:false}), answers: Object.entries(answers).filter(([, answer]) => answer.trim()).map(([question, answer]) => ({ question, answer, saveForFuture: !!saveForFuture[question] })) })}>{busy ? "Saving…" : resumeLatest ? "Resume with latest validated PDF" : candidateQuestions.length ? "Save answers & resume application" : accessBlocked ? "I completed access · resume" : "Retry automated fill"}</button>
          </div> : null}
          {attempt.questions.length ? <details className="apply-disclosure"><summary>Questions and answers ({attempt.questions.length})</summary>{attempt.questions.map((item, i) => <div key={i} style={{ marginTop: 16 }}><strong>{item.question}</strong><p style={{ whiteSpace: "pre-wrap" }}>{item.answer || "Unanswered"}</p><small className="muted">{item.source.replaceAll("_", " ")}</small></div>)}</details> : <p className="muted">Questions encountered will appear here as the worker progresses.</p>}
        </> : <p className="muted">After the attempt, see whether the employer confirmed submission, which resume was used, the questions answered and anything unresolved.</p>}
      </div></li>
    </ol>
    <p role="status" className="apply-feedback">{message}</p>
  </div>;
}
