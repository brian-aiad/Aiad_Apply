import assert from "node:assert/strict";
import test from "node:test";
import { applicationActivity, calendarDayBounds } from "../../src/lib/accountability";
const timezone = "America/Los_Angeles";
test("local day boundaries survive both daylight-saving transitions", () => {
  const spring = calendarDayBounds(timezone, new Date("2026-03-08T18:00:00Z"));
  const fall = calendarDayBounds(timezone, new Date("2026-11-01T18:00:00Z"));
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3600000, 23);
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3600000, 25);
});
test("counts actual local-date submissions and excludes future timestamps", () => {
  const result = applicationActivity([new Date("2026-09-10T06:59:00Z"), new Date("2026-09-10T07:01:00Z"), new Date("2026-09-11T12:00:00Z")], timezone, 1, new Date("2026-09-10T18:00:00Z"));
  assert.equal(result.appliedToday, 1); assert.equal(result.weekTotal, 2); assert.equal(result.streak, 2); assert.equal(result.goalDays, 2);
  assert.equal(result.week[0].label, "Mon"); assert.equal(result.week.length, 7);
});
test("does not break yesterday's streak before today is over", () => {
  const dates = [new Date("2026-09-08T19:00:00Z"), new Date("2026-09-09T19:00:00Z")];
  assert.equal(applicationActivity(dates, timezone, 8, new Date("2026-09-10T18:00:00Z")).streak, 2);
  assert.equal(applicationActivity(dates, timezone, 8, new Date("2026-09-11T18:00:00Z")).streak, 0);
});
