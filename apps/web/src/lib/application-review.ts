import type { TechnologyReview } from "./technology-review";

type ReviewRun = {
  status: string;
  validationPassed: boolean | null;
  riskCount: number;
  errorMessage?: string | null;
  artifacts: { kind: string }[];
};

export function hasValidatedResume(run: Pick<ReviewRun, "status" | "validationPassed" | "artifacts">) {
  return run.status === "SUCCEEDED" && run.validationPassed === true
    && run.artifacts.some(artifact => ["DOCX", "PDF"].includes(artifact.kind));
}

export function isRunActive(run?: { status: string }) {
  return Boolean(run && ["QUEUED", "RUNNING"].includes(run.status));
}

export function buildReviewGuide({ run, technology, historical, applicationStatus, progressStage, hasPreviousResume }: {
  run?: ReviewRun;
  technology: TechnologyReview;
  historical: boolean;
  applicationStatus: string;
  progressStage?: string | null;
  hasPreviousResume: boolean;
}): { headline: string; copy: string; tone: "neutral" | "warning" | "danger" | "success" } {
  if (!run) return { headline: "Tailor this posting when you are ready", copy: "Every tailored version is generated from your protected base. The base is never overwritten.", tone: "neutral" };
  if (isRunActive(run)) return {
    headline: run.status === "QUEUED" ? "This version is queued for tailoring" : "Tailoring is in progress",
    copy: progressStage || "The audit and files will appear here automatically.", tone: "neutral",
  };
  if (run.status === "FAILED") return {
    headline: "This run needs attention",
    copy: hasPreviousResume ? "This run failed. A validated version remains available in Resume versions." : run.errorMessage || "Read the failure details below, then try the run again.", tone: "danger",
  };
  if (run.validationPassed !== true) return { headline: "This version needs validation review", copy: "Check the validation results before using this version.", tone: "warning" };
  if (technology.hasOmissions) return {
    headline: "Edit missing technology placements",
    copy: "Review the missing placements below and update the editable DOCX before applying. A successful export does not mean every project requirement is covered.", tone: "warning",
  };
  // Application status describes the application, not an older selected resume.
  if (!historical && ["APPLIED", "INTERVIEW", "CLOSED"].includes(applicationStatus)) return {
    headline: applicationStatus === "APPLIED" ? "Application submitted" : applicationStatus === "INTERVIEW" ? "Interview in progress" : "Application closed",
    copy: "Update notes and follow-up details in Application details. This version’s review remains available below.", tone: "success",
  };
  if (technology.aggressive) return {
    headline: historical ? "Review this saved draft" : "Review your tailored draft",
    copy: "Review the added technologies and adjust the downloaded DOCX before applying.", tone: "warning",
  };
  if (run.riskCount > 0) return {
    headline: `Review ${run.riskCount} flagged ${run.riskCount === 1 ? "item" : "items"}`,
    copy: "Inspect the exact changes and review flags for this version before applying.", tone: "warning",
  };
  if (!historical && applicationStatus === "READY" && hasValidatedResume(run)) return {
    headline: "Resume reviewed and ready", copy: "Download the DOCX or PDF, then update the status after you apply.", tone: "success",
  };
  return { headline: historical ? "Review this saved version" : "Review the tailored resume", copy: "Inspect this version’s changes and files before using it.", tone: "neutral" };
}
