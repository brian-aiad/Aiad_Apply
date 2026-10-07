import { z } from "zod";

export const evidenceReferences = {
  "projects.loavenly": "Loavenly project",
  "experience.original_insurance": "Original Insurance",
  "experience.csulb": "CSULB",
  "experience.wehelp": "WEHELP",
} as const;

export const evidenceDecisionSchema = z.object({
  term: z.string().trim().min(1).max(120),
  category: z.enum(["technology", "method", "domain", "qualification", "other"]),
  decision: z.enum(["confirmed", "rejected"]),
  scope: z.enum(["skills_only", "general_exposure", "source_specific"]).optional(),
  evidenceReference: z.enum(["", "projects.loavenly", "experience.original_insurance", "experience.csulb", "experience.wehelp"]).default(""),
  notes: z.string().trim().max(2000).default(""),
}).superRefine((value, context) => {
  if (value.decision === "confirmed" && value.scope === "source_specific"
      && (!value.evidenceReference || value.notes.length < 10)) {
    context.addIssue({ code: "custom", message: "Choose where you used this and describe the completed work." });
  }
});

export function applyEvidenceDecision(profile: Record<string, unknown>, input: z.infer<typeof evidenceDecisionSchema>, now = new Date().toISOString()) {
  const normalize = (term: string) => term.trim().toLowerCase();
  const key = normalize(input.term);
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const remove = (value: unknown) => strings(value).filter(item => normalize(item) !== key);
  const skills = remove(profile.confirmed_skills), exposure = remove(profile.confirmed_exposure), rejected = remove(profile.rejected_terms);
  const scope = input.scope ?? (input.category === "technology" ? "skills_only" : "general_exposure");
  const reference = scope === "source_specific" ? input.evidenceReference : "";
  const evidence = (Array.isArray(profile.confirmed_evidence) ? profile.confirmed_evidence : []) as Record<string, unknown>[];
  // Preserve separately confirmed uses in other roles; rejection clears all uses.
  const retained = evidence.filter(item => normalize(String(item.term)) !== key
    || (input.decision === "confirmed" && (item.scope !== scope || item.evidence_reference !== reference)));
  if (input.decision === "confirmed") {
    (input.category === "technology" ? skills : exposure).push(input.term);
    retained.push({ term: input.term, category: input.category, scope, confidence: "confirmed", source: "candidate_confirmation",
      evidence_reference: reference, notes: input.notes || (scope === "skills_only"
        ? "Skills knowledge only. Project and employer use requires separate confirmation."
        : "General exposure; do not invent a project or employer implementation.") });
  } else rejected.push(input.term);
  return { ...profile, established_technologies: input.decision === "rejected" ? remove(profile.established_technologies) : strings(profile.established_technologies), everyday_tools: input.decision === "rejected" ? remove(profile.everyday_tools) : strings(profile.everyday_tools), confirmed_skills: skills, confirmed_exposure: exposure, rejected_terms: rejected, confirmed_evidence: retained,
    review_history: [...(Array.isArray(profile.review_history) ? profile.review_history : []),
      { term: input.term, category: input.category, decision: input.decision, scope, evidence_reference: reference, reviewed_at: now }] };
}
