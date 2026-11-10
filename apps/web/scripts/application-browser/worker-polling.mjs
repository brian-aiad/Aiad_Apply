/** Back off empty/failed queue production without slowing receipt observation. */
export class QueuePolling {
  empty = 0;
  failures = 0;
  nextAt = 0;
  due(now = Date.now()) { return now >= this.nextAt; }
  observed(hasJob, now = Date.now()) {
    this.failures = 0;
    this.empty = hasJob ? 0 : Math.min(this.empty + 1, 4);
    this.nextAt = hasJob ? now : now + Math.min(30_000, 5_000 * 2 ** (this.empty - 1));
  }
  failed(now = Date.now()) {
    this.failures = Math.min(this.failures + 1, 5);
    this.nextAt = now + Math.min(60_000, 5_000 * 2 ** (this.failures - 1));
  }
}
