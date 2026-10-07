"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download } from "lucide-react";
import { activeAutomationStates, approvalMatches, canApproveAfter, type ApplicationAttempt } from "@/lib/application-automation";
import { APPLICATION_STATUS_EVENT } from "./application-status-pill";

type Props = { id: string; runId: string; runNumber: number; pdfId: string | null; resumeSha256: string; fileName: string; destination: string | null; blockers: string[]; submitted: boolean };
type Attempt = ApplicationAttempt & { id: string };
const labels: Record<string, string> = { QUEUED: "Approved · waiting to start", RUNNING: "Filling the application", SUBMITTING: "Checking submission", SUBMITTED: "Submission confirmed", BLOCKED: "Needs your attention · not submitted", UNKNOWN: "Submission not confirmed", CANCELED: "Canceled" };
export function ApplicationAutomation(props: Props) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [online, setOnline] = useState(false), [loaded, setLoaded] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
        setAttempt(data.attempt); setOnline(data.workerOnline); setInterrupted(!!data.interrupted); setLoaded(true); setMessage("");
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
      setAttempt(view.attempt); setOnline(view.workerOnline); setInterrupted(!!view.interrupted); setAnswers({}); setApproved(false); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this application."); }
    finally { setBusy(false); }
  }
  const matches = attempt && props.pdfId && approvalMatches(attempt, props.runId, props.pdfId, props.resumeSha256, props.destination);
  const active = attempt && activeAutomationStates.includes(attempt.status);
  const allowApprove = loaded && canApproveAfter(attempt) && !props.submitted;
  const needsVerification = attempt?.status === "UNKNOWN" && /verification|security code|one.time code/i.test([attempt.summary, ...attempt.unresolved].join(" "));
  return <div className="apply-automation">
    <header className="apply-heading"><div><div className="eyebrow">Tailor → approve → apply → report</div><h2>{interrupted ? "Browser connection interrupted" : needsVerification ? "Email verification needed · submission unconfirmed" : attempt ? labels[attempt.status] : "Approve your resume, then we apply"}</h2><p>Resume version {props.runNumber || "—"} · {online ? "Local browser worker online" : "Local browser worker offline"}</p></div></header>
    <ol className="apply-steps">
      <li><span className="apply-step-number">1</span><div><h3>Approve this job’s tailored resume</h3><p>Your approval authorizes filling and submitting this application with this exact resume. A different version or employer link needs a new approval.</p>
        {props.pdfId ? <a className="apply-file" href={`/api/artifacts/${props.pdfId}`}><Download size={16} /><span>{props.fileName}</span></a> : null}
        {allowApprove ? <><label className="apply-check"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} /><span>I approve version {props.runNumber} and authorize this application’s submission.</span></label>
          <button className="button button-primary" disabled={busy || !approved || props.blockers.length > 0} onClick={() => command({ action: "approve", approved: true, runId: props.runId, artifactId: props.pdfId, resumeSha256: props.resumeSha256, destination: props.destination })}><Check size={16} />{busy ? "Saving approval…" : "Auto apply with approved resume"}</button></> : null}
        {props.blockers.length > 0 && !props.submitted && !active ? <ul className="apply-blockers">{props.blockers.map(b => <li key={b}>{b}</li>)}</ul> : null}
        {attempt && !matches ? <p className="field-help">The attempt below belongs to resume version {attempt.runNumber}, not the currently selected resume or destination. Its approval does not transfer.</p> : null}
      </div></li>
      <li><span className="apply-step-number">2</span><div><h3>{attempt?.prepareOnly ? "Prepare and verify the application" : "Fill, verify and submit"}</h3><p>{attempt?.prepareOnly ? "This is a preparation-only recheck. The worker fills known answers and uploads your approved resume. Final submission is disabled for this attempt." : "The worker uses your saved answers and approved resume, checks the attachment, then submits. Missing facts, login requirements or unsupported form controls pause the attempt."}</p>
        {!online && !props.submitted ? <p className="field-help">Approved work waits here until the local browser worker is running. <a href="/apply-help">Browser setup and help</a></p> : null}
        {attempt ? <><p role="status">{attempt.summary}</p>{interrupted ? <p role="alert">The worker has stopped reporting progress. {attempt.status === "SUBMITTING" ? "Submission may have occurred. Do not retry until the employer result is checked." : "This is not a submission confirmation. Reconnect the worker to resolve the interruption."}</p> : null}<p className="muted">Last update: {new Date(attempt.updatedAt).toLocaleString()}</p></> : <p className="muted">No application will be sent before you approve above.</p>}
        {attempt && ["QUEUED", "RUNNING"].includes(attempt.status) ? <button className="button" disabled={busy} onClick={() => command({ action: "cancel", attemptId: attempt.id })}>Cancel before submission</button> : null}
      </div></li>
      <li><span className="apply-step-number">3</span><div><h3>Application report</h3>
        {attempt ? <>
          <p><strong>{labels[attempt.status]}</strong> · Resume version {attempt.runNumber}</p>
          <p className="muted">{attempt.fileName} · {attempt.attachmentVerified ? "Approved attachment verified before submission" : attempt.uploadedResumeVerified ? "Correct resume uploaded · file bytes verified" : "Resume upload not yet verified"}</p>
          {attempt.confirmation ? <p>{attempt.confirmation}</p> : null}
          {attempt.confirmationUrl ? <a href={attempt.confirmationUrl} target="_blank" rel="noreferrer">Employer confirmation page ↗</a> : null}
          {attempt.status === "UNKNOWN" ? <p>{needsVerification ? "Complete the verification in the existing employer tab. Keep that tab open and do not start a new application. We still need an employer receipt before marking this application submitted." : "Do not apply again yet. Check the employer site for a receipt; a missing confirmation does not mean submission failed."}</p> : null}
          {attempt.unresolved.length ? <><h4>Questions or steps needing you</h4><ul>{attempt.unresolved.map((item, i) => <li key={i}>{item}</li>)}</ul></> : null}
          {attempt.status === "BLOCKED" && matches && !props.blockers.length ? <div>
            <h4>Answer and resume this application</h4><p className="muted">These answers apply only to this employer application. Resuming uses the exact resume you already approved.</p>
            {attempt.unresolved.map((question, index) => <label key={index} style={{ display: "block", marginTop: 12 }}><span>{question}</span><textarea value={answers[question] ?? ""} maxLength={12000} onChange={event => setAnswers(previous => ({ ...previous, [question]: event.target.value }))} placeholder="Answer here if this requires a fact from you" style={{ display: "block", width: "100%" }} /></label>)}
            <button className="button button-primary" disabled={busy} onClick={() => command({ action: "resume", attemptId: attempt.id, prepareOnly: false, answers: Object.entries(answers).filter(([, answer]) => answer.trim()).map(([question, answer]) => ({ question, answer })) })}>{busy ? "Saving…" : "Save answers & resume approved application"}</button>
          </div> : null}
          {attempt.questions.length ? <details className="apply-disclosure"><summary>Questions and answers ({attempt.questions.length})</summary>{attempt.questions.map((item, i) => <div key={i} style={{ marginTop: 16 }}><strong>{item.question}</strong><p style={{ whiteSpace: "pre-wrap" }}>{item.answer || "Unanswered"}</p><small className="muted">{item.source.replaceAll("_", " ")}</small></div>)}</details> : <p className="muted">Questions encountered will appear here as the worker progresses.</p>}
        </> : <p className="muted">After the attempt, see whether the employer confirmed submission, which resume was used, the questions answered and anything unresolved.</p>}
      </div></li>
    </ol>
    <p role="status" className="apply-feedback">{message}</p>
  </div>;
}
