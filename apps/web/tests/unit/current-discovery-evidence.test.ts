import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createEvidenceResolver } from "../../src/lib/discovery/current-evidence";
const base = (text: string) => ({ bytes: Buffer.from(text), sha256: createHash("sha256").update(text).digest("hex") });
const paragraph = { id: "experience.fixture.bullet.1", section: "experience.fixture", kind: "bullet", text: "Trained staff and maintained incident documentation." };
test("current base duties replace stale excerpts and concurrent calls share extraction", async () => {
  const source = base("verified base"); let calls = 0;
  const resolve = createEvidenceResolver(async () => source, async () => { calls++; return { sha256: source.sha256, paragraphs: [paragraph] }; });
  const results = await Promise.all(Array.from({ length: 20 }, () => resolve()));
  assert.equal(calls, 1);
  for (const result of results) assert.deepEqual(result.evidence, [paragraph.text]);
  const changedProfile = await resolve({ confirmed_evidence: [{ scope: "source_specific", confidence: "confirmed", evidence_reference: "experience.csulb", term: "Reporting", notes: "Maintained operational reports." }] });
  assert.equal(calls, 1); assert.equal(changedProfile.evidence.length, 2);
});
test("changed active bytes invalidate cache and rejected inspections can retry", async () => {
  let source = base("first"); let bad = false; let calls = 0;
  const resolve = createEvidenceResolver(async () => source, async () => { calls++; return { sha256: bad ? "stale" : source.sha256, paragraphs: [paragraph] }; });
  await resolve(); source = base("second"); bad = true;
  await assert.rejects(resolve(), /does not match/);
  bad = false; await resolve(); assert.equal(calls, 3);
});
test("invalid bytes and generated report content cannot become base evidence", async () => {
  const source = base("source");
  await assert.rejects(createEvidenceResolver(async () => ({ ...source, bytes: Buffer.from("different") }), async () => { throw Error("must not inspect"); })(), /byte verification/);
  await assert.rejects(createEvidenceResolver(async () => source, async () => ({ sha256: source.sha256, paragraphs: [{ ...paragraph, kind: "generated", section: "rewritten_paragraphs" }] }))(), /No verified/);
});


test("unconfirmed and unreferenced profile claims cannot augment source duties", async () => {
  const source = base("protected");
  const resolve = createEvidenceResolver(async () => source, async () => ({ sha256: source.sha256, paragraphs: [paragraph] }));
  const claim = { term: "HRIS", scope: "source_specific", confidence: "confirmed", evidence_reference: "experience.csulb", notes: "Supported HRIS administration for two years." };
  for (const patch of [{confidence: "unconfirmed"}, {evidence_reference: ""}, {evidence_reference: "unknown"}, {notes: ""}, {notes: null}, {term: null}, {scope: "skills_only"}]) {
    const result = await resolve({ confirmed_evidence: [{ ...claim, ...patch }] });
    assert.deepEqual(result.evidence, [paragraph.text]);
  }
  const rejected = await resolve({ confirmed_evidence: [claim], rejected_terms: ["HRIS"] });
  assert.deepEqual(rejected.evidence, [paragraph.text]);
});

test("shared extracted evidence is strictly source and parser bound", async () => {
  const { verifiedInspection } = await import("../../src/lib/discovery/current-evidence");
  const source = base("verified source");
  const snapshot = { version: 1, extractor: "protected-docx-parser-v1", sha256: source.sha256, extractedAt: "2026-10-26T08:00:00.000Z", paragraphs: [paragraph] };
  assert.deepEqual(verifiedInspection(snapshot, source.sha256)?.paragraphs, [paragraph]);
  for (const patch of [ { version: 2 }, { extractor: "model-output" }, { sha256: "a".repeat(64) },
    { paragraphs: [paragraph, paragraph] }, { paragraphs: [{ ...paragraph, kind: "generated" }] },
    { paragraphs: [{ ...paragraph, section: "rewritten_paragraphs" }] }, { paragraphs: [] }, { extra: "arbitrary" } ]) {
    assert.equal(verifiedInspection({ ...snapshot, ...patch }, source.sha256), null);
  }
});
