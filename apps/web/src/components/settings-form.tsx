"use client";

import { useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import { COMMON_TIMEZONES } from "@/lib/product-settings";

export function SettingsForm({
  initialGoal,
  initialTimezone,
  initialFollowUpDays,
}: {
  initialGoal: number;
  initialTimezone: string;
  initialFollowUpDays: number;
}) {
  const [dailyGoal, setDailyGoal] = useState(initialGoal);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [followUpDays, setFollowUpDays] = useState(initialFollowUpDays);
  const [saved, setSaved] = useState({
    dailyGoal: initialGoal,
    timezone: initialTimezone,
    followUpDays: initialFollowUpDays,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty =
    dailyGoal !== saved.dailyGoal ||
    timezone !== saved.timezone ||
    followUpDays !== saved.followUpDays;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyGoal, timezone, followUpDays }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save preferences.");
      setSaved({ dailyGoal, timezone, followUpDays });
      setMessage("Preferences saved. Your dashboard uses them immediately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save preferences.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-preferences">
      <div className="panel-header">
        <div>
          <div className="panel-title">Daily workflow</div>
          <div className="muted panel-subtitle">Control the goal and day boundary shown on Today.</div>
        </div>
        {dirty ? <span className="status status-amber">Unsaved</span> : <span className="status status-green">Saved</span>}
      </div>
      <div className="settings-preferences-body">
        <div>
          <label className="field-label" htmlFor="daily-goal">Daily application goal</label>
          <input
            className="input"
            id="daily-goal"
            type="number"
            min={1}
            max={50}
            value={dailyGoal}
            onChange={(event) => setDailyGoal(Number(event.target.value))}
          />
          <p className="field-help">Count only applications you actually submit.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="follow-up-days">Automatic follow-up</label>
          <input
            className="input"
            id="follow-up-days"
            type="number"
            min={1}
            max={30}
            value={followUpDays}
            onChange={(event) => setFollowUpDays(Number(event.target.value))}
          />
          <p className="field-help">Days after first marking an application Applied. Default: 7.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="timezone">Timezone</label>
          <select className="select" id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {COMMON_TIMEZONES.map((value) => (
              <option value={value} key={value}>{value.replace("America/", "").replace("Pacific/", "").replaceAll("_", " ")}</option>
            ))}
          </select>
          <p className="field-help">Determines when your daily counter resets.</p>
        </div>
      </div>
      <div className="settings-actions">
        <span className={message.startsWith("Preferences saved") ? "save-success" : "save-error"} role="status" aria-live="polite">
          {message ? <><Check size={13} />{message}</> : null}
        </span>
        <button className="button button-primary" type="button" disabled={!dirty || busy || dailyGoal < 1 || dailyGoal > 50 || followUpDays < 1 || followUpDays > 30} onClick={save}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
          Save preferences
        </button>
      </div>
    </section>
  );
}
