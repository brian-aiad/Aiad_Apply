import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, Clock3, Target } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { ApplicationTable } from "@/components/application-table";
import { getDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboard();
  const percentage = Math.min(100, Math.round((data.appliedToday / data.goal) * 100));
  const todayLabel = formatInTimeZone(
    new Date(),
    "America/Los_Angeles",
    "EEEE · MMMM d",
  );

  return (
    <div className="content">
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">{todayLabel} · Daily plan</div>
          <h1 className="page-title">Today</h1>
          <p className="page-copy">
            Move qualified roles from capture to submitted applications without losing
            sight of what changed in each resume.
          </p>
        </div>
        <Link href="/capture" className="button button-primary">
          Capture job
          <ArrowRight size={15} />
        </Link>
      </div>

      <section className="metric-grid" style={{ marginTop: 25 }}>
        <div className="panel metric">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">Daily goal</span>
            <Target size={17} color="var(--violet-bright)" />
          </div>
          <div className="metric-value">
            {data.appliedToday}
            <span className="muted" style={{ fontSize: 17, fontWeight: 500 }}>
              {" "}
              / {data.goal}
            </span>
          </div>
          <div
            style={{
              height: 4,
              marginTop: 13,
              borderRadius: 8,
              background: "#28262e",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${percentage}%`,
                height: "100%",
                borderRadius: 8,
                background: "linear-gradient(90deg, #7650df, #a78bfa)",
              }}
            />
          </div>
        </div>
        <div className="panel metric">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">Ready to apply</span>
            <Check size={17} color="var(--green)" />
          </div>
          <div className="metric-value">{data.ready}</div>
          <div className="metric-note">Resume reviewed and available</div>
        </div>
        <div className="panel metric">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">Interviews</span>
            <BriefcaseBusiness size={17} color="var(--cyan)" />
          </div>
          <div className="metric-value">{data.interviews}</div>
          <div className="metric-note">Active interview processes</div>
        </div>
        <div className="panel metric">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">Tracked</span>
            <Clock3 size={17} color="var(--amber)" />
          </div>
          <div className="metric-value">{data.total}</div>
          <div className="metric-note">Applications since the V2 reset</div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Recent applications</div>
            <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
              Latest activity across the pipeline
            </div>
          </div>
          <Link href="/applications" className="button button-quiet">
            View all
          </Link>
        </div>
        <ApplicationTable applications={data.applications} />
      </section>
    </div>
  );
}
