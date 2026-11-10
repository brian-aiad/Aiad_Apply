import { ApplicationDeviceControl } from "@/components/application-device-control";
import { ApplicationAutonomyControl } from "@/components/application-autonomy-control";
import { AUTOMATION_POLICY_KEY, CANDIDATE_PROFILE_KEY, record, activeBase } from "@/lib/workspace-material";
import { localOutputRoot } from "@/lib/base-resume";
import { db } from "@/lib/db";
import { Download, FileCheck2, FolderOpen, ShieldCheck } from "lucide-react";
import { readProductSettings } from "@/lib/product-settings";
import { SettingsForm } from "@/components/settings-form";
import { storageHealth } from "@/lib/storage-health";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [setting, resume, outputRoot] = await Promise.all([
    db.setting.findUnique({ where: { key: "product" } }),
    activeBase().catch(() => null),
    localOutputRoot(),
  ]);
  const value = readProductSettings(setting?.value);
  const storage = storageHealth();
  const [artifacts, portableFiles] = await Promise.all([db.artifact.count(), db.artifact.count({ where: { OR: [{ storagePath: { not: null } }, { backup: { isNot: null } }] } })]);

  const policy = record((await db.setting.findUnique({ where: { key: AUTOMATION_POLICY_KEY } }))?.value);
  const sharedProfile = await db.setting.findUnique({ where: { key: CANDIDATE_PROFILE_KEY } });

  return (
    <div className="content">
      <div className="eyebrow">Configuration</div>
      <h1 className="page-title">Settings</h1>
      <p className="page-copy">
        Set your daily pace and check where your work is saved.
      </p>
      <SettingsForm
        initialGoal={value.dailyGoal}
        initialTimezone={value.timezone}
        initialFollowUpDays={value.followUpDays}
      />
      <ApplicationAutonomyControl />
      <ApplicationDeviceControl />
      <section className="panel storage-summary"><h2 className="panel-title">Automation & shared facts</h2><p>{policy.browserPlatform === "win32" ? "Windows runs scheduled discovery. Choose the application computer above; capture and tailoring remain available on either computer." : "Browser automation uses the selected workspace computer."}</p><p>{sharedProfile ? "Candidate evidence and confirmed application facts are shared across your workspace." : "Candidate evidence has not been initialized in shared storage."} Browser sign-ins remain on the automation computer.</p><p className="field-help">Dashboard and tailoring start at login. The application browser starts when automatic applications or explicitly selected work needs it. Automatic mode selects and verifies the exact resume without a review wait.</p></section>
      <section className="panel storage-summary">
        <div><h2 className="panel-title">Your data & devices</h2><span className={storage.databaseLocation === "local" ? "status status-amber" : "status status-green"}>{storage.databaseLocation === "local" ? "Saved on this computer" : storage.databaseLocation === "hosted" ? "Hosted database" : "Connection not identified"}</span></div>
        <p className="secondary">{storage.databaseLocation === "local" ? "Your current database lives on this computer. Git pull brings over code, but does not transfer your applications. For shared Mac and Windows history, both installations must connect to the same hosted database." : "Applications are saved in the configured database. Both computers must use the same database to share history."}</p>
        <p className="field-help">{portableFiles} of {artifacts} files have a database or object-storage copy. New completed runs save their files in the database, so they travel with your data. {storage.objectStorageConfigured ? "Supabase Storage is also configured." : "Separate object storage is not configured."}</p>
        <a className="button button-quiet" href="/api/backup"><Download size={14} />Download workspace backup</a>
      </section>
      <div
        className="settings-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
          marginTop: 14,
        }}
      >
        <section className="panel" style={{ padding: 20 }}>
          <div className="settings-card-heading"><FileCheck2 size={17} color="var(--green)" /><div className="panel-title">Protected base resume</div></div>
          <div className="secondary mono" style={{ marginTop: 15, fontSize: 11 }}>
            {resume?.source || "Not registered"}
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
            Download base DOCX
          </a>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.5 }}>
            This protected source is copied and tailored for each job. Generated runs never
            overwrite it.
          </p>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="settings-card-heading"><ShieldCheck size={17} color="var(--violet-bright)" /><div className="panel-title">Tailoring engine</div></div>
          <div style={{ marginTop: 15, fontSize: 15, fontWeight: 650 }}>
            Local Codex CLI session
          </div>
          <div className="metric-note">
            No AI API keys are passed to the tailoring subprocess. Evidence and document
            validation remain local.
          </div>
        </section>
        <section className="panel" style={{ padding: 20 }}>
          <div className="settings-card-heading"><FolderOpen size={17} color="var(--cyan)" /><div className="panel-title">Output folder</div></div>
          <div className="secondary mono" style={{ marginTop: 15, fontSize: 11 }}>
            {outputRoot}
          </div>
          <div className="metric-note">Local DOCX, PDF, and audit packets</div>
        </section>
      </div>
    </div>
  );
}
