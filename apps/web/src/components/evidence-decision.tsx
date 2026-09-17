"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EvidenceDecision({ term, category = "other" }: { term: string; category?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  async function decide(decision: "confirmed" | "rejected") {
    setState("saving");
    const safeCategory = ["technology", "method", "domain", "qualification"].includes(category) ? category : "other";
    const response = await fetch("/api/profile/evidence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term, category: safeCategory, decision }) });
    if (response.ok) { setState("saved"); router.refresh(); } else setState("idle");
  }
  return <div className="evidence-actions" aria-label={`Record experience with ${term}`}>
    <button type="button" className="button button-compact" disabled={state !== "idle"} onClick={() => decide("confirmed")}>I’ve used this</button>
    <button type="button" className="button button-compact button-secondary" disabled={state !== "idle"} onClick={() => decide("rejected")}>No experience</button>
    {state === "saved" ? <span className="muted">Saved to memory</span> : null}
  </div>;
}
