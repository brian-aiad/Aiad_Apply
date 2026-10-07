import { readFile, writeFile, rename, mkdir, readdir, unlink, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export async function atomicJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function durableWorkerId(runtime) {
  const file = path.join(runtime, 'application-worker-identity.json');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!/^browser-[a-f0-9-]{36}$/.test(value.workerId)) throw new Error('Invalid browser worker identity; repair it before starting.');
    return value.workerId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const workerId = `browser-${randomUUID()}`;
    await writeFile(file, JSON.stringify({ workerId }) + '\n', { flag: 'wx', mode: 0o600 });
    return workerId;
  }
}
export class ApplicationJournal {
  constructor(runtime, workerId) { this.directory = path.join(runtime, 'application-outbox'); this.workerId = workerId; }
  file(attemptId) {
    if (!/^[a-f0-9-]{36}$/.test(attemptId)) throw new Error('Invalid attempt journal identifier.');
    return path.join(this.directory, `${attemptId}.json`);
  }
  async save(job, phase, result = null) {
    await atomicJson(this.file(job.attemptId), { workerId: this.workerId, updatedAt: new Date().toISOString(), phase, job, result });
  }
  async pending() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entries = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const entry = JSON.parse(await readFile(path.join(this.directory, name), 'utf8'));
      if (entry.workerId === this.workerId && entry.phase !== 'PUBLISHED') entries.push(entry);
    }
    return entries.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }
}
export function interruptedResult(entry) {
  if (entry.result) return entry.result;
  return {
    status: entry.phase === 'SUBMITTING' ? 'UNKNOWN' : 'BLOCKED',
    summary: entry.phase === 'SUBMITTING'
      ? 'The worker restarted during the submission boundary. Check the employer site before any retry.'
      : 'The worker restarted before a final result was saved. No browser actions were replayed; resume this approved application after reviewing the interruption.',
    questions: [], unresolved: [],
  };
}
export async function recoverResult(entry, runtime) {
  if (entry.result) return entry.result;
  try {
    const copy = JSON.parse(await readFile(path.join(runtime, 'application-attempts', entry.job.attemptId, 'result.json'), 'utf8'));
    const binding = copy.resumeIdentity;
    if (binding?.attemptId === entry.job.attemptId && binding.runId === entry.job.runId && binding.resumeSha256 === entry.job.resumeSha256 && binding.destination === entry.job.destination && ['SUBMITTED', 'BLOCKED', 'UNKNOWN'].includes(copy.status)) {
      const { resumeIdentity: _binding, ...result } = copy;
      void _binding;
      return result;
    }
  } catch { /* A missing/unreadable copy is not proof of submission. */ }
  return interruptedResult(entry);
}
