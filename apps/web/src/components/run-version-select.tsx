"use client";

import { useRouter } from "next/navigation";

export function RunVersionSelect({
  applicationId,
  selectedRunId,
  runs,
}: {
  applicationId: string;
  selectedRunId: string;
  runs: { id: string; runNumber: number; status: string; sendable: boolean }[];
}) {
  const router = useRouter();
  const latestAcceptedId = runs.find((run) => run.sendable)?.id;

  return (
    <label className="run-version-select">
      <span>Resume version</span>
      <select
        className="select"
        value={selectedRunId}
        onChange={(event) => {
          const url = new URL(window.location.href);
          url.searchParams.set("run", event.target.value);
          router.push(`/applications/${applicationId}${url.search}${url.hash}`, {
            scroll: false,
          });
        }}
      >
        {runs.map((run, index) => (
          <option key={run.id} value={run.id}>
            {run.id === latestAcceptedId ? "Latest accepted · " : index === 0 ? "Newest · " : ""}
            Run {run.runNumber} · {run.status.toLowerCase()}{run.sendable ? "" : " · not sendable"}
          </option>
        ))}
      </select>
    </label>
  );
}
