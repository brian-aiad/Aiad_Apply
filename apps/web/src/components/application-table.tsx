import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Application, Job, TailoringRun } from "@prisma/client";
import { formatMoneyRange, formatRelativeDate } from "@/lib/format";
import { StatusPill } from "@/components/status-pill";

type Row = Application & {
  job: Job;
  tailoringRuns: TailoringRun[];
};

export function ApplicationTable({ applications }: { applications: Row[] }) {
  if (!applications.length) {
    return (
      <div className="empty-state">
        <div>
          <div style={{ fontSize: 17, fontWeight: 650 }}>No applications yet</div>
          <p className="secondary" style={{ maxWidth: 380, margin: "7px auto 18px" }}>
            Capture the first job posting to establish your clean V2 application history.
          </p>
          <Link href="/capture" className="button button-primary">
            Capture first job
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Status</th>
            <th>Location</th>
            <th>Salary</th>
            <th>Job coverage</th>
            <th>Updated</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => {
            const run = application.tailoringRuns[0];
            return (
              <tr key={application.id}>
                <td>
                  <Link
                    href={`/applications/${application.id}`}
                    style={{ display: "block", fontWeight: 650 }}
                  >
                    {application.job.title}
                  </Link>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {application.job.company}
                  </span>
                </td>
                <td>
                  <StatusPill status={application.status} />
                </td>
                <td className="secondary">{application.job.location || "Not listed"}</td>
                <td className="secondary">
                  {formatMoneyRange(
                    application.job.salaryMin,
                    application.job.salaryMax,
                    application.job.salaryText,
                  )}
                </td>
                <td>
                  {run?.keywordCoverage != null ? (
                    <span className="mono">{Math.round(run.keywordCoverage)}%</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {formatRelativeDate(application.updatedAt)}
                </td>
                <td>
                  <Link
                    href={`/applications/${application.id}`}
                    aria-label={`Open ${application.job.title}`}
                    style={{ color: "var(--text-muted)" }}
                  >
                    <ExternalLink size={15} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
