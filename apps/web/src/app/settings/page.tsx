import { db } from "@/lib/db";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [setting, resume] = await Promise.all([
    db.setting.findUnique({ where: { key: "product" } }),
    db.resumeVersion.findFirst({ where: { active: true } }),
  ]);
  const value = (setting?.value || {}) as Record<string, unknown>;

  return (
    <div className="content">
      <div className="eyebrow">Configuration</div>
      <h1 className="page-title">Settings</h1>
      <p className="page-copy">
        Current operational paths and generation defaults. Secrets remain in server
        environment variables and are never shown here.
      </p>
      <div
        className="settings-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
          marginTop: 24,
        }}
      >
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">Application goal</div>
          <div className="metric-value">{String(value.dailyGoal || 8)}</div>
          <div className="metric-note">Submitted applications per day</div>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">Timezone</div>
          <div style={{ marginTop: 19, fontSize: 18, fontWeight: 650 }}>
            {String(value.timezone || "America/Los_Angeles")}
          </div>
          <div className="metric-note">Used for daily goal boundaries</div>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">Active base resume</div>
          <div className="secondary mono" style={{ marginTop: 15, fontSize: 11 }}>
            {resume?.localPath || "Not registered"}
          </div>
          <div className="muted mono" style={{ marginTop: 8, fontSize: 10 }}>
            {resume?.sha256 || "No fingerprint"}
          </div>
          <a
            href="/api/base-resume"
            className="button button-quiet"
            style={{ marginTop: 14, width: "fit-content" }}
          >
            <Download size={14} />
            Download editable base DOCX
          </a>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.5 }}>
            This protected source is copied and tailored for each job. Generated runs never
            overwrite it.
          </p>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">AI execution</div>
          <div style={{ marginTop: 15, fontSize: 15, fontWeight: 650 }}>
            Local Codex CLI session
          </div>
          <div className="metric-note">
            No AI API keys are passed to the tailoring subprocess. Evidence and document
            validation remain local.
          </div>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">Output folder</div>
          <div className="secondary mono" style={{ marginTop: 15, fontSize: 11 }}>
            {String(value.outputRoot || "Not configured")}
          </div>
          <div className="metric-note">Local DOCX, PDF, and audit packets</div>
        </section>
      </div>
    </div>
  );
}
