"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, LoaderCircle, Play, Save } from "lucide-react";

const statuses = ["CAPTURED", "REVIEW", "READY", "APPLIED", "INTERVIEW", "CLOSED"] as const;

const statusHelp: Record<string, string> = {
  CAPTURED: "Posting saved; resume not yet reviewed.",
  TAILORING: "The local worker is preparing this resume.",
  REVIEW: "Tailoring finished; inspect changes and flags.",
  READY: "You reviewed the resume and it is ready to submit.",
  APPLIED: "Application submitted.",
  INTERVIEW: "Interview process is active.",
  CLOSED: "No further action is planned.",
};

function toLocalInput(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function ApplicationControls({
  id,
  initialStatus,
  initialUrl,
  initialNotes,
  initialFollowUpAt,
  hasActiveRun,
  hasResumeFiles,
}: {
  id: string;
  initialStatus: string;
  initialUrl: string;
  initialNotes: string;
  initialFollowUpAt: string;
  hasActiveRun: boolean;
  hasResumeFiles: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [sourceUrl, setSourceUrl] = useState(initialUrl);
  const [notes, setNotes] = useState(initialNotes);
  const [followUpAt, setFollowUpAt] = useState(toLocalInput(initialFollowUpAt));
  const [saved, setSaved] = useState({ status: initialStatus, sourceUrl: initialUrl, notes: initialNotes, followUpAt: toLocalInput(initialFollowUpAt) });
  const [busy, setBusy] = useState<"save" | "tailor" | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const visibleStatuses = initialStatus === "TAILORING" ? (["TAILORING", ...statuses] as const) : statuses;
  const dirty = status !== saved.status || sourceUrl !== saved.sourceUrl || notes !== saved.notes || followUpAt !== saved.followUpAt;

  async function save() {
    setBusy("save");
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          sourceUrl,
          notes,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save changes.");
      setSaved({ status, sourceUrl, notes, followUpAt });
      setMessage("Application changes saved.");
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to reach the dashboard server.");
    } finally {
      setBusy(null);
    }
  }

  async function tailor() {
    setBusy("tailor");
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch(`/api/applications/${id}/tailor`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to queue tailoring.");
      setMessage("Tailoring queued. This page will update automatically.");
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to reach the dashboard server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel application-controls">
      <div className="controls-heading">
        <div><div className="panel-title">Application details</div><div className="muted">Track your decision and follow-up.</div></div>
        {dirty ? <span className="status status-amber">Unsaved</span> : null}
      </div>
      <div className="controls-fields">
        <div>
          <label className="field-label" htmlFor="application-status">Status</label>
          <select id="application-status" className="select" value={status} onChange={(event) => setStatus(event.target.value)} disabled={hasActiveRun}>
            {visibleStatuses.map((item) => (
              <option key={item} value={item} disabled={item === "TAILORING" || (item === "READY" && !hasResumeFiles)}>
                {item.toLocaleLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="field-help">{statusHelp[status]}</p>
        </div>
        <div>
          <label className="field-label" htmlFor="source-url">Job posting URL</label>
          <input id="source-url" className="input" type="url" placeholder="https://…" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2_000} />
        </div>
        <div>
          <label className="field-label" htmlFor="follow-up"><CalendarClock size={13} /> Follow-up reminder</label>
          <input id="follow-up" className="input" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="application-notes">Private notes</label>
          <textarea id="application-notes" className="textarea textarea-compact" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={10_000} placeholder="Contact, next step, interview detail, or anything you want to remember…" />
          <div className="field-count">{notes.length.toLocaleString()} / 10,000</div>
        </div>
        <div className="control-actions">
          <button className="button" type="button" onClick={save} disabled={busy !== null || !dirty}>
            {busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            Save changes
          </button>
          <button className="button button-primary" type="button" onClick={tailor} disabled={busy !== null || hasActiveRun}>
            {busy === "tailor" ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
            {hasActiveRun ? "Tailoring…" : hasResumeFiles ? "Tailor again" : "Tailor resume"}
          </button>
        </div>
        {message ? <div className={isError ? "inline-message inline-message-error" : "inline-message inline-message-success"} role="status" aria-live="polite"><Check size={13} />{message}</div> : null}
      </div>
    </div>
  );
}
