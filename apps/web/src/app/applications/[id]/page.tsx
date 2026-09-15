import Link from "next/link";
import { PhraseDiff } from "@/components/phrase-diff";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  FileWarning,
  MapPin,
  WandSparkles,
} from "lucide-react";
import { ApplicationControls } from "@/components/application-controls";
import { ApplicationStatusPill } from "@/components/application-status-pill";
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function objectList(value: unknown) {
  return Array.isArray(value)
    ? value.map(objectRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function displayValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function paragraphLabel(section: string, paragraphId: string) {
  const prefix = `${section}.`;
  return paragraphId.startsWith(prefix) ? paragraphId.slice(prefix.length) : paragraphId;
}

function humanizeReference(value: string) {
  return value
    .replace(/^evidence\./, "")
    .replace(/\.bullet\.(\d+)/g, " · bullet $1")
    .replace(/\./g, " › ")
    .replaceAll("_", " ");
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();
  const activeRun = application.tailoringRuns.find((run) =>
    ["QUEUED", "RUNNING"].includes(run.status),
  );
  const { run: selectedRunId } = await searchParams;
  const selectedRun = selectedRunId ? application.tailoringRuns.find((run) => run.id === selectedRunId) : undefined;
  const latestRun = selectedRun ?? activeRun ?? application.tailoringRuns[0];
  const previousUsableRun = application.tailoringRuns.find(
    (run) =>
      run.id !== latestRun?.id &&
      run.status === "SUCCEEDED" &&
      run.validationPassed &&
      run.artifacts.some((artifact) => ["DOCX", "PDF"].includes(artifact.kind)),
  );
  const historicalRun = Boolean(selectedRun && selectedRun.id !== application.tailoringRuns[0]?.id);
  const reportSnapshot = objectRecord(latestRun?.reportSnapshot);
  const stretchLab = objectRecord(reportSnapshot?.stretch_lab);
  const stretchOpportunities = objectList(stretchLab?.transferable_opportunities);
  const stretchGaps = objectList(stretchLab?.gaps);
  const stretchProjects = objectList(stretchLab?.proposed_projects);
  const captureMetadata = objectRecord(application.job.extractedMetadata);
  const capturedFit = objectRecord(captureMetadata?.captureIntelligence);
  const capturedFitDimensions = objectList(capturedFit?.dimensions);
  const correctedCaptureFields = stringList(captureMetadata?.correctedFields);
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
  const primaryEvents = application.events.filter(
    (event) => event.eventType !== "tailoring_progress" || event.id === progressEvent?.id,
  );
  const technicalEvents = application.events.filter(
    (event) => event.eventType === "tailoring_progress" && event.id !== progressEvent?.id,
  );
  const resumeArtifacts = latestRun?.artifacts.filter((artifact) => ["DOCX", "PDF"].includes(artifact.kind)) ?? [];
  const auditArtifacts = latestRun?.artifacts.filter((artifact) => !["DOCX", "PDF"].includes(artifact.kind)) ?? [];
  const reviewHeadline = hasActiveRun
    ? "Tailoring is in progress"
    : !latestRun
      ? "Tailor this posting when you are ready"
      : latestRun.status === "FAILED"
        ? "This run needs attention"
        : application.status === "READY"
          ? "Resume reviewed and ready"
          : application.status === "APPLIED"
            ? "Application submitted"
            : latestRun.riskCount > 0
              ? `Review ${latestRun.riskCount} flagged ${latestRun.riskCount === 1 ? "item" : "items"}`
              : "Review the tailored resume";
  const reviewCopy = hasActiveRun
    ? progressStage || "The audit and files will appear here automatically."
    : !latestRun
      ? "Every tailored version is generated from your protected base. The base is never overwritten."
      : latestRun.status === "FAILED"
        ? previousUsableRun
          ? "The new run failed. Your previous validated resume and files remain available in Resume versions."
          : latestRun.errorMessage || "Read the failure details below, then try the run again."
        : application.status === "READY"
          ? "Download the DOCX or PDF, then update the status after you apply."
          : application.status === "APPLIED"
            ? "Add a follow-up reminder or notes in Application details."
            : "Inspect the exact changes, resolve review flags, then mark the application Ready.";

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
        className="application-layout page-heading"
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
        <ApplicationStatusPill applicationId={application.id} initialStatus={application.status} />
      </div>

      {application.tailoringRuns.length > 1 ? (
        <section className="run-history panel" aria-label="Resume versions">
          <div><strong>Resume versions</strong><span className="muted">Every run keeps its own files and review.</span></div>
          <nav aria-label="Choose a resume version">{application.tailoringRuns.map((run) => <Link key={run.id} href={`/applications/${id}?run=${run.id}`} className={latestRun?.id === run.id ? "filter-chip filter-chip-active" : "filter-chip"} aria-current={latestRun?.id === run.id ? "page" : undefined}>Run {run.runNumber}<span>{run.status.toLowerCase()}</span></Link>)}</nav>
          {historicalRun ? <p className="field-help">Viewing an earlier version. Application status and new tailoring actions still apply to the current application.</p> : null}
        </section>
      ) : null}
      <section className="review-guide" aria-labelledby="review-guide-title">
        <div className="review-guide-copy">
          {latestRun?.status === "FAILED" ? <CircleAlert size={20} color="var(--red)" /> : <Check size={20} color="var(--green)" />}
          <div><div className="eyebrow">Your next decision</div><h2 id="review-guide-title">{reviewHeadline}</h2><p>{reviewCopy}</p></div>
        </div>
        <nav className="review-jumps" aria-label="Jump to application section">
          <a href="#role">Posting</a>
          <a href="#changes">Resume changes</a>
          {latestRun?.keywordDecisions.length ? <a href="#keywords">Keywords</a> : null}
          {stretchLab ? <a href="#stretch-lab">Stretch Lab</a> : null}
          <a href="#files">Files</a>
        </nav>
        {latestRun?.status === "SUCCEEDED" ? (
          <div className="review-checks">
            <span className="review-check">{visibleChanges.filter((change) => change.beforeText !== change.finalText).length} wording changes</span>
            <span className="review-check">{latestRun.keywordDecisions.filter((keyword) => keyword.used && keyword.accepted).length} supported terms represented</span>
            <span className="review-check">{latestRun.keywordDecisions.filter((keyword) => !keyword.used && keyword.evidenceLevel === "UNSUPPORTED").length} unsupported terms excluded</span>
            <span className={latestRun.pageCount === 1 ? "review-check review-check-done" : "review-check review-check-warning"}>{latestRun.pageCount === 1 ? "1 page confirmed" : "Page count needs review"}</span>
            <span className="review-check review-check-done"><Check size={13} />Tailored</span>
            <span className={latestRun.validationPassed ? "review-check review-check-done" : "review-check review-check-warning"}>{latestRun.validationPassed ? <Check size={13} /> : <CircleAlert size={13} />}Validated</span>
            <span className={latestRun.riskCount === 0 ? "review-check review-check-done" : "review-check review-check-warning"}>{latestRun.riskCount === 0 ? <Check size={13} /> : <CircleAlert size={13} />}{latestRun.riskCount} flags</span>
            <span className={resumeArtifacts.length ? "review-check review-check-done" : "review-check review-check-warning"}>{resumeArtifacts.length ? <Check size={13} /> : <CircleAlert size={13} />}Files ready</span>
          </div>
        ) : null}
      </section>

      <div
        className="application-detail-grid"
        style={{
          marginTop: 24,
        }}
      >
        <div className="application-main-stack">
          {latestRun ? (
            <section id="provenance" className="panel scroll-target" style={{ padding: 17 }}>
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

          <section id="role" className="panel scroll-target">
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
            {capturedFit ? (
              <div className="saved-fit-summary">
                <div className="saved-fit-decision">
                  <div>
                    <div className="eyebrow">Capture recommendation</div>
                    <strong>{displayValue(capturedFit.recommendation, "Needs review")}</strong>
                    {capturedFit.confidence ? (
                      <span className="saved-fit-confidence">
                        {displayValue(capturedFit.confidence)}
                      </span>
                    ) : null}
                  </div>
                  {correctedCaptureFields.length ? (
                    <span className="review-check review-check-done">
                      <Check size={13} />
                      {correctedCaptureFields.length} corrected {correctedCaptureFields.length === 1 ? "field" : "fields"}
                    </span>
                  ) : null}
                </div>
                <p>{displayValue(capturedFit.reason, "Review the extracted requirements before tailoring.")}</p>
                {capturedFitDimensions.length ? (
                  <details>
                    <summary>Why this recommendation</summary>
                    <div className="saved-fit-dimensions">
                      {capturedFitDimensions.map((item, index) => (
                        <div key={displayValue(item.key, String(index))}>
                          <span>{displayValue(item.label, "Fit factor")}</span>
                          <strong>{displayValue(item.status, "Review")}</strong>
                          <p>{displayValue(item.detail)}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
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

          <section id="changes" className="panel scroll-target">
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
                            · {paragraphLabel(change.section, change.paragraphId)}
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
                          <div className="diff-before"><PhraseDiff before={change.beforeText} after={change.finalText} side="before" /></div>
                        </div>
                        <div>
                          <div className="eyebrow" style={{ marginBottom: 6 }}>
                            Tailored
                          </div>
                          <div className="diff-after"><PhraseDiff before={change.beforeText} after={change.finalText} side="after" /></div>
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
                          Evidence: {stringList(change.evidenceIds).map(humanizeReference).join(", ")}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          {latestRun?.keywordDecisions.length ? (
            <section id="keywords" className="panel scroll-target">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Keyword decisions</div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                    Why each term was used, left out, or excluded by the posting
                  </div>
                </div>
              </div>
              <div className="keyword-summary">
                {[
                  ["Used safely", latestRun.keywordDecisions.filter((item) => item.used).length, "green"],
                  ["Transferable", latestRun.keywordDecisions.filter((item) => item.accepted && item.evidenceLevel.includes("TRANSFERABLE")).length, "cyan"],
                  ["Needs proof", latestRun.keywordDecisions.filter((item) => item.accepted && item.evidenceLevel === "UNSUPPORTED").length, "amber"],
                  ["Excluded", latestRun.keywordDecisions.filter((item) => !item.accepted).length, "red"],
                ].map(([label, count, tone]) => <div key={String(label)}><span className={`summary-dot summary-dot-${tone}`} /> <strong>{String(count)}</strong><small>{String(label)}</small></div>)}
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
                    {latestRun.keywordDecisions.map((keyword) => {
                      const sources = stringList(keyword.sourceSections);
                      const explicitlyExcluded = sources.includes("negative_context");
                      return (
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
                            <span style={{ color: explicitlyExcluded ? "var(--red)" : undefined }}>
                              {explicitlyExcluded ? "Excluded by posting" : "Rejected"}
                            </span>
                          ) : keyword.used ? (
                            <span style={{ color: "var(--green)" }}>Used</span>
                          ) : (
                            <span style={{ color: "var(--amber)" }}>Not placed</span>
                          )}
                        </td>
                        <td className="secondary">
                          {keyword.accepted && keyword.placement
                            ? keyword.placement.split(", ").map(humanizeReference).join(", ")
                            : "—"}
                        </td>
                        <td className="secondary" style={{ minWidth: 230 }}>
                          <div>
                            {keyword.explanation ||
                              keyword.rejectionReason ||
                              (keyword.used
                                ? "Placed using candidate evidence."
                                : "Not placed in the tailored resume.")}
                          </div>
                          {sources.length ? (
                            <div className="muted mono" style={{ marginTop: 4, fontSize: 9 }}>
                              Source: {sources.join(", ")}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {stretchLab ? (
            <section id="stretch-lab" className="panel scroll-target">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Stretch Lab</div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                    Gap-closing ideas kept outside the application-ready resume
                  </div>
                </div>
                <span className="status status-amber">Review only</span>
              </div>
              <div style={{ padding: 16, display: "grid", gap: 18 }}>
                <div
                  style={{
                    padding: 13,
                    border: "1px solid var(--amber)",
                    borderRadius: 9,
                    background: "rgba(245, 158, 11, 0.07)",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {displayValue(
                    stretchLab.disclaimer,
                    "These ideas are unverified and are never exported into the resume.",
                  )}
                </div>

                {stretchOpportunities.length ? (
                  <div>
                    <div className="eyebrow">Transferable opportunities to verify</div>
                    <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
                      {stretchOpportunities.map((item, index) => (
                        <article
                          key={`${displayValue(item.target_term)}-${index}`}
                          style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 8 }}
                        >
                          <div style={{ fontWeight: 650 }}>{displayValue(item.target_term)}</div>
                          <div className="secondary" style={{ marginTop: 5, fontSize: 11 }}>
                            {displayValue(item.rationale)}
                          </div>
                          <div className="muted" style={{ marginTop: 5, fontSize: 11 }}>
                            Review: {displayValue(item.review_question)}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                {stretchGaps.length ? (
                  <div>
                    <div className="eyebrow">Real gaps and proof needed</div>
                    <div className="audit-table-scroll" style={{ marginTop: 9 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Term</th>
                            <th>Type</th>
                            <th>Importance</th>
                            <th>What would make it usable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stretchGaps.map((gap, index) => (
                            <tr key={`${displayValue(gap.target_term)}-${index}`}>
                              <td style={{ fontWeight: 650 }}>{displayValue(gap.target_term)}</td>
                              <td className="secondary">{displayValue(gap.category, "other")}</td>
                              <td className="mono">
                                {typeof gap.hiring_importance === "number"
                                  ? Math.round(gap.hiring_importance)
                                  : "—"}
                              </td>
                              <td className="secondary" style={{ minWidth: 280 }}>
                                <div>{displayValue(gap.why_it_matters)}</div>
                                {stringList(gap.proof_needed).length ? (
                                  <ul style={{ margin: "7px 0 0", paddingLeft: 18 }}>
                                    {stringList(gap.proof_needed).map((proof) => (
                                      <li key={proof}>{proof}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {stretchProjects.length ? (
                  <div>
                    <div className="eyebrow">Proposed projects — not completed</div>
                    <div style={{ display: "grid", gap: 10, marginTop: 9 }}>
                      {stretchProjects.map((project, index) => (
                        <details
                          key={`${displayValue(project.title)}-${index}`}
                          style={{ padding: 13, border: "1px solid var(--line)", borderRadius: 9 }}
                        >
                          <summary style={{ cursor: "pointer", fontWeight: 650 }}>
                            {displayValue(project.title, "Proposed skills project")}
                          </summary>
                          <div className="secondary" style={{ marginTop: 10, fontSize: 12 }}>
                            {displayValue(project.objective)}
                          </div>
                          {stringList(project.target_terms).length ? (
                            <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                              Targets: {stringList(project.target_terms).join(", ")}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 10, fontSize: 12 }}>
                            <div className="eyebrow">Build steps</div>
                            <ol style={{ margin: "7px 0 0", paddingLeft: 19 }}>
                              {stringList(project.build_steps).map((step) => (
                                <li key={step} style={{ marginTop: 4 }}>
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>
                            Resume use only after completion: {displayValue(project.resume_language_after_completion)}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}
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
            initialNotes={application.notes || ""}
            initialFollowUpAt={application.followUpAt?.toISOString() || ""}
            hasActiveRun={hasActiveRun}
            hasResumeFiles={Boolean(application.tailoringRuns[0]?.artifacts.some((artifact) => artifact.kind === "DOCX" || artifact.kind === "PDF"))}
          />

          <div id="files" className="panel scroll-target files-panel">
            <div className="controls-heading"><div><div className="panel-title">Download files</div><div className="muted">Application-ready first; audit files below.</div></div></div>
            {resumeArtifacts.length ? (
              <div className="resume-downloads">
                {resumeArtifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={`/api/artifacts/${artifact.id}`}
                    className={artifact.kind === "DOCX" ? "resume-download resume-download-primary" : "resume-download"}
                  >
                    <span><strong>{artifact.kind === "DOCX" ? "Editable resume" : "Resume preview"}</strong><small>{artifact.fileName}</small></span>
                    <Download size={14} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted files-empty">
                Files appear after a successful local run.
              </p>
            )}
            {auditArtifacts.length ? (
              <details className="audit-files">
                <summary>Audit and machine-readable files ({auditArtifacts.length})</summary>
                <div>{auditArtifacts.map((artifact) => <a key={artifact.id} href={`/api/artifacts/${artifact.id}`}><span>{artifact.fileName}</span><Download size={13} /></a>)}</div>
              </details>
            ) : null}
          </div>

          <div className="panel" style={{ padding: 16 }}>
            <div className="panel-title">Timeline</div>
            <div className="timeline-events">
              {primaryEvents.map((event) => (
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
            {technicalEvents.length ? (
              <details className="technical-timeline">
                <summary>Show {technicalEvents.length} technical progress updates</summary>
                <div>
                  {technicalEvents.map((event) => {
                    const detail = objectRecord(event.detail);
                    return <div key={event.id}><span>{displayValue(detail?.stage, "Tailoring progress")}</span><small>{formatRelativeDate(event.occurredAt)}</small></div>;
                  })}
                </div>
              </details>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
