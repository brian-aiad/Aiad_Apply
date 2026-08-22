const ELIGIBILITY_TERM_PATTERN =
  /\b(?:security clearance|secret clearance|top secret|u\.?s\.? citizenship|u\.?s\.? citizen|u\.?s\.? person|work authorization|authorized to work|visa sponsorship|permanent resident|green card|refugee status|asylee status|bachelor'?s degree|master'?s degree|doctoral degree|ph\.?d\.?|degree required)\b/i;

export function isEligibilityConstraint(term: string) {
  return ELIGIBILITY_TERM_PATTERN.test(term.replaceAll("‑", "-"));
}
