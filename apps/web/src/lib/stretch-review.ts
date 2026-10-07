export const ordinaryTransferableTerms = new Set([
  "critical thinking", "problem-solving", "communication skills", "written communication",
  "written and verbal communication skills", "verbal communication", "cross-functional collaboration",
  "interpersonal skills", "fast-paced environment", "task prioritization", "organizational skills", "case management",
  "technical writing", "enterprise software", "automation",
]);

const technicalFamilies = [
  ["python"], ["api", "apis"], ["rest", "rest api", "rest apis", "restful apis"],
  ["webhook", "webhooks"], ["aws", "amazon web services"],
  ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment"],
  ["go", "golang"], ["postgresql", "postgres"], ["html", "html5"], ["css", "css3"],
  ["react", "react.js"], ["node.js", "nodejs"], ["express", "express.js"], ["vue", "vue.js"],
  ["vs code", "visual studio code"], ["http", "https"], ["bash", "shell scripting"],
];
export function establishedTechnology(profile: Record<string, unknown>, term: string) {
  const key = term.trim().toLowerCase();
  const family = technicalFamilies.find(aliases => aliases.includes(key)) ?? [key];
  const has = (value: unknown) => Array.isArray(value) && value.some(t => typeof t === "string" && family.includes(t.trim().toLowerCase()));
  return has(profile.established_technologies) && !has(profile.rejected_terms);
}

export function savedEvidenceStatus(profile: Record<string, unknown>, term: string) {
  const key = term.trim().toLowerCase();
  const includes = (value: unknown) => Array.isArray(value) && value.some(item => typeof item === "string" && item.trim().toLowerCase() === key);
  const family = technicalFamilies.find(aliases => aliases.includes(key)) ?? [key];
  const rejectedAlias = Array.isArray(profile.rejected_terms) && profile.rejected_terms.some(item => typeof item === "string" && family.includes(item.trim().toLowerCase()));
  if (includes(profile.rejected_terms) || rejectedAlias) return "rejected" as const;
  if (establishedTechnology(profile, term)) return "confirmed" as const;
  if (includes(profile.confirmed_skills) || includes(profile.confirmed_exposure)
      || (Array.isArray(profile.confirmed_evidence) && profile.confirmed_evidence.some(item => item && typeof item === "object" && String(item.term).trim().toLowerCase() === key))) return "confirmed" as const;
  return undefined;
}

export function transferableWithoutQuestion(term: string, evidence: string | undefined, profile: Record<string, unknown>) {
  if (establishedTechnology(profile, term)) return true;
  return savedEvidenceStatus(profile, term) !== "rejected" && ordinaryTransferableTerms.has(term.trim().toLowerCase())
    && (evidence === "DIRECT" || evidence === "STRONGLY_TRANSFERABLE");
}

export const termExplanations: Record<string, string> = {
  "case management": "Tracking a support case from intake through troubleshooting, escalation and resolution. Your documented ticket work can support this without implying Salesforce or Zendesk use.",
  "crud": "Create, read, update and delete records. Viewing or resetting accounts alone does not establish all four operations.",
  "ai": "AI means artificial intelligence. Match your evidence to the posting: general familiarity is different from building or using an AI customer-support workflow.",
  "knowledge base": "Reusable support articles or troubleshooting guides. Incident notes alone do not establish published knowledge-base articles.",
  "b2b saas": "Software sold to other businesses. SaaS experience does not by itself establish a business-to-business customer model.",
  "automation": "Using scripts or workflows to reduce repeated work. Your documented Python reconciliation is a concrete example.",
};
