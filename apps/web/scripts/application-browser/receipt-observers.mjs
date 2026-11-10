/** Park uncertain submissions without blocking the next application's worker slot. */
export class ReceiptObservers {
  entries = new Map();
  add(job, driver) { this.entries.set(job.attemptId, { job, driver, verification: null }); }
  remove(attemptId) { this.entries.delete(attemptId); }
  context() { return [...this.entries.values()].find(e => !e.driver.page.isClosed())?.driver.context; }
  async poll(observe, onError) {
    for (const [id, entry] of this.entries) {
      if (entry.driver.page.isClosed()) { this.entries.delete(id); continue; }
      try { if (await observe(entry)) this.entries.delete(id); }
      catch (error) { onError(error); }
    }
  }
}
