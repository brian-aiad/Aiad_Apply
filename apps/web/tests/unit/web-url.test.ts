import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { crossOriginMutation, webUrl } from "../../src/lib/web-url";

test("job links reject executable protocols and embedded credentials", () => {
  for (const url of ["", "not a URL", "http://", "javascript:alert(1)", "data:text/html,test", "file:///private", "https://user:secret@example.com"]) assert.equal(webUrl.safeParse(url).success, false);
  assert.equal(webUrl.or(z.literal("")).safeParse("").success, true);
  assert.equal(webUrl.safeParse("https://example.com/jobs/1?source=board").success, true);
});

test("browser mutations reject foreign origins while preserving local and CLI requests", () => {
  const request = (method: string, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/jobs", { method, headers });
  assert.equal(crossOriginMutation(request("POST", { origin: "https://foreign.example" })), true);
  assert.equal(crossOriginMutation(request("POST", { "sec-fetch-site": "cross-site" })), true);
  assert.equal(crossOriginMutation(request("POST", { origin: "http://localhost:3000" })), false);
  assert.equal(crossOriginMutation(request("POST", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })), false);
  assert.equal(crossOriginMutation(request("POST", { origin: "https://foreign.example", host: "127.0.0.1:3000" })), true);
  assert.equal(crossOriginMutation(request("POST")), false);
  assert.equal(crossOriginMutation(request("GET", { origin: "https://foreign.example" })), false);
});
