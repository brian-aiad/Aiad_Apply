import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function loadCoverLetter(root, job) {
  const runtime = await realpath(path.join(root, '.runtime'));
  const manifest = path.join(runtime, 'application-documents', `${job.applicationId}.json`);
  let entry;
  try { entry = JSON.parse(await readFile(manifest, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (entry.applicationId !== job.applicationId || entry.runId !== job.runId || entry.resumeSha256 !== job.resumeSha256 || entry.destination !== job.destination || entry.authorizationId !== job.authorizationId) throw new Error('Cover letter authorization does not match this application and resume.');
  const file = await realpath(entry.path);
  if (!file.startsWith(runtime + path.sep) || path.extname(file).toLowerCase() !== '.pdf') throw new Error('Cover letter must be a local verified PDF.');
  const bytes = await readFile(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== entry.sha256 || !bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Cover letter bytes changed.');
  return { path:file, sha256:hash, fileName:path.basename(file) };
}
