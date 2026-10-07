"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";

const places = [
  ["skills_only", "General knowledge / Skills only"],
  ["projects.loavenly", "Loavenly project"],
  ["experience.original_insurance", "Original Insurance"],
  ["experience.csulb", "CSULB"],
  ["experience.wehelp", "WEHELP"],
];

export function EvidenceDecision({ term, category = "other", initialDecision }: { term: string; category?: string; initialDecision?: "confirmed" | "rejected" }) {
  const router = useRouter();
  const id = useId();
  const [state, setState] = useState<"idle" | "saving" | "saved">(initialDecision ? "saved" : "idle");
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState("skills_only");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  async function decide(decision: "confirmed" | "rejected") {
    setState("saving"); setError("");
    const safeCategory = ["technology", "method", "domain", "qualification"].includes(category) ? category : "other";
    const scope = place === "skills_only" ? (safeCategory === "technology" ? "skills_only" : "general_exposure") : "source_specific";
    try {
      const response = await fetch("/api/profile/evidence", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, category: safeCategory, decision, scope,
          evidenceReference: scope === "source_specific" ? place : "", notes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save experience.");
      setState("saved"); setEditing(false); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save experience."); setState("idle"); }
  }
  return <div className="evidence-actions" aria-label={`Record experience with ${term}`}>
    {state !== "saved" ? <>
      <button type="button" className="button button-compact" disabled={state === "saving"} onClick={() => setEditing(!editing)}>I’ve used this</button>
      <button type="button" className="button button-compact button-secondary" disabled={state === "saving"} onClick={() => decide("rejected")}>No experience</button>
    </> : <><span className="muted">Saved to your shared profile. Future runs use this decision.</span><button type="button" className="button button-compact" onClick={() => setState("idle")}>Update experience</button></>}
    {editing ? <div style={{ flexBasis: "100%", display: "grid", gap: 8, marginTop: 8 }}>
      <label htmlFor={`${id}-place`}>Where did you use {term}?</label>
      <select id={`${id}-place`} className="input" value={place} onChange={event => setPlace(event.target.value)}>
        {places.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor={`${id}-notes`}>{place === "skills_only" ? "Experience details (optional)" : "What completed work used it?"}</label>
      <textarea id={`${id}-notes`} className="input" rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)}
        placeholder="Describe what you built, configured, or maintained." />
      <button type="button" className="button button-compact" disabled={state === "saving" || (place !== "skills_only" && notes.trim().length < 10)} onClick={() => decide("confirmed")}>Save experience</button>
    </div> : null}
    {error ? <span role="alert">{error}</span> : null}
  </div>;
}
