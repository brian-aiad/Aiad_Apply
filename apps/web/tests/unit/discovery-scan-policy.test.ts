import test from "node:test";
import assert from "node:assert/strict";
import { discoveryScanDue, discoverySourceDue, nextRegularDiscoveryAt } from "../../src/lib/discovery/scan-policy";
import type { ScanSummary } from "../../src/lib/discovery/types";

const start = Date.parse("2026-10-20T12:00:00Z");
const scan: ScanSummary = {
  id: "test", status: "completed", startedAt: new Date(start).toISOString(),
  completedAt: new Date(start + 90_000).toISOString(), found: 2,
  sources: [
    { sourceKey: "first", company: "First", status: "ok", checked: 10, found: 2 },
    { sourceKey: "later", company: "Later", status: "failed", checked: 0, found: 0, message: "The operation was aborted due to timeout" },
    { sourceKey: "limited", company: "Limited", status: "failed", checked: 0, found: 0, message: "Source returned HTTP 429." },
  ],
};

test("an incomplete 12-hour scan resumes timed-out boards on the next 15-minute poll", () => {
  assert.equal(discoveryScanDue(scan, 12, false, start + 5 * 60_000), false);
  assert.equal(discoveryScanDue(scan, 12, false, start + 15 * 60_000), true);
  assert.equal(discoverySourceDue("first", scan, 12, false, start + 15 * 60_000), false);
  assert.equal(discoverySourceDue("later", scan, 12, false, start + 15 * 60_000), true);
  assert.equal(discoverySourceDue("limited", scan, 12, false, start + 15 * 60_000), false);
});

test("a repaired scan returns to its normal interval and preserves source check times", () => {
  const repaired: ScanSummary = { ...scan, startedAt: new Date(start + 15 * 60_000).toISOString(), sources: scan.sources.map(s => ({ ...s, status: "ok", checkedAt: new Date(start).toISOString() })) };
  assert.equal(discoveryScanDue(repaired, 12, false, start + 30 * 60_000), false);
  assert.equal(discoveryScanDue(repaired, 12, false, start + 13 * 3_600_000), true);
  assert.equal(discoverySourceDue("first", repaired, 12, false, start + 13 * 3_600_000), true);
  assert.equal(discoverySourceDue("new-board", repaired, 12, false, start + 30 * 60_000), true);
});

test("access failures never trigger early automatic retries; manual refresh and leases stay bounded", () => {
  for (const message of ["Source returned HTTP 403.", "Source returned HTTP 429.", "CAPTCHA", "Sign-in required"]) {
    const held: ScanSummary = { ...scan, status: "failed", sources: [{ ...scan.sources[1], message }] };
    assert.equal(discoveryScanDue(held, 12, false, start + 30 * 60_000), false);
  }
  assert.equal(discoveryScanDue(scan, 12, true, start + 59_000), false);
  assert.equal(discoveryScanDue(scan, 12, true, start + 60_000), true);
  assert.equal(discoveryScanDue({ ...scan, status: "running" }, 12, true, start + 179_000), false);
  assert.equal(discoveryScanDue({ ...scan, status: "running" }, 12, false, start + 180_000), true);
});

test('frequent partial retries cannot move healthy boards beyond their own 12-hour interval',()=>{
 const retryStart=start+11.9*3600000;
 const retried:ScanSummary={...scan,startedAt:new Date(retryStart).toISOString(),completedAt:new Date(retryStart+1000).toISOString(),sources:[{...scan.sources[0],status:'ok',checkedAt:new Date(start).toISOString()},{...scan.sources[1],status:'ok',checkedAt:new Date(retryStart).toISOString()}]};
 assert.equal(nextRegularDiscoveryAt(retried,12),start+12*3600000);
 assert.equal(discoveryScanDue(retried,12,false,start+12*3600000-1),false);
 assert.equal(discoveryScanDue(retried,12,false,start+12*3600000),true);
 assert.equal(discoverySourceDue('first',retried,12,false,start+12*3600000),true);
 assert.equal(discoverySourceDue('later',retried,12,false,start+12*3600000),false);
});

test("bounded public detail continuation advances promptly then waits its regular interval", () => {
  const exhausted: ScanSummary = { ...scan, sources: [{ ...scan.sources[0], status: "partial", continuationPending: false }] };
  assert.equal(discoveryScanDue(exhausted, 12, false, start + 30 * 60_000), false);
  assert.equal(discoverySourceDue("first", exhausted, 12, false, start + 30 * 60_000), false);
  assert.equal(discoveryScanDue(exhausted, 12, false, start + 13 * 3_600_000), true);
  const pending: ScanSummary = { ...exhausted, sources: [{ ...exhausted.sources[0], continuationPending: true }] };
  assert.equal(discoveryScanDue(pending, 12, false, start + 30 * 60_000), true);
  assert.equal(discoverySourceDue("first", pending, 12, false, start + 30 * 60_000), true);
});

test("manual refresh cannot bypass a recent provider access hold",()=>{
 assert.equal(discoverySourceDue("limited",scan,12,true,start+30*60000),false);
 assert.equal(discoverySourceDue("first",scan,12,true,start+30*60000),true);
 assert.equal(discoverySourceDue("limited",scan,12,true,start+13*3600000),true);
});
