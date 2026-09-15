type ActionCandidate = {
  id: string;
  status: string;
  job: { company: string; title: string };
  tailoringRuns: { status: string; errorMessage: string | null }[];
};

type FollowUpCandidate = {
  id: string;
  job: { company: string; title: string };
};

export type NextAction = {
  kind: "follow_up" | "apply" | "review" | "retry" | "tailor" | "wait" | "discover";
  href: string;
  label: string;
  note: string;
  actionLabel: string;
};

export function chooseNextAction({
  followUps,
  applications,
  strongDiscoveries,
  workerAvailable = true,
}: {
  followUps: FollowUpCandidate[];
  applications: ActionCandidate[];
  strongDiscoveries: number;
  workerAvailable?: boolean;
}): NextAction {
  const followUp = followUps[0];
  if (followUp) {
    return {
      kind: "follow_up",
      href: `/applications/${followUp.id}`,
      label: `Follow up with ${followUp.job.company}`,
      note: `${followUp.job.title}. The reminder is due; review your notes and record the follow-up.`,
      actionLabel: "Open follow-up",
    };
  }

  const inStatus = (status: string) => applications.find((item) => item.status === status);
  const ready = inStatus("READY");
  if (ready) {
    return {
      kind: "apply",
      href: `/applications/${ready.id}`,
      label: `Apply to ${ready.job.company}`,
      note: `${ready.job.title}. The resume is reviewed and ready to download.`,
      actionLabel: "Open ready application",
    };
  }

  const review = inStatus("REVIEW");
  if (review) {
    return {
      kind: "review",
      href: `/applications/${review.id}`,
      label: `Review the resume for ${review.job.company}`,
      note: review.job.title,
      actionLabel: "Review resume",
    };
  }

  const failed = applications.find((item) => item.tailoringRuns[0]?.status === "FAILED");
  if (failed) {
    return {
      kind: "retry",
      href: `/applications/${failed.id}`,
      label: `Retry tailoring for ${failed.job.company}`,
      note: failed.tailoringRuns[0]?.errorMessage || `${failed.job.title}. The last run failed and needs attention.`,
      actionLabel: "Review failure",
    };
  }

  const active = inStatus("TAILORING");
  if (active && !workerAvailable) {
    return {
      kind: "wait",
      href: `/applications/${active.id}`,
      label: `Waiting to tailor for ${active.job.company}`,
      note: `${active.job.title}. Your job is saved and will start when the local resume worker reconnects.`,
      actionLabel: "View queued run",
    };
  }

  const captured = inStatus("CAPTURED");
  if (captured) {
    return {
      kind: "tailor",
      href: `/applications/${captured.id}`,
      label: `Tailor for ${captured.job.company}`,
      note: captured.job.title,
      actionLabel: "Open saved job",
    };
  }

  if (active) {
    return {
      kind: "wait",
      href: `/applications/${active.id}`,
      label: `Tailoring ${active.job.company}`,
      note: `${active.job.title}. Open the run to see its current stage.`,
      actionLabel: "View progress",
    };
  }

  return {
    kind: "discover",
    href: "/discover",
    label: strongDiscoveries
      ? `Review ${strongDiscoveries} strong ${strongDiscoveries === 1 ? "opening" : "openings"}`
      : "Choose your next opportunity",
    note: strongDiscoveries
      ? "These openings cleared your current location, pay, employment, and evidence checks."
      : "Review local openings matched to your support and IT experience.",
    actionLabel: "Explore openings",
  };
}
