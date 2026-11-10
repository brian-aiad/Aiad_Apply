export type ReusableAnswer = { question: string; answer: string };
// A checkbox cannot turn an employer-specific consent or secret into a global fact.
export function reusableQuestion(question: string) {
  return !/consent|agree|acknowledge|waiv|releas|privacy|terms|data processing|authoriz.{0,40}(?:background|screen)|permission|certif|attest|signature|password|verification|security code|one.time|salary|compensation|relocat|this (?:company|employer|application)|previously applied|prior application|why (?:us|this)|interest.*(?:company|role)/i.test(question)
    && /citizen|work authori[sz]|sponsor|clearance|military|veteran|criminal|background|government employ|reference|degree|education|available|start date|preferred name|address|phone|email/i.test(question);
}
export function mergeReusableAnswers(existing: unknown, additions: ReusableAnswer[]) {
  const rows = Array.isArray(existing) ? existing.filter(row => row && typeof row.question === "string" && typeof row.answer === "string") as ReusableAnswer[] : [];
  const map = new Map(rows.map(row => [row.question.trim().toLowerCase(), row]));
  for (const row of additions) {
    if (!reusableQuestion(row.question)) throw new Error("This question must remain specific to this application.");
    const key = row.question.trim().toLowerCase();
    if (map.has(key) && map.get(key)!.answer.trim() !== row.answer.trim()) throw new Error("A different reusable answer is already saved. Resolve the conflict in your application profile.");
    map.set(key, row);
  }
  return [...map.values()].slice(-100);
}
