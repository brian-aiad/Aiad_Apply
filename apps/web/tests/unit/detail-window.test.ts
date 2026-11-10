import test from "node:test";
import assert from "node:assert/strict";
import { detailWindow, isSourceAccessError } from "../../src/lib/discovery/detail-window";
import { collectSchools } from "../../src/lib/discovery/edjoin";
import { DISCOVERY_SOURCES } from "../../src/lib/discovery/sources";

test("detail progress resumes across reordered feeds and exhausts without repeating first twelve", () => {
  const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
  const first = detailWindow(ids, null);
  const second = detailWindow([...ids].reverse(), JSON.parse(JSON.stringify(first.nextState)));
  const third = detailWindow(ids, second.nextState);
  assert.deepEqual([first.ids.length, second.ids.length, third.ids.length], [12, 12, 1]);
  assert.equal(new Set([...first.ids, ...second.ids, ...third.ids]).size, 25);
  assert.equal(third.moreDetails, false);
  assert.equal(third.nextState, null);
  assert.deepEqual(detailWindow(ids, { lastId: "bad", version: 1 }).ids, first.ids);
  assert.deepEqual(detailWindow(ids.slice(0, 2), first.nextState).ids, []);
  for (const message of ["HTTP 403", "HTTP 429", "CAPTCHA", "Sign-in required"]) assert.equal(isSourceAccessError(new Error(message)), true);
  assert.equal(isSourceAccessError(new Error("Timeout")), false);
});

test("school collector advances past rejected details and preserves access holds", async () => {
  const original = globalThis.fetch;
  const attempted: string[] = [];
  let accessBlocked = false;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("LoadJobsPortalList")) return new Response(JSON.stringify({ data: Array.from({ length: 25 }, (_, i) => ({ postingID: i + 1, positionTitle: "Application Support Specialist" })), totalRecords: 25, totalPages: 1 }));
    attempted.push(url.split("/").at(-1)!);
    return new Response("Expired posting", { status: accessBlocked ? 429 : 200 });
  };
  try {
    const source = DISCOVERY_SOURCES.find(s => s.key === "edjoin:orange-schools")!;
    const a = await collectSchools(source);
    const b = await collectSchools(source, undefined, a.nextState);
    const c = await collectSchools(source, undefined, b.nextState);
    assert.equal(attempted.length, 25);
    assert.equal(new Set(attempted).size, 25);
    assert.equal(a.continuationPending, true);
    assert.equal(c.continuationPending, false);
    assert.equal(c.complete, false);
    assert.equal(c.authoritative, false);
    accessBlocked = true;
    await assert.rejects(collectSchools(source), /HTTP 429/);
  } finally { globalThis.fetch = original; }
});
