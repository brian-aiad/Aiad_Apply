type Bullet = { paragraphId: string; section: string; paragraphKind: string; finalText: string; targetTerms: unknown; riskLevel: string };
const labels: Record<string, string> = { "experience.original_insurance": "Original Insurance", "experience.csulb": "CSULB", "experience.wehelp": "WEHELP", "projects.loavenly": "Loavenly" };
export function applicationEvidence(bullets: Bullet[]) {
  return bullets.filter(b => b.paragraphKind === "bullet" && b.riskLevel === "LOW" && b.finalText.trim() && labels[b.section])
    .map(b => ({ id: b.paragraphId, source: labels[b.section], text: b.finalText,
      terms: Array.isArray(b.targetTerms) ? b.targetTerms.filter((t): t is string => typeof t === "string") : [] }))
    .sort((a, b) => b.terms.length - a.terms.length).slice(0, 6);
}
