export const DEFAULT_FOLLOW_UP_DAYS = 7;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function automaticFollowUpAt(
  appliedAt: Date,
  followUpDays = DEFAULT_FOLLOW_UP_DAYS,
) {
  return new Date(appliedAt.getTime() + followUpDays * DAY_MILLISECONDS);
}

export function resolveFollowUpUpdate({
  currentStatus,
  nextStatus,
  currentFollowUpAt,
  requestedFollowUpAt,
  now,
  followUpDays,
}: {
  currentStatus: string;
  nextStatus: string | undefined;
  currentFollowUpAt: Date | null;
  requestedFollowUpAt: Date | null | undefined;
  now: Date;
  followUpDays: number;
}) {
  if (requestedFollowUpAt instanceof Date) {
    return { followUpAt: requestedFollowUpAt, automaticallyScheduled: false };
  }

  const transitioningToApplied =
    nextStatus === "APPLIED" && currentStatus !== "APPLIED";
  if (transitioningToApplied) {
    if (currentFollowUpAt) {
      return { followUpAt: currentFollowUpAt, automaticallyScheduled: false };
    }
    return {
      followUpAt: automaticFollowUpAt(now, followUpDays),
      automaticallyScheduled: true,
    };
  }

  if (requestedFollowUpAt === null) {
    return { followUpAt: null, automaticallyScheduled: false };
  }
  return { followUpAt: undefined, automaticallyScheduled: false };
}
