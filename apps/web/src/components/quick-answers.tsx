"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";
import { ApplicationProfileForm } from "./application-profile-form";

export function QuickAnswers() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), backdrop = useRef<HTMLDivElement>(null);
  function close() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }
  useEffect(() => {
    if (!open) return;
    const background = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop.current).map(element => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown); panel.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("keydown", keydown); background.forEach(({ element, inert }) => { element.inert = inert; }); document.body.style.overflow = overflow; };
  }, [open]);
  return <><button ref={trigger} className="answer-kit-trigger" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}><ClipboardList size={15} /><span>Answer kit</span></button>
    {open ? createPortal(<div ref={backdrop} className="answer-kit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={panel} className="answer-kit-panel" role="dialog" aria-modal="true" aria-labelledby="answer-kit-title">
      <div className="answer-kit-heading"><div><div className="eyebrow">Application profile</div><h2 id="answer-kit-title">Your reusable answers</h2><p>Saved across this workspace.</p></div><button type="button" onClick={close} aria-label="Close answer kit"><X size={17} /></button></div>
      <ApplicationProfileForm />
    </div></div>, document.body) : null}</>;
}
