"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Download, X } from "lucide-react";

export function ResumePreview({ artifactId, fileName }: { artifactId: string; fileName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    async function load() {
      try {
        const response = await fetch(`/api/artifacts/${artifactId}?preview=1`, { signal: controller.signal });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Unable to load this PDF.");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load this PDF.");
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, artifactId]);

  return <>
    <button type="button" className="button" aria-haspopup="dialog" onClick={() => { setPdfUrl(null); setError(""); setOpen(true); }}><Eye size={14} />Preview PDF</button>
    {open ? <dialog ref={dialog} className="resume-preview-dialog" aria-label={`PDF preview: ${fileName}`} onClose={() => setOpen(false)}>
      <div className="resume-preview-heading">
        <div><strong>Resume preview</strong><div className="muted">{fileName}</div></div>
        <a className="button" href={`/api/artifacts/${artifactId}`}><Download size={14} />Download</a>
        <button type="button" className="button" autoFocus aria-label="Close PDF preview" onClick={() => dialog.current?.close()}><X size={18} /></button>
      </div>
      {error ? <p className="resume-preview-message" role="alert">{error}</p> : pdfUrl ? <iframe className="resume-preview-frame" src={`${pdfUrl}#view=FitH`} title={`Resume PDF: ${fileName}`} /> : <p className="resume-preview-message" role="status">Loading PDF…</p>}
    </dialog> : null}
  </>;
}
