import assert from "node:assert/strict";
import test from "node:test";
import { discoveryViewSearch, readDiscoveryView } from "../../src/lib/discovery/view-state";
test("Discover view links restore RTX scope, filters and search without changing saved preferences", () => {
  const view = readDiscoveryView(new URLSearchParams("channel=rtx&tab=approved&sort=newest&statewide=1&remote=1&q=cost"));
  assert.equal(view.rtxLocal, false);
  assert.equal(view.rtxRemote, true);
  assert.equal(view.tab, "approved");
  assert.deepEqual(readDiscoveryView(new URLSearchParams(discoveryViewSearch(view))), view);
});
test("invalid query options fall back and search text is bounded", () => {
  const view = readDiscoveryView(new URLSearchParams({ channel: "anything", tab: "removed", period: "9000", sort: "random", q: "x".repeat(250) }));
  assert.equal(view.channel, "local");
  assert.equal(view.tab, "all");
  assert.equal(view.period, "21");
  assert.equal(view.sort, "fit");
  assert.equal(view.query.length, 200);
  assert.equal(discoveryViewSearch(readDiscoveryView(new URLSearchParams())), "");
});
