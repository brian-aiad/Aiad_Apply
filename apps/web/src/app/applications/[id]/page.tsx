import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { establishedTechnology, savedEvidenceStatus } from "@/lib/stretch-review";
import { applicationEvidence } from "@/lib/application-evidence";
import { ApplicationApply } from "@/components/application-apply";
import { applicationDestination, applicationPortal, handoffBlockers, reviewedArtifactMatches } from "@/lib/application-handoff";
import { formatJobLocation } from "@/lib/format";
import { ResumeChangeReview } from "@/components/resume-change-review";
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
import { DraftTechnologyReview } from "@/components/draft-technology-review";
import { StretchLabReview } from "@/components/stretch-lab-review";
import { EvidenceDecision } from "@/components/evidence-decision";
import { ApplicationStatusPill } from "@/components/application-status-pill";
import { ApplicationWorkspaceTabs } from "@/components/application-workspace-tabs";
import { RunAutoRefresh } from "@/components/run-auto-refresh";
import { RunVersionSelect } from "@/components/run-version-select";
import { ResumePreview } from "@/components/resume-preview";
import { StatusPill } from "@/components/status-pill";
import { formatMoneyRange, formatRelativeDate, titleCaseStatus } from "@/lib/format";
import { getApplication } from "@/lib/queries";
import { buildTechnologyReview, technologySummary } from "@/lib/technology-review";
import { buildReviewGuide, hasValidatedResume, isRunActive } from "@/lib/application-review";

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

