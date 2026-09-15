import type { ParsedCapture } from "@/lib/job-parser";
import type { CaptureIntelligence } from "@/lib/capture-intelligence";
import type { CaptureOverrides } from "@/lib/capture-overrides";

export type CapturePreviewData = {
  parsed: ParsedCapture;
  intelligence: CaptureIntelligence;
};

export function CapturePreview({
  data,
  overrides,
  onOverrideChange,
}: {
  data: CapturePreviewData;
  overrides: CaptureOverrides;
  onOverrideChange: (next: CaptureOverrides) => void;
}) {
  const { parsed: job, intelligence: fit } = data;
  const update = (key: keyof CaptureOverrides, value: string) =>
    onOverrideChange({ ...overrides, [key]: value });

  return (
    <section className="capture-preview" aria-label="Posting preview">
      <p className="eyebrow">Extracted posting</p>
      <h2>{job.title}</h2>
      <p className="preview-company">{job.company}</p>
      <dl className="preview-facts">
        {[
          ["Location", job.location],
          ["Workplace", job.workArrangement],
          ["Pay", job.salaryText],
          ["Employment", job.employmentType],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not identified"}</dd>
          </div>
        ))}
      </dl>

      <details className="capture-corrections">
        <summary>Correct extracted details</summary>
        <p className="field-help">
          These corrections change the saved record. The original paste remains intact.
        </p>
        <div className="capture-correction-grid">
          <label>
            Company
            <input
              className="input"
              value={overrides.company ?? job.company}
              onChange={(event) => update("company", event.target.value)}
              maxLength={200}
            />
          </label>
          <label>
            Role
            <input
              className="input"
              value={overrides.title ?? job.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={300}
            />
          </label>
          <label>
            Location
            <input
              className="input"
              value={overrides.location ?? job.location ?? ""}
              onChange={(event) => update("location", event.target.value)}
              maxLength={300}
            />
          </label>
          <label>
            Workplace
            <select
              className="select"
              value={overrides.workArrangement ?? job.workArrangement ?? ""}
              onChange={(event) => update("workArrangement", event.target.value)}
            >
              <option value="">Not identified</option>
              <option value="On-site">On-site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Remote">Remote</option>
            </select>
          </label>
          <label>
            Employment
            <select
              className="select"
              value={overrides.employmentType ?? job.employmentType ?? ""}
              onChange={(event) => update("employmentType", event.target.value)}
            >
              <option value="">Not identified</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Temporary">Temporary</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>
      </details>

      <div className="preview-recommendation">
        <p className="eyebrow">Preliminary recommendation</p>
        <h3>{fit.recommendation}</h3>
        <p className="preview-confidence">{fit.confidence}</p>
        <p>{fit.reason}</p>
        <small>
          {fit.family}. Deterministic screening against protected facts; this is not a
          hiring probability.
        </small>
      </div>

      <details open>
        <summary>Decision factors ({fit.dimensions.length})</summary>
        <div className="fit-dimensions">
          {fit.dimensions.map((item) => (
            <div className={`fit-dimension fit-dimension-${item.tone}`} key={item.key}>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </details>

      {fit.matches.length > 0 ? (
        <details open>
          <summary>Documented overlap ({fit.matches.length})</summary>
          <ul className="evidence-preview-list">
            {fit.matches.map((match) => (
              <li key={match.term}>
                <details>
                  <summary>
                    {match.term}<span>{match.importance}</span>
                  </summary>
                  <p>{match.source}</p>
                </details>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {fit.gaps.length > 0 ? (
        <details open>
          <summary>Evidence gaps ({fit.gaps.length})</summary>
          {fit.gaps.map((gap) => (
            <p key={gap.term}>
              <strong>{gap.term}</strong> <small>{gap.importance}</small>
              <br />
              {gap.reason}
            </p>
          ))}
        </details>
      ) : null}
      {fit.confirmedFacts.length > 0 ? (
        <details>
          <summary>Protected facts used ({fit.confirmedFacts.length})</summary>
          <ul>{fit.confirmedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </details>
      ) : null}
      {fit.checks.length > 0 ? (
        <details open>
          <summary>Requirements needing confirmation</summary>
          <ul>{fit.checks.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
      ) : null}
      <details>
        <summary>Posting requirements ({job.requiredQualifications.length})</summary>
        {job.requiredQualifications.length ? (
          <ul>{job.requiredQualifications.map((line) => <li key={line}>{line}</li>)}</ul>
        ) : (
          <p>No separate required-qualifications section identified.</p>
        )}
      </details>
      <details>
        <summary>Responsibilities ({job.responsibilities.length})</summary>
        <ul>{job.responsibilities.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>
      <details>
        <summary>Preferred qualifications ({job.preferredQualifications.length})</summary>
        <ul>{job.preferredQualifications.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>
    </section>
  );
}
