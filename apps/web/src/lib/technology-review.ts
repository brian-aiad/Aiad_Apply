type RecordValue = Record<string, unknown>;

// Older saved runs predate generated definitions. Keep their artifacts intact
// while explaining the common terms already visible in the review screen.
const historicalDefinitions: Record<string, string> = {
  go: "A programming language often used to build backend services and command-line tools.",
  golang: "A programming language often used to build backend services and command-line tools.",
  rust: "A programming language focused on speed and memory safety, used for systems and application software.",
  api: "An interface that lets software systems exchange data or request actions from each other.",
  apis: "Interfaces that let software systems exchange data or request actions from each other.",
  python: "A programming language commonly used for automation, data processing and backend development.",
  "rest api": "An interface that uses standard web requests to let applications access or update data.",
  "rest apis": "Interfaces that use standard web requests to let applications access or update data.",
  webhooks: "Automatic messages sent from one application to another when an event happens.",
  aws: "Amazon Web Services: cloud tools for running applications, storing data and managing computing resources.",
  "ci/cd": "Continuous integration and delivery: practices that automate building, testing and releasing software.",
  devops: "Practices that connect software development and operations to make releases and ongoing support more reliable.",
  terraform: "A tool for defining and managing cloud infrastructure through configuration files.",
};

export function technologySummary(term: string, summaries: unknown): string {
  const key = term.trim().toLowerCase();
  const saved = records(summaries).find(item => text(item.term).trim().toLowerCase() === key);
  return text(saved?.summary).trim() || historicalDefinitions[key] || "";
}

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function humanizeParagraph(value: string) {
  return value.replace(/^evidence\./, "").replace(/\.bullet\.(\d+)/g, " · bullet $1").replace(/\./g, " › ").replaceAll("_", " ");
}

export function buildTechnologyReview(snapshot: unknown, savedChanges: { paragraphId: string; finalText: string }[] = []) {
  const report = record(snapshot);
  const allCoverage = records(report.keyword_coverage).filter(row => text(row.term));
  const coverage = allCoverage.filter(row => row.accepted !== false);
  const targets = records(report.draft_technologies).filter(row => text(row.term));
  const targetsByTerm = new Map(targets.map(row => [text(row.term), row]));
  const coverageByTerm = new Map(allCoverage.map(row => [text(row.term), row]));
  const finalTexts = new Map(savedChanges.map(change => [change.paragraphId, change.finalText]));
  for (const change of records(report.changes)) {
    if (text(change.paragraph_id) && typeof change.final_text === "string") {
      finalTexts.set(text(change.paragraph_id), change.final_text);
    }
  }
  const paragraphs = new Map<string, { paragraphId: string; finalText: string; terms: string[] }>();
  const missingProjectTerms = new Set<string>();
  const missingSupportedTerms = new Set<string>();
  const draftTerms = new Set<string>();
  for (const row of coverage) {
    const term = text(row.term);
    const target = targetsByTerm.get(term);
    const allowed = strings(target?.paragraph_ids ?? row.eligible_bullet_ids ?? row.placements).filter(id => id.startsWith("projects."));
    const projectPlacements = strings(row.placements).filter(id => allowed.includes(id));
    if (row.status === "missing_supported") missingSupportedTerms.add(term);
    if ((target?.required === true && !projectPlacements.length) || (row.status === "missing_draft" && target?.required !== false)) {
      missingProjectTerms.add(term);
    }
    // Coverage belongs to the final export. Proposed text and a target's allowed
    // locations are never evidence that an implementation survived rendering.
    if (!target && row.status !== "draft_assumption") continue;
    for (const paragraphId of projectPlacements) {
      draftTerms.add(term);
      const paragraph = paragraphs.get(paragraphId) ?? { paragraphId, finalText: finalTexts.get(paragraphId) ?? "", terms: [] };
      if (!paragraph.terms.includes(term)) paragraph.terms.push(term);
      paragraphs.set(paragraphId, paragraph);
    }
  }
  const required = targets.filter(target => target.required === true && coverageByTerm.get(text(target.term))?.accepted !== false);
  const completeMetadata = required.length > 0 && required.every(target => coverageByTerm.has(text(target.term)));
  const omissionWarnings = records(record(report.validation).issues)
    .filter(issue => issue.code === "draft_technology_unplaced")
    .map(issue => text(issue.message)).filter(Boolean);
  return {
    aggressive: report.tailoring_mode === "aggressive_draft",
    draftTerms: [...draftTerms],
    paragraphs: [...paragraphs.values()],
    missingProjectTerms: [...missingProjectTerms],
    missingSupportedTerms: [...missingSupportedTerms],
    omissionWarnings,
    hasOmissions: missingProjectTerms.size > 0 || missingSupportedTerms.size > 0 || omissionWarnings.length > 0,
    requiredTotal: completeMetadata ? required.length : null,
    requiredPlaced: completeMetadata ? required.filter(target => !missingProjectTerms.has(text(target.term))).length : null,
  };
}

export type TechnologyReview = ReturnType<typeof buildTechnologyReview>;
