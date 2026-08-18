import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileWarning,
  MapPin,
  WandSparkles,
} from "lucide-react";
import { ApplicationControls } from "@/components/application-controls";
import { RunAutoRefresh } from "@/components/run-auto-refresh";
import { StatusPill } from "@/components/status-pill";
import { formatMoneyRange, formatRelativeDate, titleCaseStatus } from "@/lib/format";
import { getApplication } from "@/lib/queries";

export const dynamic = "force-dynamic";

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();
  const activeRun = application.tailoringRuns.find((run) =>
    ["QUEUED", "RUNNING"].includes(run.status),
  );
  const latestRun = activeRun ?? application.tailoringRuns[0];
  const visibleChanges =
    latestRun?.changes.filter((change) => change.changeType !== "unchanged") ?? [];
  const hasActiveRun = Boolean(activeRun);
  const progressEvent = application.events.find(
    (event) => event.eventType === "tailoring_progress" && event.toValue === latestRun?.id,
  );
  const progressStage =
    progressEvent?.detail &&
    typeof progressEvent.detail === "object" &&
    !Array.isArray(progressEvent.detail) &&
    "stage" in progressEvent.detail &&
    typeof progressEvent.detail.stage === "string"
      ? progressEvent.detail.stage
      : null;

  return (
    <div className="content">
      <RunAutoRefresh active={hasActiveRun} />
      <Link
        href="/applications"
        className="muted"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}
      >
        <ArrowLeft size={14} />
        Applications
      </Link>

      <div
        className="application-layout"
        style={{
          display: "flex",
          alignItems: "end",
          justifyContent: "space-between",
          gap: 20,
          marginTop: 18,
        }}
      >
        <div>
          <div className="eyebrow">{application.job.company}</div>
          <h1 className="page-title">{application.job.title}</h1>
          <div
            className="secondary"
            style={{ display: "flex", flexWrap: "wrap", gap: 15, marginTop: 10, fontSize: 12 }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <MapPin size={13} />
              {application.job.location || "Location not listed"}
            </span>
            <span>
              {formatMoneyRange(
                application.job.salaryMin,
                application.job.salaryMax,
                application.job.salaryText,
              )}
            </span>
            <span>{application.job.workArrangement || "Work mode not listed"}</span>
          </div>
        </div>
        <StatusPill status={application.status} />
      </div>

      <div
        className="application-detail-grid"
        style={{
          marginTop: 24,
        }}
      >
        <div className="application-main-stack">
          {latestRun ? (
            <section className="panel" style={{ padding: 17 }}>
              <div className="panel-title">Truth and AI provenance</div>
              <p
                className="secondary"
                style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.65 }}
              >
                The local worker grades the posting, retrieves evidence from the protected
                base resume and candidate profile, and asks the authenticated Codex CLI for
                a structured rewrite plan. No OpenAI, Anthropic, Gemini, or Azure AI API key
                is used. Deterministic checks reject invented metrics, employers, titles,
                dates, tools, and unsupported role requirements before export.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 8,
                  marginTop: 13,
                }}
              >
                {[
                  ["Reasoner", latestRun.reasoner || "Pending"],
                  ["Engine", latestRun.engineVersion || "Pending"],
                  [
                    "Base resume",
                    latestRun.baseResumeSha256
                      ? `${latestRun.baseResumeSha256.slice(0, 12)}…`
                      : "Pending",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{ padding: 11, border: "1px solid var(--line)", borderRadius: 8 }}
                  >
                    <div className="eyebrow">{label}</div>
                    <div className="mono" style={{ marginTop: 6, fontSize: 11 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Role intelligence</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  Extracted from the original paste
                </div>
              </div>
              {application.job.sourceUrl ? (
                <a
                  href={application.job.sourceUrl}
                  className="button button-quiet"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open posting
                  <ExternalLink size={14} />
                </a>
              ) : (
                <span className="muted" style={{ fontSize: 11 }}>
                  URL can be added later
                </span>
              )}
            </div>
            <div
              className="stats-four"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 1,
                background: "var(--line)",
              }}
            >
              {[
                ["Employment", application.job.employmentType || "Not listed"],
                ["Applicants", application.job.applicantCount?.toString() || "Not captured"],
                ["Posted", application.job.postedText || "Not captured"],
                [
                  "Qualifications",
                  Array.isArray(application.job.requiredQualifications) &&
                  Array.isArray(application.job.preferredQualifications)
                    ? `${
                        application.job.requiredQualifications.length +
                        application.job.preferredQualifications.length
                      } extracted`
                    : "Pending",
                ],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 15, background: "var(--panel)" }}>
                  <div className="eyebrow">{label}</div>
                  <div style={{ marginTop: 7, fontSize: 13, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
            <details style={{ padding: 17 }}>
              <summary style={{ cursor: "pointer", fontWeight: 650 }}>
                View cleaned job description
              </summary>
              <div
                className="secondary"
                style={{ marginTop: 15, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.65 }}
              >
                {application.job.cleanDescription}
              </div>
            </details>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Tailoring audit</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  Exact text changes from the protected base resume
                </div>
              </div>
              {latestRun ? <StatusPill status={latestRun.status} /> : null}
            </div>
            {!latestRun ? (
              <div className="empty-state">
                <div>
                  <WandSparkles size={24} color="var(--violet-bright)" />
                  <div style={{ marginTop: 11, fontWeight: 650 }}>No tailoring run yet</div>
                  <p className="muted" style={{ margin: "5px 0 0" }}>
                    Queue a run from the controls to generate the resume and audit.
                  </p>
                </div>
              </div>
            ) : hasActiveRun ? (
              <div className="empty-state">
                <div>
                  <WandSparkles size={24} color="var(--violet-bright)" />
                  <div style={{ marginTop: 11, fontWeight: 650 }}>
                    {latestRun.status === "RUNNING"
                      ? "The local worker is tailoring this resume"
                      : "Waiting for the local worker"}
                  </div>
                  <p className="muted" style={{ margin: "5px 0 0" }}>
                    {progressStage ||
                      "This page will show the final before-and-after audit when complete."}
                  </p>
                </div>
              </div>
            ) : latestRun.status === "FAILED" ? (
              <div className="empty-state">
                <div>
                  <FileWarning size={24} color="var(--red)" />
                  <div style={{ marginTop: 11, fontWeight: 650 }}>Tailoring failed</div>
                  <p style={{ maxWidth: 580, color: "var(--red)", margin: "6px 0 0" }}>
                    {latestRun.errorMessage}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <div
                  className="stats-four"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {[
                    ["Job coverage", `${Math.round(latestRun.keywordCoverage || 0)}%`],
                    ["Changes", String(visibleChanges.length)],
                    ["Review flags", String(latestRun.riskCount)],
                    ["Pages", String(latestRun.pageCount || "—")],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        padding: 12,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: "#0e0e11",
                      }}
                    >
                      <div className="eyebrow">{label}</div>
                      <div style={{ marginTop: 6, fontSize: 19, fontWeight: 650 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {visibleChanges.map((change) => (
                    <article
                      key={change.id}
                      style={{
                        padding: 14,
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                        background: "#0e0e11",
                      }}
                    >
                      <div
                        className="diff-grid"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          marginBottom: 11,
                        }}
                      >
                        <div>
                          <span className="eyebrow">{change.section}</span>
                          <span className="muted mono" style={{ marginLeft: 9, fontSize: 10 }}>
                            {change.paragraphId}
                          </span>
                        </div>
                        <span
                          className={`status ${
                            change.riskLevel === "HIGH"
                              ? "status-red"
                              : change.riskLevel === "MEDIUM"
                                ? "status-amber"
                                : "status-green"
                          }`}
                        >
                          {change.riskLevel.toLocaleLowerCase()} risk
                        </span>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 9,
                          fontSize: 12,
                          lineHeight: 1.55,
                        }}
                      >
                        <div>
                          <div className="eyebrow" style={{ marginBottom: 6 }}>
                            Base
                          </div>
                          <div className="diff-before">{change.beforeText}</div>
                        </div>
                        <div>
                          <div className="eyebrow" style={{ marginBottom: 6 }}>
                            Tailored
                          </div>
                          <div className="diff-after">{change.finalText}</div>
                        </div>
                      </div>
                      {Array.isArray(change.targetTerms) && change.targetTerms.length ? (
                        <div
                          className="muted"
                          style={{ marginTop: 9, fontSize: 11 }}
                        >
                          Targeted: {change.targetTerms.join(", ")}
                        </div>
                      ) : null}
                      {change.proposedText !== change.finalText ? (
                        <details style={{ marginTop: 10 }}>
                          <summary
                            className="muted"
                            style={{ cursor: "pointer", fontSize: 11 }}
                          >
                            View original proposal before layout fallback
                          </summary>
                          <div className="diff-after" style={{ marginTop: 7, fontSize: 12 }}>
                            {change.proposedText}
                          </div>
                        </details>
                      ) : null}
                      {change.explanation ? (
                        <div className="secondary" style={{ marginTop: 9, fontSize: 11 }}>
                          Why: {change.explanation}
                        </div>
                      ) : null}
                      {stringList(change.evidenceIds).length ? (
                        <div className="muted mono" style={{ marginTop: 7, fontSize: 10 }}>
                          Evidence: {stringList(change.evidenceIds).join(", ")}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          {latestRun?.keywordDecisions.length ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Keyword decisions</div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                    Hiring importance is evaluated separately from Simplify
                  </div>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Importance</th>
                      <th>Evidence</th>
                      <th>Decision</th>
                      <th>Placement</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRun.keywordDecisions.map((keyword) => (
                      <tr key={keyword.id}>
                        <td style={{ fontWeight: 650 }}>{keyword.term}</td>
                        <td className="mono">{Math.round(keyword.hiringImportance)}</td>
                        <td>
                          {!keyword.accepted ? (
                            <span className="muted">Not assessed</span>
                          ) : (
                            <span
                              className={`status ${
                                keyword.evidenceLevel === "DIRECT"
                                  ? "status-green"
                                  : keyword.evidenceLevel === "UNSUPPORTED"
                                    ? "status-red"
                                    : "status-amber"
                              }`}
                            >
                              {titleCaseStatus(keyword.evidenceLevel)}
                            </span>
                          )}
                        </td>
                        <td>
                          {!keyword.accepted ? (
                            <span className="muted">Rejected</span>
                          ) : keyword.used ? (
                            <span style={{ color: "var(--green)" }}>Used</span>
                          ) : (
                            <span style={{ color: "var(--amber)" }}>Not placed</span>
                          )}
                        </td>
                        <td className="secondary">
                          {keyword.accepted ? keyword.placement || "—" : "—"}
                        </td>
                        <td className="secondary" style={{ minWidth: 230 }}>
                          <div>
                            {keyword.explanation ||
                              keyword.rejectionReason ||
                              (keyword.used
                                ? "Placed using candidate evidence."
                                : "Not placed in the tailored resume.")}
                          </div>
                          {stringList(keyword.sourceSections).length ? (
                            <div className="muted mono" style={{ marginTop: 4, fontSize: 9 }}>
                              Source: {stringList(keyword.sourceSections).join(", ")}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <aside style={{ display: "grid", alignContent: "start", gap: 14 }}>
          <ApplicationControls
            key={`${application.status}:${application.job.sourceUrl || ""}`}
            id={application.id}
            initialStatus={application.status}
            initialUrl={application.job.sourceUrl || ""}
            hasActiveRun={hasActiveRun}
          />

          <div className="panel" style={{ padding: 16 }}>
            <div className="panel-title">Resume files</div>
            {latestRun?.artifacts.length ? (
              <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
                {latestRun.artifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={`/api/artifacts/${artifact.id}`}
                    className="button button-quiet"
                    style={{ justifyContent: "space-between" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {artifact.fileName}
                    </span>
                    <Download size={14} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: "9px 0 0", fontSize: 12 }}>
                Files appear after a successful local run.
              </p>
            )}
          </div>

          <div className="panel" style={{ padding: 16 }}>
            <div className="panel-title">Timeline</div>
            <div className="timeline-events">
              {application.events.map((event) => (
                <div
                  key={event.id}
                  style={{ display: "grid", gridTemplateColumns: "8px 1fr", gap: 10 }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      marginTop: 5,
                      borderRadius: 10,
                      background: "var(--violet)",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {titleCaseStatus(event.eventType)}
                    </div>
                    <div className="muted" style={{ marginTop: 2, fontSize: 10 }}>
                      {formatRelativeDate(event.occurredAt)}
                    </div>
                    {event.detail &&
                    typeof event.detail === "object" &&
                    !Array.isArray(event.detail) &&
                    "stage" in event.detail &&
                    typeof event.detail.stage === "string" ? (
                      <div className="secondary" style={{ marginTop: 3, fontSize: 11 }}>
                        {event.detail.stage}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
