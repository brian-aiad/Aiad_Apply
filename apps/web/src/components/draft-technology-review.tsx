import { humanizeParagraph, type TechnologyReview } from "@/lib/technology-review";

export function DraftTechnologyReview({ review }: { review: TechnologyReview }) {
  const { hasOmissions } = review;
  if (!review.aggressive && !hasOmissions) return null;
  if (!review.draftTerms.length && !hasOmissions && review.requiredTotal === null) return null;
  return (
    <section className="panel" aria-label="Draft technology review" style={{ marginTop: 16, padding: 18, overflowWrap: "anywhere", display: "grid", gap: 10 }}>
      <strong>{review.aggressive ? "Earlier draft · unverified project technologies" : "Some supported placements still need editing"}</strong>
      {review.requiredTotal !== null ? <p className="secondary">{review.requiredPlaced} of {review.requiredTotal} technologies targeted by the earlier policy appear in project bullets.</p> : null}
      {review.missingProjectTerms.length > 0 ? <p className="secondary"><strong>Earlier draft omitted:</strong> {review.missingProjectTerms.join(", ")}. These were hypothetical targets; do not add them merely to satisfy the earlier coverage score.</p> : null}
      {review.missingSupportedTerms.length > 0 ? <p className="secondary"><strong>Missing supported placements:</strong> {review.missingSupportedTerms.join(", ")}. Review the technology coverage table for the required context.</p> : null}
      {review.omissionWarnings.map(message => <p className="muted" key={message}>{message}</p>)}
      {review.aggressive && review.draftTerms.length > 0 ? <>
        <p className="secondary">Review these unverified project implementations before applying: {review.draftTerms.join(", ")}.</p>
        <p className="muted">This version used the earlier policy that inserted hypothetical project tools. These claims are unverified. Tailor again to use the current experience-based policy, or correct the downloaded DOCX before applying.</p>
        <details>
          <summary style={{ cursor: "pointer" }}>Read the final project wording ({review.paragraphs.length} {review.paragraphs.length === 1 ? "bullet" : "bullets"})</summary>
          {review.paragraphs.map(paragraph => <div key={paragraph.paragraphId} style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
            <strong>{humanizeParagraph(paragraph.paragraphId)}</strong>
            <p className="muted" style={{ marginTop: 8 }}>Unverified draft usage: {paragraph.terms.join(", ")}</p>
            <p className="secondary" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{paragraph.finalText || "Final paragraph text was not saved for this version. Check the downloaded DOCX."}</p>
          </div>)}
        </details>
      </> : null}
    </section>
  );
}
