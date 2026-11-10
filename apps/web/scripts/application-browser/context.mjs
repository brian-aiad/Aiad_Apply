// Keep facts available while avoiding unrelated sensitive onboarding in each model call.
export function applicationContext(context) {
  const snapshot = context.snapshot || {};
  const observed = (snapshot.frames || []).flatMap(frame => [frame.text || '', ...(frame.controls || []).map(control => `${control.label || ''} ${control.context || ''}`)]).join('\n').replace(/\s+/g, ' ');
  const source = context.setup || {};
  const setup = {};
  const always = ['preferredName','workAuthorization','requiresSponsorshipNowOrFuture','startDate','locationPreference','securityClearance','citizenship','salaryPolicy','routineApplicationConsent','recruitmentCommunicationConsent','accuracyCertificationConsent','latestConfirmedAnswers'];
  for (const key of always) if (source[key] !== undefined) setup[key] = source[key];
  for (const [key, pattern] of Object.entries({ professionalReferences:/\breferences?\b|referee/i, employmentHistory:/employment|employer|work history|start date|end date/i, dateOfBirth:/birth|dob/i, birthplace:/birthplace|place of birth/i, selfReportedDemographics:/race|ethnic|gender|disabil|veteran|demograph/i, demographicAutofillPreference:/race|ethnic|gender|disabil|veteran|demograph/i, backgroundAnswerPolicy:/criminal|background|military|government|reference/i, employerHistoryDefault:/previous.*(?:work|employ|affiliat)|ever.*(?:employ|work)|worked.*(?:here|company|us)|formerly/i, priorApplicationHistoryDefault:/previous.*appl|ever.*appl|prior.*appl|applied.*(?:here|company|us|before)/i, jobSourceDefault:/how did.*hear|where.*(?:find|learn)|referred|referral source/i, jobSearchStatus:/currently.*(?:employ|work)|employment status|job search/i })) {
    if (pattern.test(observed) && source[key] !== undefined) setup[key] = source[key];
  }
  // Employer-specific saved facts stay employer-specific; never import another portal's consents.
  const company = String(context.job?.company || '').toLowerCase();
  if (company.includes('anduril') && source.andurilFormAnswers) setup.andurilFormAnswers = source.andurilFormAnswers;
  if (company.includes('anduril') && source.recordedAndurilSubmission) setup.recordedAndurilSubmission = source.recordedAndurilSubmission;
  return { ...context, setup, snapshot: { ...snapshot, frames: (snapshot.frames || []).map(frame => ({ ...frame, text: String(frame.text || '').slice(0, 12000) })) } };
}
