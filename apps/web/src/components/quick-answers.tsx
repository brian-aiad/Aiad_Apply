"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clipboard, ClipboardList, X } from "lucide-react";

const defaults = [
  ["Desired salary", ""],
  ["Work authorization", ""],
  ["Sponsorship", ""],
  ["Start date", ""],
  ["Location / relocation", ""],
  ["Portfolio", "https://loavenly.com"],
] as const;

type Answers = Record<string, string>;

export function QuickAnswers() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [answers, setAnswers] = useState<Answers>(() => Object.fromEntries(defaults));
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("aiadapply:quick-answers");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        queueMicrotask(() => setAnswers((current) => ({ ...current, ...parsed })));
      } catch { /* Ignore damaged local preferences. */ }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  function update(label: string, value: string) {
    setAnswers((current) => {
      const next = { ...current, [label]: value };
      window.localStorage.setItem("aiadapply:quick-answers", JSON.stringify(next));
      return next;
    });
  }

  async function copy(label: string) {
    const value = answers[label]?.trim();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  return (
    <>
      <button className="answer-kit-trigger" type="button" onClick={() => setOpen(true)}>
        <ClipboardList size={15} /><span>Answer kit</span>
      </button>
      {open ? createPortal(<div className="answer-kit-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <div className="answer-kit-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="answer-kit-title">
          <div className="answer-kit-heading"><div><div className="eyebrow">Application helper</div><h2 id="answer-kit-title">Quick-copy answers</h2><p>Saved only in this browser.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close answer kit"><X size={17} /></button></div>
          <div className="answer-kit-list">
            {defaults.map(([label]) => <label key={label}><span>{label}</span><div><input value={answers[label] || ""} onChange={(event) => update(label, event.target.value)} placeholder={`Add ${label.toLowerCase()}`} /><button type="button" onClick={() => copy(label)} disabled={!answers[label]?.trim()} aria-label={`Copy ${label}`}>{copied === label ? <Check size={15} /> : <Clipboard size={15} />}</button></div></label>)}
          </div>
        </div>
      </div>, document.body) : null}
    </>
  );
}
