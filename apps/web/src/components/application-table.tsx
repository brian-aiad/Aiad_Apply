"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import type { Application, Job, TailoringRun } from "@prisma/client";
import { formatMoneyRange, formatRelativeDate, formatShortDate } from "@/lib/format";
import { StatusPill } from "@/components/status-pill";

type Row = Application & {
  job: Job;
  tailoringRuns: TailoringRun[];
};

const filters = [
  ["ALL", "All"],
  ["CAPTURED", "Captured"],
  ["TAILORING", "Tailoring"],
  ["REVIEW", "Review"],
  ["READY", "Ready"],
  ["APPLIED", "Applied"],
] as const;

export function ApplicationTable({
  applications,
  showTools = false,
}: {
  applications: Row[];
  showTools?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number][0]>("ALL");
  const [sort, setSort] = useState<"UPDATED" | "COVERAGE_HIGH" | "COVERAGE_LOW">("UPDATED");
  const [renderedAt] = useState(() => Date.now());
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      applications
        .filter((application) => {
          if (status !== "ALL" && application.status !== status) return false;
          if (!normalizedQuery) return true;
          return [application.job.title, application.job.company, application.job.location, application.job.workArrangement]
            .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
        })
        .sort((left, right) => {
          if (sort === "UPDATED") return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
          const leftCoverage = left.tailoringRuns[0]?.keywordCoverage ?? -1;
          const rightCoverage = right.tailoringRuns[0]?.keywordCoverage ?? -1;
          return sort === "COVERAGE_HIGH" ? rightCoverage - leftCoverage : leftCoverage - rightCoverage;
        }),
    [applications, normalizedQuery, sort, status],
  );

  if (!applications.length) {
    return (
      <div className="empty-state">
        <div>
          <div style={{ fontSize: 17, fontWeight: 650 }}>No applications yet</div>
          <p className="secondary" style={{ maxWidth: 380, margin: "7px auto 18px" }}>
            Paste your first job posting and AiadApply will organize the role, tailoring run,
            files, and review history in one place.
          </p>
          <Link href="/capture" className="button button-primary">
            Capture first job
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {showTools ? (
        <div className="application-tools">
          <label className="search-field">
            <Search size={15} />
            <span className="sr-only">Search applications</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search role, company, or location"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : null}
          </label>
          <div className="filter-row" role="group" aria-label="Filter applications by status">
            <SlidersHorizontal size={14} className="filter-icon" />
            {filters.map(([value, label]) => {
              const count =
                value === "ALL"
                  ? applications.length
                  : applications.filter((item) => item.status === value).length;
              return (
                <button
                  type="button"
                  key={value}
                  className={status === value ? "filter-chip filter-chip-active" : "filter-chip"}
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {label} <span>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="tools-meta">
            <label className="sort-field">
              <span>Sort</span>
              <select aria-label="Sort applications" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="UPDATED">Recently updated</option>
                <option value="COVERAGE_HIGH">Coverage: high to low</option>
                <option value="COVERAGE_LOW">Coverage: low to high</option>
              </select>
            </label>
            <div className="results-count" aria-live="polite">Showing {visible.length} of {applications.length}</div>
          </div>
        </div>
      ) : null}

      {visible.length ? (
        <div className="table-scroll">
          <table className="data-table application-table">
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
              {visible.map((application) => {
                const run = application.tailoringRuns[0];
                const followUp = application.followUpAt ? new Date(application.followUpAt) : null;
                const followUpOverdue = followUp ? followUp.getTime() < renderedAt : false;
                return (
                  <tr key={application.id}>
                    <td data-label="Role">
                      <Link href={`/applications/${application.id}`} className="application-role-link">
                        {application.job.title}
                      </Link>
                      <span className="muted application-company">{application.job.company}</span>
                    </td>
                    <td data-label="Status"><StatusPill status={application.status} /></td>
                    <td data-label="Location" className="secondary application-location">
                      {application.job.location || "Not listed"}
                    </td>
                    <td data-label="Salary" className="secondary">
                      {formatMoneyRange(application.job.salaryMin, application.job.salaryMax, application.job.salaryText)}
                    </td>
                    <td data-label="Job coverage">
                      {run?.keywordCoverage != null ? (
                        <span className="coverage-value"><span style={{ width: `${Math.min(100, Math.max(0, run.keywordCoverage))}%` }} />{Math.round(run.keywordCoverage)}%</span>
                      ) : <span className="muted">Not tailored</span>}
                    </td>
                    <td data-label="Updated" className="muted application-updated">
                      {formatRelativeDate(new Date(application.updatedAt))}
                      {followUp ? <span className={followUpOverdue ? "follow-up follow-up-overdue" : "follow-up"}>Follow up {formatShortDate(followUp)}</span> : null}
                    </td>
                    <td className="application-open-cell">
                      <Link href={`/applications/${application.id}`} aria-label={`Open ${application.job.title}`} className="icon-link">
                        <ExternalLink size={15} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state filtered-empty">
          <div>
            <div style={{ fontWeight: 650 }}>No applications match</div>
            <p className="muted" style={{ margin: "6px 0 16px" }}>Clear the search or choose another status.</p>
            <button className="button" type="button" onClick={() => { setQuery(""); setStatus("ALL"); }}>Clear filters</button>
          </div>
        </div>
      )}
    </>
  );
}
