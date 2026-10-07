// Public ATS data only. An unavailable posting must not spend model calls or
// silently redirect the candidate into a different job's application.
export async function checkPosting(job, fetcher = fetch) {
  let url;
  try { url = new URL(job.destination); } catch { return { checked: false }; }
  if (!['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(url.hostname)) return { checked: false };
  const match = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\/jobs\/(\d+)\/?$/);
  if (!match) return { checked: false };
  let response;
  try { response = await fetcher(`https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}`, { signal: AbortSignal.timeout(15000) }); }
  catch { return { checked: false }; } // Browser inspection remains the fallback.
  if (response.status === 404 || response.status === 410) throw new Error(`The approved Greenhouse posting (${match[2]}) is no longer available. No resume was uploaded or application submitted. Choose a current posting; a different job requires its own tailored resume.`);
  if (!response.ok) return { checked: false };
  let data;
  try { data = await response.json(); } catch { return { checked: false }; }
  if (!data || typeof data.title !== 'string' || String(data.id) !== match[2]) return { checked: false };
  const normal = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normal(data.title) !== normal(job.title)) throw new Error('The approved posting now has a different job title. Review the current job before uploading or submitting.');
  return { checked: true, available: true, jobId: match[2] };
}
