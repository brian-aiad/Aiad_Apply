import { readFile } from "node:fs/promises";
import path from "node:path";
import { EvidenceDecision } from "@/components/evidence-decision";
import { savedEvidenceStatus, termExplanations, transferableWithoutQuestion } from "@/lib/stretch-review";

type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" ? v : "";
const strings = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
const humanize = (v: string) => v.replace(/experience\.original_insurance/g, "Original Insurance").replace(/experience\.csulb/g, "Cal State Long Beach").replace(/experience\.wehelp/g, "WeHelp").replace(/projects\.loavenly/g, "Loavenly").replace(/skills\.\w+/g, "your Skills section").replace(/\.bullet\.(\d+)/g, " · bullet $1").replace(/\s*\(semantic score [^)]+\)/g, "");

export async function StretchLabReview({ opportunities, gaps, projects, keywords, runNumber, automaticTerms = [] }: {
  opportunities: Row[]; gaps: Row[]; projects: Row[];
  keywords: { term: string; evidenceLevel: string; sourceSections: unknown }[];
  runNumber: number;
  automaticTerms?: string[];
}) {
  let profile: Record<string, unknown> = {};
  let profileAvailable = true;
  try { const parsed: unknown = JSON.parse(await readFile(path.resolve(process.cwd(), "../../data/profile/Brian_Aiad_PROFILE.json"), "utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid profile"); profile = parsed as Record<string, unknown>; }
  catch { profileAvailable = false; }
  const byTerm = new Map(keywords.map(k => [k.term.trim().toLowerCase(), k]));
  const automatic: Row[] = [], remaining = new Map<string, Row>();
  for (const row of [...gaps, ...opportunities]) {
    const term = text(row.target_term), key = term.trim().toLowerCase();
    if (!term || remaining.has(key) || automatic.some(r => text(r.target_term).toLowerCase() === key)) continue;
    const keyword = byTerm.get(key);
    if ((automaticTerms.some(t => t.toLowerCase() === key) && savedEvidenceStatus(profile, term) !== "rejected")
        || transferableWithoutQuestion(term, keyword?.evidenceLevel, profile)) automatic.push(row);
    else remaining.set(key, row);
  }
  const rows = [...remaining.values()].sort((a,b) => Number(b.hiring_importance || 0) - Number(a.hiring_importance || 0));
  return <div className="stretch-review">
    <div className="stretch-scope"><strong>For this posting · resume version {runNumber}</strong><p>These suggestions describe this saved version. Experience you save is shared with future tailoring on this installation; it does not edit existing resumes. Tailor again to use updated evidence.</p><p>Established technical skills are automatically used in matching duties when requested. Ordinary transferable skills are inferred from your documented work. Specialized systems and specific implementations need matching evidence. Proposed projects are ideas, not completed resume claims.</p></div>
    {!profileAvailable ? <p role="status">Saved profile decisions are unavailable here. The list below reflects this version’s recorded review.</p> : null}
    <section><h3>Requirements to resolve</h3><p className="muted">Focus on specific tools, hands-on tasks and experience that affect this role.</p>
      {rows.length ? <div className="stretch-card-list">{rows.map(row => {
        const term = text(row.target_term), key = term.trim().toLowerCase(), status = savedEvidenceStatus(profile, term);
        const keyword = byTerm.get(key);
        const required = strings(keyword?.sourceSections).includes("required");
        return <article className="stretch-gap-card" key={key}>
          <header><h4>{term}</h4><span className="status">{required ? "Required" : strings(keyword?.sourceSections).includes("responsibilities") ? "Role duty" : "Preferred / other"}</span></header>
          {termExplanations[key] ? <p>{termExplanations[key]}</p> : null}
          <p>{status === "rejected" ? "You recorded no experience with this. It stays excluded unless you update that decision." : status === "confirmed" ? "Experience is saved in your shared profile. Tailoring uses only the scope that supports this requirement; saving more detail does not change this saved resume." : humanize(text(row.why_it_matters) || text(row.rationale))}</p>
          <details><summary>What the saved review identified</summary><p>{humanize(text(row.why_it_matters) || text(row.rationale))}</p>{strings(row.proof_needed).length ? <ul>{strings(row.proof_needed).map(s=><li key={s}>{s}</li>)}</ul> : null}</details>
          <EvidenceDecision term={term} category={text(row.category) || "other"} initialDecision={status} />
        </article>;
      })}</div> : <p>No additional evidence questions in this version.</p>}
    </section>
    {automatic.length ? <details className="stretch-automatic"><summary>Handled from documented work · {automatic.length} established skills</summary><p>Requested basic technologies go into matching duties automatically. Other transferable skills are used where useful. No repeated confirmation is needed.</p><div className="stretch-term-list">{automatic.map(row=><span key={text(row.target_term)}>{text(row.target_term)}</span>)}</div></details> : null}
    {projects.length ? <section><h3>Optional projects to build experience</h3><p className="muted">Proposed work stays out of exported resumes until completed and documented.</p>{projects.map((project,index)=><details className="stretch-project" key={index}><summary>{text(project.title) || "Proposed project"}</summary><p>{text(project.objective)}</p><p>Skills to practice: {strings(project.target_terms).join(", ")}</p><ol>{strings(project.build_steps).map(step=><li key={step}>{step}</li>)}</ol></details>)}</section> : null}
  </div>;
}
