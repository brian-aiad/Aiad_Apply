import { evidenceDecisionSchema } from "../candidate-profile";
import baseline from "./candidate-evidence.json";
export function discoveryEvidence(profile?: Record<string, unknown>, baseEvidence: string[] = baseline.evidence) {
  if (!profile) return { ...baseline, evidence: baseEvidence };
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  const rejected = strings(profile.rejected_terms);
  const reject = (value: string) => rejected.some(term => value.trim().toLowerCase() === term.trim().toLowerCase());
  const scoped = Array.isArray(profile.confirmed_evidence) ? profile.confirmed_evidence.filter(item => item && typeof item === "object" && item.scope === "source_specific" && item.confidence === "confirmed" && !reject(String(item.term)) && evidenceDecisionSchema.safeParse({ term: item.term, category: item.category ?? "other", decision: "confirmed", scope: item.scope, evidenceReference: item.evidence_reference, notes: item.notes }).success) : [];
  // Only actual source-specific use strengthens specialist-duty evidence.
  const evidence = [...baseEvidence, ...scoped.map(item => `${item.term}: ${item.notes}`)];
  return { ...baseline, evidence, confirmedSkills: strings(profile.confirmed_skills).filter(x => !reject(x)), confirmedExposure: strings(profile.confirmed_exposure).filter(x => !reject(x)), rejected };
}
