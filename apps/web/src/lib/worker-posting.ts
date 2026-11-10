type CapturedPosting = { rawPaste: string; company: string; title: string; location: string | null; employmentType: string | null; workArrangement: string | null };
// Employer boards need not use LinkedIn's section headings. Keep the original
// captured text intact; add only the already-saved metadata as a parsing envelope.
export function workerPosting(job: CapturedPosting): string {
  if (/^\s*(?:about (?:the|this) job|job description|position description)\s*[:\-]?\s*$/im.test(job.rawPaste)) return job.rawPaste;
  return [job.company, job.title, job.location, job.employmentType, job.workArrangement, 'About the job', job.rawPaste].filter(Boolean).join('\n');
}
