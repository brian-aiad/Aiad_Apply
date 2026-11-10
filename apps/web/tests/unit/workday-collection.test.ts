import assert from "node:assert/strict";
import test from "node:test";
import { collectWorkday } from "../../src/lib/discovery/workday";
import { DEFAULT_DISCOVERY_PREFERENCES as prefs, type Source } from "../../src/lib/discovery/types";
import { discoverySourceDue } from "../../src/lib/discovery/scan-policy";

const source: Source = { key: "workday:primoris", provider: "workday", board: "Primoris", company: "Fixture", url: "https://prim.wd108.myworkdayjobs.com/Primoris" };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function listing(count: number) { return { total: count, jobPostings: Array.from({length: count}, (_, i) => ({title: "Application Support Specialist", externalPath: `/job/local/Support_${i}`, bulletFields: [`R${i}`]})) }; }
function detail(i: string) { return { jobPostingInfo: { canApply: true, jobReqId: i, title: "Application Support Specialist", jobDescription: "Troubleshoot application incidents and assist users with documented technical support procedures. ".repeat(2), externalUrl: `https://prim.wd108.myworkdayjobs.com/Primoris/job/local/${i}`, location: "Long Beach, CA", timeType: "Full time" } }; }

test("Workday preserves partial results and exposes access holds to retry policy", async t => {
 let requests = 0;
 t.mock.method(globalThis, "fetch", async (url: string) => {
  if (url.endsWith("/jobs")) return json(listing(12));
  requests++;
  return new Response("provider private body", {status: 429});
 });
 const result = await collectWorkday(source, prefs);
 assert.equal(result.complete, false);
 assert.ok(requests <= 4);
 assert.match(result.message!, /HTTP 429/);
 assert.doesNotMatch(result.message!, /private body/);
 const now = Date.now();
 assert.equal(discoverySourceDue(source.key, {id:"fixture", startedAt:new Date(now-1200000).toISOString(), status:"completed", found:0, sources:[{sourceKey:source.key,company:"Fixture",status:"partial",checkedAt:new Date(now-1200000).toISOString(),checked:12,found:0,message:result.message}]} as Parameters<typeof discoverySourceDue>[1], 12, false, now), false);
});

test("Workday rolling details advance beyond a slow first page and keep successful results", {timeout:5000}, async t => {
 let release!: () => void;
 const slow = new Promise<void>(resolve => {release = resolve;});
 const seen: string[] = [];
 t.mock.method(globalThis, "fetch", async (url: string) => {
  if (url.endsWith("/jobs")) return json(listing(6));
  const id = url.split("_").at(-1)!;
  seen.push(id);
  if (id === "0") await slow;
  if (id === "5") release();
  return id === "2" ? new Response("", {status:500}) : json(detail(id));
 });
 const result = await collectWorkday(source, prefs);
 assert.equal(seen.length, 6);
 assert.equal(result.openings.length, 5);
 assert.equal(result.failures, 1);
 assert.match(result.message!, /HTTP 500/);
});

test("Workday does not dispatch details after the shared deadline", async t => {
 const controller = new AbortController();
 let requests = 0;
 t.mock.method(globalThis, "fetch", async () => {requests++; controller.abort(); return json(listing(6));});
 const result = await collectWorkday(source, prefs, controller.signal);
 assert.equal(requests, 1);
 assert.equal(result.complete, false);
 assert.match(result.message!, /deadline/);
});
