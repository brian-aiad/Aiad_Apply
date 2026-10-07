import type { ResumeChange } from "@prisma/client";
import { PhraseDiff } from "@/components/phrase-diff";
import { groupResumeChanges, reviewParagraphLabel } from "@/lib/resume-review";
import { isSkillsReorder } from "@/lib/keyword-diff";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function ResumeChangeReview({ changes, reportOrder, addedTerms }: {
  changes: ResumeChange[];
  reportOrder: string[];
  addedTerms: Map<string, string[]>;
}) {
  const groups = groupResumeChanges(changes, reportOrder);
  const unchanged = changes.filter(change => change.beforeText === change.finalText && change.changeType !== "unchanged").length;
  return <div className="resume-review">
    <div className="review-reading-guide">
      <p>Follow your resume from top to bottom. Each card shows the complete original and final text.</p>
      <p className="muted"><del>Removed words</del> · <ins>Added words</ins> · Purple boxes match the keyword chips and show posting terms newly added to that paragraph.</p>
    </div>
    <nav className="review-outline" aria-label="Resume sections">
      {groups.map(group => <a key={group.id} href={`#review-${group.id}`}>{group.title}<span>{group.changes.length}</span></a>)}
    </nav>
    {!groups.length ? <p className="review-no-change">No text changes in this version.</p> : null}
    {groups.map(group => <section className="review-group" id={`review-${group.id}`} key={group.id} aria-labelledby={`review-heading-${group.id}`}>
      <header><div><small>{group.category}</small><h3 id={`review-heading-${group.id}`}>{group.title}</h3></div><span className="muted">{group.changes.length} {group.changes.length === 1 ? "change" : "changes"}</span></header>
      {group.changes.map(change => {
        const added = addedTerms.get(change.paragraphId);
        const reordered = change.paragraphId.startsWith("skills.") && isSkillsReorder(change.beforeText, change.finalText);
        return <article className="review-bullet" key={change.id}>
          <div className="review-bullet-heading"><h4>{reviewParagraphLabel(change)}</h4>{change.riskLevel !== "LOW" ? <span className={`status ${change.riskLevel === "HIGH" ? "status-red" : "status-amber"}`}>{change.riskLevel.toLowerCase()} risk · check this change</span> : null}</div>
          <div className="review-text-pair">
            <div className="review-text"><h5>Original</h5><p>{reordered ? change.beforeText : <PhraseDiff before={change.beforeText} after={change.finalText} side="before" />}</p></div>
            <div className="review-text"><h5>Tailored · final resume</h5><p>{reordered ? change.finalText : <PhraseDiff before={change.beforeText} after={change.finalText} side="after" addedTerms={added} />}</p></div>
          </div>
          <div className="review-keywords"><strong>{reordered ? "Order only" : "Keywords added"}</strong>{reordered ? <small>Skills reordered; no new skills. This is not a substantive tailoring change.</small> : added === undefined ? <small>Not recorded for this older version.</small> : added.length ? added.map(term => <span key={term}>{term}</span>) : <small>No new keywords; wording revised.</small>}</div>
          {change.explanation || strings(change.targetTerms).length || change.proposedText !== change.finalText ? <details className="review-detail"><summary>Why this changed &amp; tailoring details</summary>
            {change.explanation ? <p>{change.explanation}</p> : null}
            {strings(change.targetTerms).length ? <p><strong>Tailoring targets: </strong>{strings(change.targetTerms).join(", ")}<br /><small>Targets can include terms already in the original. They are not all new additions.</small></p> : null}
            {strings(change.evidenceIds).length ? <p className="muted">Evidence: {strings(change.evidenceIds).map(value => value.replace(/^evidence\./, "").replaceAll("_", " ").replaceAll(".", " › ")).join(", ")}</p> : null}
            {change.proposedText !== change.finalText ? <details><summary>Earlier proposal before layout adjustments</summary><p>{change.proposedText}</p></details> : null}
          </details> : null}
        </article>;
      })}
    </section>)}
    {unchanged ? <p className="review-no-change">{unchanged} {unchanged === 1 ? "planned edit returned" : "planned edits returned"} to the original text in the final resume. Only actual text changes are shown above.</p> : null}
  </div>;
}
