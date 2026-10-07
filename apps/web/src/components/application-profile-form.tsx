"use client";
import { useEffect, useState } from "react";
import { Clipboard, Save } from "lucide-react";
import { emptyApplicationProfile, profileFields, type ApplicationProfile } from "@/lib/application-profile";

export function ApplicationProfileForm() {
  const [profile, setProfile] = useState<ApplicationProfile>({ ...emptyApplicationProfile });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let ignore = false;
    fetch("/api/application-profile").then(async response => {
      if (!response.ok) throw new Error("Profile could not be loaded. Reopen the answer kit to retry.");
      const data = await response.json();
      if (!ignore) { setProfile(data.profile); setUpdatedAt(data.updatedAt); setLoaded(true); }
    }).catch(error => { if (!ignore) setMessage(error.message); });
    return () => { ignore = true; };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/application-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, updatedAt }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setProfile(data.profile); setUpdatedAt(data.updatedAt); setDirty(false); setMessage("Application profile saved across this workspace.");
      window.dispatchEvent(new Event("application-profile-saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save profile."); }
    finally { setBusy(false); }
  }
  function importAnswers() {
    try {
      const old = JSON.parse(localStorage.getItem("aiadapply:quick-answers") || "{}");
      const next = { ...profile };
      for (const field of profileFields) if (!next[field.key] && typeof old[field.label] === "string") next[field.key] = old[field.label].slice(0, 500);
      setProfile(next); setDirty(true); setMessage("Browser answers imported into this draft. Review and save them.");
    } catch { setMessage("No readable browser answers were found."); }
  }
  return <form onSubmit={save} className="application-profile-form">
    <p className="field-help">Save answers for future applications. After you approve a resume, the browser worker uses these facts where the employer’s question matches. Add answers to questions that paused an attempt below. “Copy only” applies to the optional manual browser helper.</p>
    <div className="profile-fields">{profileFields.map(field => <label key={field.key}><span>{field.label}{field.copyOnly ? <small> · copy only</small> : null}</span><div>
      {field.type === "textarea" ? <textarea aria-label={field.label} rows={5} disabled={!loaded || busy} value={profile[field.key]} maxLength={12000} onChange={event => { setProfile({ ...profile, [field.key]: event.target.value }); setDirty(true); }} /> : <input aria-label={field.label} type={field.type || "text"} disabled={!loaded || busy} value={profile[field.key]} maxLength={500} onChange={event => { setProfile({ ...profile, [field.key]: event.target.value }); setDirty(true); }} />}
      <button className="button" type="button" title={`Copy ${field.label}`} aria-label={`Copy ${field.label}`} disabled={!profile[field.key]} onClick={async () => {
        try { await navigator.clipboard.writeText(profile[field.key]); setMessage(`${field.label} copied.`); } catch { setMessage("Select the answer and copy it manually."); }
      }}><Clipboard size={14} /></button>
    </div></label>)}</div>
    <div className="apply-actions"><button type="submit" className="button button-primary" disabled={!loaded || busy || !dirty}><Save size={14} />{busy ? "Saving…" : "Save profile"}</button><button type="button" className="button" disabled={!loaded || busy} onClick={importAnswers}>Import old browser answers</button></div>
    <p role="status" className="field-help">{message || (dirty ? "Unsaved changes" : "")}</p>
  </form>;
}
