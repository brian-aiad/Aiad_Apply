import { cn } from "@/lib/cn";
import { titleCaseStatus } from "@/lib/format";

const color: Record<string, string> = {
  CAPTURED: "status-cyan",
  TAILORING: "status-violet",
  REVIEW: "status-amber",
  READY: "status-green",
  APPLIED: "status-green",
  INTERVIEW: "status-violet",
  CLOSED: "status-red",
  QUEUED: "status-cyan",
  RUNNING: "status-violet",
  SUCCEEDED: "status-green",
  FAILED: "status-red",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={cn("status", color[status])}>{titleCaseStatus(status)}</span>;
}
