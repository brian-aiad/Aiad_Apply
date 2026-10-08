// Read-only classification. Never infer receipt, expiry, or email delivery.
export function verificationState(snapshot) {
  for (const frame of snapshot.frames || []) {
    const text = frame.text || '';
    const controls = frame.controls || [];
    const labeledCodeField = controls.some(c => /(?:verification|security|one[- ]time)[ -]?(?:code|password)/i.test(c.label || '') || /one-time-code/i.test(c.autocomplete || '') || /^code$/i.test(c.label || ''));
    const codePrompt = /\b(?:enter|type|provide|verify|confirm)\b.{0,100}\bcode\b/i.test(text) || /confirm you.re (?:a )?human/i.test(text);
    const challenge = (codePrompt || /\b(?:invalid|incorrect|expired)\b.{0,40}\bcode\b|\bcode\b.{0,40}\b(?:invalid|incorrect|expired)\b/i.test(text))
      && (/(?:verification|security|one[- ]time) code/i.test(text) || labeledCodeField);
    if (!challenge) continue;
    if (/expired (?:security |verification )?code|(?:security |verification )?code (?:has )?expired|code expired/i.test(text)) return 'expired';
    if (/invalid (?:security |verification )?code|(?:security |verification )?code (?:is )?(?:invalid|incorrect)|incorrect (?:security |verification )?code|invalid code|incorrect code/i.test(text)) return 'rejected';
    return 'required';
  }
  return null;
}
export function verificationReport(state) {
  const summary = state === 'expired'
    ? 'The employer says the verification code expired. Submission is not confirmed.'
    : state === 'rejected'
      ? 'The employer rejected the verification code. The cause is not established; submission is not confirmed.'
      : 'The employer requires email verification. Email delivery and submission are not confirmed by this worker.';
  return { summary, unresolved: ['Complete email verification in the existing employer tab. If the code was rejected, use the employer’s fresh-code option when available and enter the newest code promptly. Do not start a duplicate application.'] };
}
