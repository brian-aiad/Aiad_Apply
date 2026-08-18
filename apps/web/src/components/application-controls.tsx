"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Play, Save } from "lucide-react";

const statuses = [
  "CAPTURED",
  "REVIEW",
  "READY",
  "APPLIED",
  "INTERVIEW",
  "CLOSED",
] as const;

export function ApplicationControls({
  id,
  initialStatus,
  initialUrl,
  hasActiveRun,
}: {
  id: string;
  initialStatus: string;
  initialUrl: string;
  hasActiveRun: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [sourceUrl, setSourceUrl] = useState(initialUrl);
  const [busy, setBusy] = useState<"save" | "tailor" | null>(null);
  const [message, setMessage] = useState("");
  const visibleStatuses =
    initialStatus === "TAILORING" ? (["TAILORING", ...statuses] as const) : statuses;

  async function save() {
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, sourceUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Saved" : payload.error || "Unable to save.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Unable to reach the dashboard server.");
    } finally {
      setBusy(null);
    }
  }

  async function tailor() {
    setBusy("tailor");
    setMessage("");
    try {
      const response = await fetch(`/api/applications/${id}/tailor`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Tailoring queued" : payload.error || "Unable to queue.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Unable to reach the dashboard server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div className="panel-title">Application controls</div>
      <div style={{ display: "grid", gap: 13, marginTop: 15 }}>
        <div>
          <label className="field-label" htmlFor="application-status">
            Status
          </label>
          <select
            id="application-status"
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={hasActiveRun}
          >
            {visibleStatuses.map((item) => (
              <option key={item} value={item} disabled={item === "TAILORING"}>
                {item.toLocaleLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="source-url">
            Job URL
          </label>
          <input
            id="source-url"
            className="input"
            type="url"
            placeholder="Add source URL later"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            maxLength={2_000}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="button" type="button" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            Save
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={tailor}
            disabled={busy !== null || hasActiveRun}
          >
            {busy === "tailor" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Play size={15} />
            )}
            {hasActiveRun ? "In queue" : "Tailor"}
          </button>
        </div>
        {message ? (
          <div className="muted" role="status" aria-live="polite" style={{ fontSize: 11 }}>
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
