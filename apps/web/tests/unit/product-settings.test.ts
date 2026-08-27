import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DAILY_GOAL,
  DEFAULT_FOLLOW_UP_DAYS,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  readProductSettings,
} from "../../src/lib/product-settings";

test("uses safe defaults for absent or malformed product settings", () => {
  assert.deepEqual(readProductSettings(null), {
    dailyGoal: DEFAULT_DAILY_GOAL,
    timezone: DEFAULT_TIMEZONE,
    followUpDays: DEFAULT_FOLLOW_UP_DAYS,
  });
  assert.deepEqual(readProductSettings({ dailyGoal: 0, timezone: "not/a-zone" }), {
    dailyGoal: DEFAULT_DAILY_GOAL,
    timezone: DEFAULT_TIMEZONE,
    followUpDays: DEFAULT_FOLLOW_UP_DAYS,
  });
});

test("preserves valid cross-platform workflow preferences", () => {
  assert.deepEqual(
    readProductSettings({
      dailyGoal: 12,
      timezone: "America/New_York",
      followUpDays: 10,
      outputRoot: "C:\\Users\\Brian\\Documents\\AiadApply",
    }),
    {
      dailyGoal: 12,
      timezone: "America/New_York",
      followUpDays: 10,
      outputRoot: "C:\\Users\\Brian\\Documents\\AiadApply",
    },
  );
  assert.equal(isValidTimezone("America/Los_Angeles"), true);
  assert.equal(isValidTimezone("not/a-zone"), false);
});
