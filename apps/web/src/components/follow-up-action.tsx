"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

export function FollowUpAction({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function complete() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followUpAt: null }) });
      if (!response.ok) throw new Error("Could not clear the reminder. Try again.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <div><button type="button" className="button button-quiet" onClick={complete} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Handled</button>{error ? <span role="alert" className="error-text">{error}</span> : null}</div>;
}
