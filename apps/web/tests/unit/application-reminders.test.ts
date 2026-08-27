import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticFollowUpAt,
  resolveFollowUpUpdate,
} from "../../src/lib/application-reminders";

test("schedules a seven-day reminder on the first Applied transition", () => {
  const now = new Date("2026-08-26T17:30:00.000Z");
  const result = resolveFollowUpUpdate({
    currentStatus: "READY",
    nextStatus: "APPLIED",
    currentFollowUpAt: null,
    requestedFollowUpAt: null,
    now,
    followUpDays: 7,
  });

  assert.equal(result.automaticallyScheduled, true);
  assert.equal(result.followUpAt?.toISOString(), "2026-09-02T17:30:00.000Z");
  assert.equal(automaticFollowUpAt(now).toISOString(), "2026-09-02T17:30:00.000Z");
});

test("preserves manual reminders and allows clearing after Applied", () => {
  const manual = new Date("2026-09-05T16:00:00.000Z");
  const now = new Date("2026-08-26T17:30:00.000Z");
  const transition = resolveFollowUpUpdate({
    currentStatus: "READY",
    nextStatus: "APPLIED",
    currentFollowUpAt: null,
    requestedFollowUpAt: manual,
    now,
    followUpDays: 7,
  });
  assert.equal(transition.followUpAt, manual);
  assert.equal(transition.automaticallyScheduled, false);

  const cleared = resolveFollowUpUpdate({
    currentStatus: "APPLIED",
    nextStatus: "APPLIED",
    currentFollowUpAt: manual,
    requestedFollowUpAt: null,
    now,
    followUpDays: 7,
  });
  assert.equal(cleared.followUpAt, null);
  assert.equal(cleared.automaticallyScheduled, false);
});

test("does not replace a reminder already set before applying", () => {
  const existing = new Date("2026-09-01T16:00:00.000Z");
  const result = resolveFollowUpUpdate({
    currentStatus: "READY",
    nextStatus: "APPLIED",
    currentFollowUpAt: existing,
    requestedFollowUpAt: null,
    now: new Date("2026-08-26T17:30:00.000Z"),
    followUpDays: 7,
  });
  assert.equal(result.followUpAt, existing);
  assert.equal(result.automaticallyScheduled, false);
});
