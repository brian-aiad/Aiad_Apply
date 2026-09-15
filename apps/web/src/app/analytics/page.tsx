import { subDays } from "date-fns";
import { Info, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { isEligibilityConstraint } from "@/lib/gap-classification";

export const dynamic = "force-dynamic";

type GapSummary = {
  term: string;
  occurrences: number;
  importance: number;
  companies: Set<string>;
  evidence: Set<string>;
};

export default async function AnalyticsPage() {
  const applications = await db.application.findMany({
    select: {
      status: true, appliedAt: true, createdAt: true,
      job: { select: { company: true } },
      events: { where: { eventType: "status_changed", toValue: "INTERVIEW" }, select: { id: true }, take: 1 },
      tailoringRuns: {
        where: { status: "SUCCEEDED" },
        orderBy: { runNumber: "desc" },
        take: 1,
        include: { keywordDecisions: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const applied = applications.filter((item) => item.appliedAt);
  const interviews = applied.filter((item) => item.status === "INTERVIEW" || item.events.length > 0);
  const lastThirty = applications.filter(
    (item) => item.createdAt >= subDays(new Date(), 30),
  );
  const successfulRuns = applications
    .map((item) => item.tailoringRuns[0])
    .filter((run) => run?.status === "SUCCEEDED" && run.keywordCoverage !== null);
  const averageCoverage = successfulRuns.length
    ? Math.round(
        successfulRuns.reduce((total, run) => total + (run.keywordCoverage || 0), 0) /
          successfulRuns.length,
      )
    : null;

  const gaps = new Map<string, GapSummary>();
  for (const application of applications) {
    const run = application.tailoringRuns[0];
    for (const decision of run?.keywordDecisions ?? []) {
      if (!decision.accepted || decision.used || decision.hiringImportance < 25 || !["UNSUPPORTED", "WEAKLY_TRANSFERABLE"].includes(decision.evidenceLevel)) continue;
      const current = gaps.get(decision.normalized) ?? {
        term: decision.term,
        occurrences: 0,
        importance: 0,
        companies: new Set<string>(),
        evidence: new Set<string>(),
      };
      current.occurrences += 1;
      current.importance = Math.max(current.importance, decision.hiringImportance);
      current.companies.add(application.job.company);
      current.evidence.add(decision.evidenceLevel);
      gaps.set(decision.normalized, current);
    }
  }
  const sortedGaps = [...gaps.values()]
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences || right.importance - left.importance,
    );
  const buildableGaps = sortedGaps
    .filter((gap) => !isEligibilityConstraint(gap.term))
    .slice(0, 8);
  const eligibilityConstraints = sortedGaps.filter((gap) =>
    isEligibilityConstraint(gap.term),
  );

  const pipeline = [
    ["Captured", applications.filter((item) => item.status === "CAPTURED").length],
    ["Tailoring", applications.filter((item) => item.status === "TAILORING").length],
    [
      "Review / ready",
      applications.filter((item) => ["REVIEW", "READY"].includes(item.status)).length,
    ],
    ["Applied", applications.filter((item) => item.status === "APPLIED").length],
    ["Interviews", applications.filter((item) => item.status === "INTERVIEW").length],
  ] as const;
  const pipelineMaximum = Math.max(1, ...pipeline.map(([, count]) => count));

  return (
    <div className="content">
      <div className="eyebrow">Performance</div>
      <h1 className="page-title">Analytics</h1>
      <p className="page-copy">
        Track submission outcomes and use tailoring audits to identify recurring,
        high-value qualification gaps.
      </p>
      <div className="coverage-explainer">
        <Info size={16} />
        <p><strong>Coverage is an evidence measure, not an interview prediction.</strong> A lower score can be the correct result when a role requires tools or domain experience your protected resume cannot prove. Stretch Lab shows how to close those gaps without presenting unfinished work as experience.</p>
      </div>
      <section className="metric-grid" style={{ marginTop: 24 }}>
        {[
          ["Applied", applied.length, "Submitted applications"],
          [
            "Interview rate",
            applied.length ? `${Math.round((interviews.length / applied.length) * 100)}%` : "—",
            `${interviews.length} of ${applied.length} submissions reached interview; all time`,
          ],
          [
            "Avg. evidence coverage",
            averageCoverage === null ? "—" : `${averageCoverage}%`,
            "Latest successful tailoring runs",
          ],
          ["Last 30 days", lastThirty.length, "Jobs captured"],
        ].map(([label, value, note]) => (
          <div className="panel metric" key={label}>
            <div className="eyebrow">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-note">{note}</div>
          </div>
        ))}
      </section>

      <div className="analytics-grid" style={{ marginTop: 14 }}>
        <section className="panel" style={{ padding: 20 }}>
          <div className="panel-title">Application pipeline</div>
          <p className="muted" style={{ margin: "5px 0 18px", fontSize: 11 }}>
            Current work by decision stage
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            {pipeline.map(([label, count]) => (
              <div key={label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontSize: 12,
                  }}
                >
                  <span className="secondary">{label}</span>
                  <span className="mono">{count}</span>
                </div>
                <div
                  style={{
                    height: 5,
                    marginTop: 7,
                    overflow: "hidden",
                    borderRadius: 6,
                    background: "#28262e",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((count / pipelineMaximum) * 100)}%`,
                      height: "100%",
                      borderRadius: 6,
                      background: "var(--cyan)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Buildable skill gaps</div>
              <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                Technical and domain terms worth learning or substantiating
              </div>
            </div>
          </div>
          {buildableGaps.length ? (
            <div style={{ display: "grid" }}>
              {buildableGaps.map((gap) => (
                <div
                  key={gap.term}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, 1fr) auto",
                    gap: 14,
                    padding: "13px 18px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650 }}>{gap.term}</div>
                    <div className="muted" style={{ marginTop: 3, fontSize: 10 }}>
                      {gap.occurrences} role{gap.occurrences === 1 ? "" : "s"} · {gap.companies.size}{" "}
                      compan{gap.companies.size === 1 ? "y" : "ies"} · {[
                        ...gap.evidence,
                      ]
                        .join(", ")
                        .toLocaleLowerCase()
                        .replaceAll("_", " ")}
                    </div>
                  </div>
                  <span className="status status-amber">
                    {Math.round(gap.importance)} importance
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: 230 }}>
              <div>
                <div style={{ fontWeight: 650 }}>No audited gaps yet</div>
                <p className="muted" style={{ maxWidth: 410, margin: "6px 0 0" }}>
                  Complete a tailoring run to see missing tools, methods, and domain
                  requirements aggregated across target roles.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {eligibilityConstraints.length ? (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title constraint-title">
                <ShieldAlert size={15} /> Eligibility &amp; credential constraints
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                Tracked separately because keywords, rewrites, and practice projects
                cannot satisfy these requirements.
              </div>
            </div>
          </div>
          <div className="constraint-grid">
            {eligibilityConstraints.map((gap) => (
              <div className="constraint-item" key={gap.term}>
                <div>
                  <div style={{ fontWeight: 650 }}>{gap.term}</div>
                  <div className="muted" style={{ marginTop: 3, fontSize: 10 }}>
                    Required by {gap.companies.size} compan{gap.companies.size === 1 ? "y" : "ies"}
                  </div>
                </div>
                <span className="status status-red">Verify before applying</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