function demonstratedInWork(keyword: { explanation: string | null }) {
  return keyword.explanation?.startsWith("Demonstrated by documented work") === true;
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
  searchParams: Promise<{ run?: string; tab?: string }>;
}) {
  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();
  let sharedProfile: Record<string, unknown> = {};
  try {
    sharedProfile = objectRecord(JSON.parse(await fs.readFile(path.resolve(process.cwd(), "../../data/profile/Brian_Aiad_PROFILE.json"), "utf8"))) ?? {};
  } catch { /* Historical exports remain available when the local profile is unavailable. */ }
  const activeRun = application.tailoringRuns.find(isRunActive);
  const { run: selectedRunId, tab: requestedTab } = await searchParams;
  const selectedRun = selectedRunId ? application.tailoringRuns.find((run) => run.id === selectedRunId) : undefined;
  const latestRun = selectedRun ?? activeRun ?? application.tailoringRuns[0];
  const previousUsableRun = application.tailoringRuns.find(
    (run) =>
      run.id !== latestRun?.id &&
      hasValidatedResume(run),
  );
  const historicalRun = Boolean(selectedRun && selectedRun.id !== application.tailoringRuns[0]?.id);
  const reportSnapshot = objectRecord(latestRun?.reportSnapshot);
  const modelUsage = objectList(reportSnapshot?.model_usage);
  const usageTotal = (key: string) => modelUsage.length && modelUsage.every((call) => typeof call[key] === "number") ? modelUsage.reduce((sum, call) => sum + Number(call[key]), 0).toLocaleString() : "Not recorded";
  const tailoringSummary = objectRecord(reportSnapshot?.tailoring_summary);
  const technologyCoverage = objectList(reportSnapshot?.keyword_coverage);
  const technologyAssessments = objectList(reportSnapshot?.technology_assessments);
  const aggressiveDraft = reportSnapshot?.tailoring_mode === "aggressive_draft";
  const technologyReview = buildTechnologyReview(reportSnapshot, latestRun?.changes);
  const addedTermsByParagraph = new Map(objectList(reportSnapshot?.changes).filter((change) => Array.isArray(change.added_terms)).map((change) => [displayValue(change.paragraph_id), stringList(change.added_terms)]));
  const newlyRepresentedTerms = stringList(tailoringSummary?.newly_represented_terms);
  const stretchLab = objectRecord(reportSnapshot?.stretch_lab);
  const stretchOpportunities = objectList(stretchLab?.transferable_opportunities);
  const stretchGaps = objectList(stretchLab?.gaps);
  const stretchProjects = objectList(stretchLab?.proposed_projects);
  const captureMetadata = objectRecord(application.job.extractedMetadata);
  const capturedFit = objectRecord(captureMetadata?.captureIntelligence);
  const capturedFitDimensions = objectList(capturedFit?.dimensions);
  const correctedCaptureFields = stringList(captureMetadata?.correctedFields);
  const visibleChanges =
    latestRun?.changes.filter((change) => change.beforeText !== change.finalText) ?? [];
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
  const keywordDecisions = [...(latestRun?.keywordDecisions ?? [])].sort((left, right) => {
    const opportunity = (item: typeof left) => item.accepted && !item.used && item.evidenceLevel !== "UNSUPPORTED" ? 1 : 0;
    return opportunity(right) - opportunity(left) || right.hiringImportance - left.hiringImportance;
  });
  const hasAcceptedResume = application.tailoringRuns.some(hasValidatedResume);
  const stateDefaultTab = latestRun?.status === "SUCCEEDED" ? "changes" : "role";
  const normalizedRequestedTab = requestedTab === "keywords" ? "changes" : requestedTab;
  const requestedWorkspaceTab = ["changes", "role", "stretch-lab", "apply"].includes(normalizedRequestedTab || "")
    ? normalizedRequestedTab as "changes" | "role" | "stretch-lab" | "apply"
    : stateDefaultTab;
  const defaultWorkspaceTab = requestedWorkspaceTab === "stretch-lab" && !stretchLab
      ? stateDefaultTab
      : requestedWorkspaceTab;
  const destination = applicationDestination(application.job.applyUrl, application.job.sourceUrl);
  const applyPdf = latestRun?.artifacts.find(a => a.kind === "PDF");
  const preparedEvent = application.events.find(e => e.eventType === "application_prepared");
  const reviewGuide = buildReviewGuide({
    run: latestRun,
    technology: technologyReview,
    historical: historicalRun,
    applicationStatus: application.status,
    progressStage,
    hasPreviousResume: Boolean(previousUsableRun),
  });

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
        className="application-layout page-heading application-sticky-header application-heading"
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
              {formatJobLocation(application.job.location)}
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
          <RunVersionSelect applicationId={id} selectedRunId={latestRun?.id || ""} runs={application.tailoringRuns.map((run) => ({ id: run.id, runNumber: run.runNumber, status: run.status, sendable: hasValidatedResume(run) }))} />
          {historicalRun ? <p className="field-help">Viewing an earlier version. Application status and new tailoring actions still apply to the current application.</p> : null}
        </section>
      ) : null}
      {activeRun && activeRun.id !== latestRun?.id ? <p className="field-help">Another version is being tailored. <Link href={`/applications/${id}?run=${activeRun.id}`}>View run {activeRun.runNumber}</Link>. This saved version remains available below.</p> : null}
      <section className="review-guide" aria-labelledby="review-guide-title">
        <div className="review-guide-copy">
          {reviewGuide.tone === "success" ? <Check size={20} color="var(--green)" />
            : reviewGuide.tone === "neutral" ? <WandSparkles size={20} color="var(--muted)" />
            : <CircleAlert size={20} color={reviewGuide.tone === "danger" ? "var(--red)" : "var(--amber)"} />}
          <div><div className="eyebrow">Your next decision</div><h2 id="review-guide-title">{reviewGuide.headline}</h2><p>{reviewGuide.copy}</p></div>
        </div>
        <div className="review-primary-actions">
          {applyPdf ? <ResumePreview key={applyPdf.id} artifactId={applyPdf.id} fileName={applyPdf.fileName} /> : null}
          {resumeArtifacts.map((artifact) => (
            <a key={artifact.id} href={`/api/artifacts/${artifact.id}`} className={artifact.kind === "DOCX" ? "button button-primary" : "button"}>
              <Download size={14} />{artifact.kind}
            </a>
          ))}
          {application.job.sourceUrl ? <a href={application.job.sourceUrl} className="button" target="_blank" rel="noreferrer">Open posting<ExternalLink size={14} /></a> : null}
        </div>
        {latestRun?.status === "SUCCEEDED" ? (
          <div className="review-checks">
            {typeof tailoringSummary?.substantive_bullets_rewritten === "number" && typeof tailoringSummary?.relevant_bullets === "number" ? <span className="review-check review-check-done" title="Sentence-level rewrites of relevant existing bullets, excluding punctuation and tiny synonym changes.">{tailoringSummary.substantive_bullets_rewritten} substantive bullet changes</span> : null}
            <span className="review-check">{visibleChanges.filter((change) => change.paragraphKind === "bullet" && change.section.startsWith("experience.")).length} experience bullets edited</span>
            <span className="review-check">{visibleChanges.filter((change) => change.paragraphKind === "bullet" && change.section.startsWith("projects.")).length} project bullets edited</span>
            <span className="review-check">{visibleChanges.filter((change) => change.section === "skills").length} skills rows edited</span>
            {visibleChanges.some((change) => change.paragraphId === "summary") ? <span className="review-check">Summary tailored</span> : null}
            <span className="review-check">{latestRun.keywordDecisions.filter((keyword) => keyword.used && keyword.accepted).length} {aggressiveDraft ? "job terms represented" : "supported terms represented"}</span>
            {tailoringSummary ? <span className="review-check" title={newlyRepresentedTerms.join(", ")}>{newlyRepresentedTerms.length} terms newly added</span> : null}
            <span className="review-check">{latestRun.keywordDecisions.filter((keyword) => !keyword.used && keyword.evidenceLevel === "UNSUPPORTED").length} unsupported terms excluded</span>
            <span className={latestRun.pageCount === 1 ? "review-check review-check-done" : "review-check review-check-warning"}>{latestRun.pageCount === 1 ? "1 page confirmed" : "Page count needs review"}</span>
            <span className={latestRun.riskCount === 0 ? "review-check review-check-done" : "review-check review-check-warning"}>{latestRun.riskCount === 0 ? <Check size={13} /> : <CircleAlert size={13} />}{latestRun.riskCount} flags</span>
          </div>
        ) : null}
      </section>
      <DraftTechnologyReview review={technologyReview} />
      {modelUsage.length ? <details className="model-usage"><summary>Tailoring time & token use</summary><dl><dt>Model</dt><dd>{[...new Set(modelUsage.map(call => displayValue(call.model, "Not recorded")))].join(", ")}</dd><dt>Model calls</dt><dd>{modelUsage.length}</dd><dt>Input tokens</dt><dd>{usageTotal("input_tokens")}</dd><dt>Cached input (included above)</dt><dd>{usageTotal("cached_input_tokens")}</dd><dt>Output tokens</dt><dd>{usageTotal("output_tokens")}</dd><dt>Model time</dt><dd>{Math.round(modelUsage.reduce((sum, call) => sum + Number(call.duration_seconds || 0), 0))} seconds</dd></dl><p>Includes correction calls. Missing usage is shown as unrecorded.</p></details> : null}

      <ApplicationWorkspaceTabs
        defaultTab={defaultWorkspaceTab}
        showKeywords={keywordDecisions.length > 0}
        showStretchLab={Boolean(stretchLab)}
      />

      <div
        className="application-detail-grid"
        style={{
          marginTop: 24,
        }}
      >
        <div className="application-main-stack">
          <ApplicationApply key={`${id}:${latestRun?.id || "none"}`} id={id} runId={latestRun?.id || ""} runNumber={latestRun?.runNumber || 0}
            evidence={latestRun?.validationPassed && !aggressiveDraft ? applicationEvidence(latestRun.changes) : []} destination={destination} portal={applicationPortal(destination)} blockers={handoffBlockers(application.status, latestRun, hasActiveRun, destination)}
            reviewed={reviewedArtifactMatches(preparedEvent?.detail, latestRun?.id || "", applyPdf?.sha256 || "")}
            submitted={["APPLIED", "INTERVIEW"].includes(application.status)} pdfId={applyPdf?.id || null} resumeSha256={applyPdf?.sha256 || ""} fileName={applyPdf?.fileName || ""} hidden={defaultWorkspaceTab !== "apply"} />
          {latestRun ? (
            <section id="provenance" className="panel scroll-target provenance-panel">
              <details>
              <summary><span className="panel-title">Truth and AI provenance</span><span className="muted">Verified safeguards and run details</span></summary>
              <p
                className="secondary"
                style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.65 }}
              >
                The local worker grades the posting, retrieves evidence from the protected
                base resume and candidate profile, and asks the authenticated Codex CLI for
                a structured rewrite plan. No OpenAI, Anthropic, Gemini, or Azure AI API key
                is used. Deterministic checks reject invented metrics, employers, titles,
                dates, and credentials before export. {aggressiveDraft ? "Job technologies can be added automatically as draft assumptions, with each unverified placement marked for review." : "Tools and role requirements are checked against candidate evidence."}
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
              </details>
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
              {!application.job.sourceUrl ? (
                <span className="muted" style={{ fontSize: 11 }}>
                  URL can be added later
                </span>
              ) : null}
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
                <div className="panel-title">What changed in your resume</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  Full paragraphs, in resume order, with keywords added to each change
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
            ) : isRunActive(latestRun) ? (
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
              <ResumeChangeReview
                changes={latestRun.changes}
                reportOrder={objectList(reportSnapshot?.changes).map(change => displayValue(change.paragraph_id))}
                addedTerms={addedTermsByParagraph}
              />
            )}
          </section>

          {technologyCoverage.length ? <section id="technology-coverage" className="panel" aria-label="Technology coverage">
            <div className="panel-header"><div><div className="panel-title">Technology coverage</div>
              <p className="muted">Every posting’s languages, tools, and methods, with their exact final placement. {aggressiveDraft ? "Technologies are adapted automatically. Review draft assumptions and edit your downloaded DOCX as needed." : "Established technical skills are woven into matching work or project bullets when the posting requests them. Everyday tools are used where relevant. Specialized systems and specific implementations still need evidence. Saved profile updates apply to new runs; this version’s placements remain unchanged."}</p>
            </div></div>
            <div className="keyword-table-scroll"><table className="data-table"><thead><tr><th>Technology / method</th><th>Coverage</th><th>Final placement</th><th>Experience</th></tr></thead>
              <tbody>{technologyCoverage.map(row => {
                const term = displayValue(row.term);
                const summary = technologySummary(term, reportSnapshot?.technology_summaries);
                const status = displayValue(row.status);
                const savedStatus = savedEvidenceStatus(sharedProfile, term);
                const established = savedStatus !== "rejected" && (row.automatic_technical_use === true || establishedTechnology(sharedProfile, term));
                const assessment = technologyAssessments.find(item => displayValue(item.term).toLowerCase() === term.toLowerCase());
                const omittedSpecialist = status === "needs_confirmation" && assessment?.classification === "specialized_or_advanced";
                const confirmedSinceRun = status === "needs_confirmation" && savedStatus === "confirmed";
                const labels: Record<string, string> = { in_context: "In relevant bullets", available: "Known · not included", skills_only: "Skills only", credential_only: "Credential only", covered: "Covered", missing_supported: "Missing supported term", needs_confirmation: "Confirm experience", excluded: "Excluded from this resume", draft_assumption: "Draft addition · review", missing_draft: "Not included in draft" };
                return <tr key={term}><td><strong>{term}</strong>{summary ? <p className="muted" style={{ marginTop: 6, maxWidth: "30ch", fontWeight: 400 }}>{summary}</p> : null}</td><td>{omittedSpecialist ? "Not added · specialized" : confirmedSinceRun ? "Known · not in this version" : labels[status] || status}</td>
                  <td>{stringList(row.placements).map(humanizeReference).join(", ") || "Not included"}<p className="muted">{omittedSpecialist ? displayValue(assessment?.reasoning) : established && status !== "in_context" ? "Already established. New tailoring places this in a matching duty automatically; this saved version’s text is unchanged." : confirmedSinceRun ? "Knowledge is saved. Tailor again to use it where relevant; this saved resume predates that confirmation." : displayValue(row.explanation)}</p>{assessment ? <details><summary>Why this technology was handled this way</summary><p className="muted">{displayValue(assessment.reasoning)} {displayValue(assessment.usage_boundary)}</p></details> : null}</td>
                  <td>{established ? <><span className="muted">Established · automatic</span><details><summary>Correct this</summary><EvidenceDecision term={term} category={displayValue(row.category, "technology")} initialDecision={savedStatus || "confirmed"} /></details></> : !aggressiveDraft && ["skills_only", "needs_confirmation", "credential_only", "covered"].includes(status)
                    ? <EvidenceDecision term={term} category={displayValue(row.category, "technology")} initialDecision={savedStatus} /> : null}</td>
                </tr>;
              })}</tbody>
            </table></div>
          </section> : null}

          {keywordDecisions.length ? (
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
                  [aggressiveDraft ? "Included in draft" : "Used safely", keywordDecisions.filter((item) => item.used).length, "green"],
                  ["Demonstrated in work", keywordDecisions.filter((item) => item.accepted && !item.used && demonstratedInWork(item)).length, "green"],
                  ["Could be represented", keywordDecisions.filter((item) => item.accepted && !item.used && !demonstratedInWork(item) && item.evidenceLevel !== "UNSUPPORTED").length, "cyan"],
                  ["Needs proof", keywordDecisions.filter((item) => item.accepted && item.evidenceLevel === "UNSUPPORTED").length, "amber"],
                  ["Excluded", keywordDecisions.filter((item) => !item.accepted).length, "red"],
                ].map(([label, count, tone]) => <div key={String(label)}><span className={`summary-dot summary-dot-${tone}`} /> <strong>{String(count)}</strong><small>{String(label)}</small></div>)}
              </div>
              <div className="keyword-table-scroll">
                <table className="data-table keyword-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Importance</th>
                      <th>Evidence</th>
                      <th>Decision</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywordDecisions.map((keyword) => {
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
                          ) : demonstratedInWork(keyword) ? (
                            <span style={{ color: "var(--green)" }}>Demonstrated in work</span>
                          ) : keyword.evidenceLevel !== "UNSUPPORTED" ? (
                            <span style={{ color: "var(--cyan)" }}>Could be represented</span>
                          ) : (
                            <span style={{ color: "var(--amber)" }}>Not placed</span>
                          )}
                        </td>
                        <td className="secondary keyword-result">
                          {keyword.accepted && keyword.placement ? (
                            <div className="keyword-placement">
                              {keyword.placement.split(", ").map(humanizeReference).join(", ")}
                            </div>
                          ) : null}
                          <div>
                            {(demonstratedInWork(keyword) ? keyword.explanation?.replaceAll("experience.original_insurance", "Original Insurance").replaceAll("experience.csulb", "Cal State Long Beach").replaceAll("experience.wehelp", "WeHelp").replaceAll("projects.loavenly", "Loavenly").replace(/\.bullet\.(\d+)/g, " · bullet $1") : keyword.explanation) ||
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
                    {aggressiveDraft ? "Ideas for developing the technologies adapted in your draft" : "Gap-closing ideas kept outside the application-ready resume"}
                  </div>
                </div>
                <span className="status status-amber">Review only</span>
              </div>
              <StretchLabReview opportunities={stretchOpportunities} gaps={stretchGaps} projects={stretchProjects} keywords={keywordDecisions} runNumber={latestRun?.runNumber || 0} automaticTerms={technologyCoverage.filter(row => row.automatic_technical_use === true).map(row => displayValue(row.term))} />
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
            hasResumeFiles={hasAcceptedResume}
          />

          <div id="files" className="panel scroll-target files-panel">
            <div className="controls-heading"><div><div className="panel-title">Download files</div><div className="muted">Application-ready first; audit files below.</div></div></div>
            {resumeArtifacts.length ? (
              <div className="resume-downloads">
                {applyPdf ? <ResumePreview key={applyPdf.id} artifactId={applyPdf.id} fileName={applyPdf.fileName} /> : null}
                {resumeArtifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={`/api/artifacts/${artifact.id}`}
                    className={artifact.kind === "DOCX" ? "resume-download resume-download-primary" : "resume-download"}
                  >
                    <span><strong>{artifact.kind === "DOCX" ? "Editable resume" : "Download PDF"}</strong><small>{artifact.fileName}</small></span>
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

          <details className="panel timeline-panel" open={hasActiveRun}>
            <summary><span className="panel-title">Timeline</span><span className="muted">{primaryEvents.length} events</span></summary>
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
                    {(() => {
                      const detail = objectRecord(event.detail);
                      if (!["application_prepared", "application_submitted"].includes(event.eventType)) return null;
                      return <div className="field-help">
                        {typeof detail?.runNumber === "number" ? `Resume version ${detail.runNumber}` : null}
                        {typeof detail?.confirmation === "string" ? detail.confirmation : null}
                        {typeof detail?.runId === "string" ? <div><Link href={`/applications/${id}?run=${detail.runId}&tab=apply`}>View recorded resume version</Link></div> : null}
                      </div>;
                    })()}
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
          </details>
        </aside>
      </div>
    </div>
  );
}
