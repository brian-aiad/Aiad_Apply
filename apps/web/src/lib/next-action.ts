type ActionCandidate = {
  id: string;
  status: string;
  automationStatus?: string | null;
  referralOnly?: boolean;
  job: { company: string; title: string };
  tailoringRuns: { status: string; errorMessage: string | null }[];
};

type FollowUpCandidate = {
  id: string;
  job: { company: string; title: string };
};

export type NextAction = {
  kind: "recovery" | "referral" | "commitment" | "follow_up" | "apply" | "review" | "retry" | "tailor" | "wait" | "discover";
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
  commitments = [],
  now = new Date(),
}: {
  followUps: FollowUpCandidate[];
  applications: ActionCandidate[];
  strongDiscoveries: number;
  workerAvailable?: boolean;
  commitments?: (FollowUpCandidate & { dueAt: Date })[];
  now?: Date;
}): NextAction {
  const urgent = commitments.filter(item => item.dueAt.getTime() >= now.getTime() - 86400000 && item.dueAt.getTime() <= now.getTime() + 48 * 3600000)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
  if (urgent) return { kind: "commitment", href: `/applications/${urgent.id}`, label: `Prepare for ${urgent.job.company}`, note: `${urgent.job.title}. A dated interview or application commitment needs attention.`, actionLabel: "Open commitment" };

  const inStatus = (status: string) => applications.find((item) => item.status === status);
  const ready = applications.find(item => item.status === "READY" && !item.referralOnly && (!item.automationStatus || item.automationStatus === "CANCELED"));
  if (ready) {
    return {
      kind: "apply",
      href: `/applications/${ready.id}?tab=apply`,
      label: `Apply to ${ready.job.company}`,
      note: `${ready.job.title}. Open the reviewed resume and application handoff.`,
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

  const uncertain = applications.find(item => item.automationStatus === "UNKNOWN");
  if (uncertain) return { kind: "recovery", href: `/applications/${uncertain.id}?tab=apply`, label: `Check submission for ${uncertain.job.company}`, note: "The employer receipt is unresolved. Inspect the existing attempt before any retry.", actionLabel: "Check existing attempt" };
  const referral = applications.find(item => item.referralOnly && item.status === "READY");
  if (referral) return { kind: "referral", href: `/applications/${referral.id}?tab=role`, label: `Prepare referral for ${referral.job.company}`, note: "This employer is reserved for your referral contact. Review the posting and resume for that handoff.", actionLabel: "Open referral material" };

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
