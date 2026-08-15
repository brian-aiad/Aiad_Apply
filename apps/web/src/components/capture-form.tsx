"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileText, LoaderCircle } from "lucide-react";

export function CaptureForm() {
  const router = useRouter();
  const [rawPaste, setRawPaste] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState<"save" | "tailor" | null>(null);
  const [error, setError] = useState("");

  async function submit(queueTailoring: boolean) {
    setLoading(queueTailoring ? "tailor" : "save");
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPaste, sourceUrl, queueTailoring }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to capture this job.");
      router.push(`/applications/${payload.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to capture this job.");
      setLoading(null);
    }
  }

  const disabled = loading !== null || rawPaste.trim().length < 100;

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
      <section className="panel" style={{ padding: 18 }}>
        <label className="field-label" htmlFor="job-paste">
          Complete job posting paste
        </label>
        <textarea
          id="job-paste"
          className="textarea"
          value={rawPaste}
          onChange={(event) => setRawPaste(event.target.value)}
          placeholder="Paste the full LinkedIn, Simplify, or employer job page here. Navigation, recommendations, and scanner keywords can remain in the text."
          autoFocus
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 12,
          }}
        >
          <span className="muted" style={{ fontSize: 11 }}>
            {rawPaste.length.toLocaleString()} characters
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="button"
              disabled={disabled}
              onClick={() => submit(false)}
              type="button"
            >
              {loading === "save" ? <LoaderCircle size={15} className="spin" /> : null}
              Save for later
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
              Save and tailor
            </button>
          </div>
        </div>
        {error ? (
          <div
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
            placeholder="https://linkedin.com/jobs/view/…"
          />
          <p className="muted" style={{ margin: "9px 0 0", fontSize: 11 }}>
            You can add or correct this later from the application page.
          </p>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <FileText size={17} color="var(--violet-bright)" />
            <span className="panel-title">What gets extracted</span>
          </div>
          <div style={{ display: "grid", gap: 11, marginTop: 16 }}>
            {[
              "Company, role, location, and work mode",
              "Salary range and source link",
              "Real responsibilities and qualifications",
              "Hiring keywords weighted independently of Simplify",
              "Exact resume changes, evidence, and review risks",
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
