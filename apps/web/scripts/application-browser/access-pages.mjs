/** Bounded, session-local login tabs. No passwords, codes or form answers stored. */
export class AccessPages {
  constructor(limit = 6) { this.limit = limit; this.entries = new Map(); }
  prune() { for (const [key, entry] of this.entries) if (entry.driver.page.isClosed()) { entry.driver.detach?.(); this.entries.delete(key); } }
  has(driver) { this.prune(); return [...this.entries.values()].some(entry => entry.driver === driver); }
  retain(job, driver, result) {
    if (!driver || driver.job.attemptId !== job.attemptId || driver.submissionStarted || result.status !== 'BLOCKED' || !/\b(?:captcha|sign[ -]?in|log[ -]?in|password|verification|authenticate|authentication)\b/i.test([result.summary, ...(result.unresolved || [])].join(' '))) return 'not-access';
    this.prune();
    if (this.entries.has(job.applicationId)) return 'already-retained';
    if (this.entries.size >= this.limit) return 'capacity';
    this.entries.set(job.applicationId, {driver, destination: job.destination});
    return 'retained';
  }
  take(job, context) {
    this.prune();
    const entry = this.entries.get(job.applicationId);
    if (!entry || entry.destination !== job.destination || entry.driver.context !== context || entry.driver.submissionStarted) return null;
    this.entries.delete(job.applicationId);
    entry.driver.detach?.();
    return entry.driver.page;
  }
}
