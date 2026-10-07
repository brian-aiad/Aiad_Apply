"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Download, ExternalLink } from "lucide-react";
import { ApplicationProfileForm } from "./application-profile-form";
import { APPLICATION_STATUS_EVENT } from "./application-status-pill";
import { ApplicationAutomation } from "./application-automation";

type Props = { id: string; runId: string; runNumber: number; destination: string | null; portal: string; blockers: string[];
  evidence: { id: string; source: string; text: string; terms: string[] }[];
  reviewed: boolean; submitted: boolean; pdfId: string | null; resumeSha256: string; fileName: string; hidden: boolean; };
export function ApplicationApply(props: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(props.destination || ""), [reviewed, setReviewed] = useState(props.reviewed);
  const [prepared, setPrepared] = useState(props.reviewed), [submitted, setSubmitted] = useState(props.submitted);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [confirmation, setConfirmation] = useState("");
  async function command(body: Record<string, unknown>) {
    const response = await fetch(`/api/applications/${props.id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to complete this step."); return data;
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setMessage(""); try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to complete this step."); } finally { setBusy(false); }
  }
  return <section id="apply" hidden={props.hidden} className="panel apply-workspace scroll-target">
    <ApplicationAutomation {...props} />
    <details className="apply-disclosure"><summary>Apply manually instead / record an existing submission</summary>
    <header className="apply-heading"><div><div className="eyebrow">Apply with your reviewed resume</div><h2>{submitted ? "Application record" : "Finish one application"}</h2><p>{props.portal} · {props.runNumber ? `Resume version ${props.runNumber}` : "Resume not generated"}</p></div><span className="apply-mode">You review & submit</span></header>
    <ol className="apply-steps">
      <li><span className="apply-step-number">1</span><div><h3>Review this version</h3><p>Check the wording, gaps and contact details. This handoff uses the exact PDF below.</p>
        {props.pdfId ? <a className="apply-file" href={`/api/artifacts/${props.pdfId}`}><Download size={16} /><span>{props.fileName}</span></a> : null}
        <label className="apply-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy || submitted} /><span>I reviewed this resume and its claims for this job.</span></label>
        {!submitted ? <button className="button" disabled={busy || !reviewed || props.blockers.length > 0 || prepared} onClick={() => perform(async () => {
          await command({ action: "review", runId: props.runId, reviewed: true }); setPrepared(true);
          window.dispatchEvent(new CustomEvent(APPLICATION_STATUS_EVENT, { detail: { applicationId: props.id, status: "READY" } }));
          setMessage("Reviewed version saved. Use Simplify and upload this PDF, or download an autofill packet below."); router.refresh();
        })}><Check size={14} />{prepared ? "Reviewed version saved" : "Use this reviewed resume"}</button> : null}
        {props.blockers.length && !submitted ? <ul className="apply-blockers">{props.blockers.map(b => <li key={b}>{b}</li>)}</ul> : null}
      </div></li>
      <li><span className="apply-step-number">2</span><div><h3>Fill the employer application</h3><p>Use free Simplify for the form. Replace its default attachment with this job’s PDF before submitting.</p>
        <div className="apply-actions">{props.destination ? <a className={submitted ? "button" : "button button-primary"} href={props.destination} target="_blank" rel="noreferrer">{submitted ? "View employer posting" : "Open application"}<ExternalLink size={14} /></a> : null}
        <button className="button" disabled={busy || !reviewed || props.blockers.length > 0} onClick={() => perform(async () => {
          const packet = await command({ action: "prepare", runId: props.runId, reviewed: true });
          const blob = new Blob([JSON.stringify(packet)], { type: "application/json" }); const href = URL.createObjectURL(blob); const link = document.createElement("a");
          link.href = href; link.download = `application-${props.id.slice(0, 8)}-v${props.runNumber}.aiadapply.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 10_000);
          setPrepared(true); window.dispatchEvent(new CustomEvent(APPLICATION_STATUS_EVENT, { detail: { applicationId: props.id, status: "READY" } }));
          setMessage("Reviewed version saved. Import the downloaded packet into AiadApply Assistant to fill contact fields and attach this PDF."); router.refresh();
        })}><Download size={14} />{busy ? "Preparing…" : "Download for AiadApply Assistant (optional)"}</button></div>
        <details className="apply-disclosure"><summary>Using Simplify Free</summary><p>Run Simplify first. Upload this job’s downloaded PDF in the employer’s resume field afterward, then verify the attachment name. Free Simplify may use its default resume; your AiadApply file is the version reviewed here.</p><p>For our browser helper, <a href="/apply-help">install AiadApply Assistant</a>, import the packet, preview the matched fields, then fill. It leaves existing answers untouched and never clicks Submit.</p><p className="field-help">The packet contains your contact details and resume. Keep it private. If you edit the downloaded DOCX, upload your edited file manually; this packet still contains the saved PDF.</p></details>
        <details className="apply-disclosure"><summary>Correct the application link</summary><label className="apply-url">Employer application URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label><button className="button" disabled={busy || !url} onClick={() => perform(async () => { await command({ action: "destination", url }); setMessage("Application link saved."); router.refresh(); })}>Save link</button></details>
      </div></li>
      <li><span className="apply-step-number">3</span><div><h3>{submitted ? "Submission recorded" : "Record the confirmation"}</h3><p>After you submit on the employer’s site, save its confirmation here. Opening a form or downloading a resume does not count as applying.</p>
        {submitted ? <p className="apply-success"><Check size={16} />Applied · follow-up tracked in Applications</p> : <>
          <label className="apply-url">Confirmation number or note<input value={confirmation} maxLength={2000} onChange={e => setConfirmation(e.target.value)} placeholder="e.g. Confirmation page received; ID 12345" /></label>
          <button className="button" disabled={busy || !prepared || !reviewed || !confirmation.trim()} onClick={() => perform(async () => {
            await command({ action: "submitted", runId: props.runId, confirmation, confirmed: true }); setSubmitted(true);
            window.dispatchEvent(new CustomEvent(APPLICATION_STATUS_EVENT, { detail: { applicationId: props.id, status: "APPLIED" } })); setMessage("Submission recorded with this resume version. Your follow-up is scheduled."); router.refresh();
          })}><Check size={14} />I submitted this application</button>
          {!prepared ? <p className="field-help">Save the reviewed version above first so the record includes the resume you used.</p> : null}
        </>}
      </div></li>
    </ol>
    <p role="status" className="apply-feedback">{message}</p>
    </details>
    {props.evidence.length ? <details className="apply-evidence"><summary>Resume evidence for application questions</summary><p className="field-help">Exact wording from this version. Choose evidence that answers the question, then adapt it in your own words. Tools missing from your resume remain gaps.</p><div>{props.evidence.map(item => <article key={item.id}><strong>{item.source}</strong><p>{item.text}</p><button className="button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(item.text); setMessage(`${item.source} evidence copied.`); } catch { setMessage("Select the evidence and copy it manually."); } }}><Clipboard size={13} />Copy evidence</button></article>)}</div></details> : null}
    <details className="apply-profile"><summary>Application profile & reusable answers</summary><ApplicationProfileForm /></details>
  </section>;
}
