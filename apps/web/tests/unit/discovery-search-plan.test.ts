import assert from "node:assert/strict";
import test from "node:test";
import { recommendedPosting, supportSearchLinks } from "../../src/lib/discovery/search-plan";
import { DEFAULT_DISCOVERY_PREFERENCES } from "../../src/lib/discovery/types";
import { DISCOVERY_SOURCES } from "../../src/lib/discovery/sources";
import { WORKDAY_BOARDS } from "../../src/lib/discovery/workday";

test("support searches retain location/radius without a metered provider", () => {
  const links = supportSearchLinks({ ...DEFAULT_DISCOVERY_PREFERENCES, radiusMiles: 15 });
  assert.equal(links.length, 6);
  for (const search of links) {
    const indeed = new URL(search.indeed), linkedin = new URL(search.linkedin);
    assert.equal(indeed.searchParams.get("radius"), "15");
    assert.equal(indeed.searchParams.get("fromage"), "7");
    assert.equal(linkedin.searchParams.get("distance"), "15");
    assert.equal(linkedin.searchParams.get("keywords"), search.query);
    assert.ok(indeed.searchParams.get("l")?.includes("Seal Beach"));
  }
});
test("recommended view includes freshly checked undated jobs without inventing posting dates", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(recommendedPosting(null, "2026-10-12T10:00:00Z", now), true);
  assert.equal(recommendedPosting(null, "2026-10-08T10:00:00Z", now), false);
  assert.equal(recommendedPosting("2026-10-11", now, now), true);
  assert.equal(recommendedPosting("2026-08-01", now, now), true);
  assert.equal(recommendedPosting("2026-10-13", now, now), false);
  assert.equal(recommendedPosting(null, "invalid", now), false);
});
test("expanded direct sources have unique identities and registered Workday collectors", () => {
  assert.equal(new Set(DISCOVERY_SOURCES.map(s => s.key)).size, DISCOVERY_SOURCES.length);
  for (const source of DISCOVERY_SOURCES.filter(s => s.provider === "workday")) assert.equal(new URL(source.url).hostname, WORKDAY_BOARDS[source.key].host);
  for (const key of ["workday:usc", "workday:motorolasolutions", "lever:waremalcomb", "greenhouse:trace3", "greenhouse:sonyinteractiveentertainmentglobal"]) assert.ok(DISCOVERY_SOURCES.some(s => s.key === key));
});
