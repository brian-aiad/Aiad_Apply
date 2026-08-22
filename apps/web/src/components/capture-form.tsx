"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Keyboard,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

export function CaptureForm() {
  const router = useRouter();
  const [rawPaste, setRawPaste] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState<"save" | "tailor" | null>(null);
  const [error, setError] = useState("");
  const trimmed = rawPaste.trim();
  const wordCount = useMemo(() => (trimmed ? trimmed.split(/\s+/).length : 0), [trimmed]);
  const lineCount = useMemo(() => (trimmed ? trimmed.split(/\r?\n/).filter(Boolean).length : 0), [trimmed]);
  const ready = trimmed.length >= 100;
  const urlLooksValid = !sourceUrl || /^https?:\/\//i.test(sourceUrl);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!trimmed || loading) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [loading, trimmed]);

  async function submit(queueTailoring: boolean) {
    setLoading(queueTailoring ? "tailor" : "save");
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPaste, sourceUrl, queueTailoring }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to capture this job.");
      router.push(`/applications/${payload.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to capture this job.");
      setLoading(null);
    }
  }

  const disabled = loading !== null || !ready || !urlLooksValid;

  return (
    <div
      className="capture-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.55fr) minmax(280px, .65fr)",
        gap: 14,
        marginTop: 24,
      }}
    >
      <section className="panel capture-editor" aria-busy={loading !== null}>
        <label className="field-label" htmlFor="job-paste">
          Complete job posting paste
        </label>
        <textarea
          id="job-paste"
          className="textarea"
          value={rawPaste}
          onChange={(event) => setRawPaste(event.target.value)}
          maxLength={500_000}
          aria-describedby="job-paste-count"
          placeholder="Paste the full LinkedIn, Simplify, or employer job page here. Navigation, recommendations, and scanner keywords can remain in the text."
          autoFocus
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !disabled) {
              event.preventDefault();
              void submit(true);
            }
          }}
        />
        <div className="paste-diagnostics" id="job-paste-count">
          <span>{rawPaste.length.toLocaleString()} characters</span>
          <span>{wordCount.toLocaleString()} words</span>
          <span>{lineCount.toLocaleString()} lines</span>
          <span className={ready ? "paste-ready" : "paste-waiting"}>
            {ready ? <><Check size={12} />Ready to capture</> : "Paste at least 100 characters"}
          </span>
        </div>
        <div className="capture-actions">
          <span className="keyboard-hint"><Keyboard size={13} /><kbd>⌘</kbd><span>+</span><kbd>Enter</kbd> to tailor</span>
          <div className="capture-buttons">
            <button
              className="button"
              disabled={disabled}
              onClick={() => submit(false)}
              type="button"
            >
              {loading === "save" ? <LoaderCircle size={15} className="spin" /> : null}
              {loading === "save" ? "Saving…" : "Save only"}
            </button>
            <button
              className="button button-primary"
              disabled={disabled}
              onClick={() => submit(true)}
              type="button"
            >
              {loading === "tailor" ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              {loading === "tailor" ? "Starting…" : "Save and tailor"}
            </button>
          </div>
        </div>
        {error ? (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              border: "1px solid rgba(239,115,115,.28)",
              borderRadius: 8,
              color: "var(--red)",
              background: "rgba(239,115,115,.08)",
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      <aside style={{ display: "grid", alignContent: "start", gap: 12 }}>
        <div className="panel" style={{ padding: 18 }}>
          <label className="field-label" htmlFor="job-url">
            Job URL <span className="muted">(optional)</span>
          </label>
          <input
            id="job-url"
            type="url"
            className="input"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            maxLength={2_000}
            placeholder="https://linkedin.com/jobs/view/…"
          />
          {!urlLooksValid ? <p className="field-error">Start the URL with http:// or https://.</p> : null}
          <p className="field-help">
            You can add or correct this later from the application page.
          </p>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <ClipboardPaste size={17} color="var(--violet-bright)" />
            <span className="panel-title">Paste without cleaning</span>
          </div>
          <p className="secondary" style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.55 }}>
            Include the entire page. LinkedIn navigation, Simplify results, similar jobs,
            cookie notices, and footer text help the parser identify what to ignore.
          </p>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <ShieldCheck size={17} color="var(--green)" />
            <span className="panel-title">Before anything is exported</span>
          </div>
          <div style={{ display: "grid", gap: 11, marginTop: 16 }}>
            {[
              "Posting noise and negative phrases are removed",
              "Requirements are matched to protected resume evidence",
              "Unsupported tools stay out of the exported resume",
              "Every wording change is shown for your review",
              "DOCX and PDF are checked before download",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 12,
                }}
              >
                <CheckCircle2 size={15} color="var(--green)" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
