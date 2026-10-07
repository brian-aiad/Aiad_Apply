import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { artifactBytesMatch, validatedArtifactBytes } from "../../src/lib/artifact-content";
import { storageHealth } from "../../src/lib/storage-health";
test("checks uploaded bytes against both file size and SHA-256", () => {
  const bytes = Buffer.from("portable resume");
  const payload = { contentBase64: bytes.toString("base64"), byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.deepEqual(validatedArtifactBytes(payload), bytes);
  assert.throws(() => validatedArtifactBytes({ ...payload, byteSize: 1 }));
  assert.throws(() => validatedArtifactBytes({ ...payload, sha256: "bad" }));
  assert.throws(() => validatedArtifactBytes({ contentBase64: "!!corrupt" }));
  assert.equal(validatedArtifactBytes({}), null);
});
test("reports local versus hosted storage without exposing credentials", () => {
  assert.equal(storageHealth("postgresql://user:secret@localhost:5432/app").databaseLocation, "local");
  assert.equal(storageHealth("postgresql://user:secret@db.example.com:5432/app").databaseLocation, "hosted");
  assert.equal(storageHealth("bad").databaseLocation, "unknown");
  assert.ok(!JSON.stringify(storageHealth("postgresql://user:secret@db.example.com/app")).includes("secret"));
});

test("downloads require the recorded final bytes, not merely an existing file", () => {
  const bytes = Buffer.from("verified final PDF");
  const artifact = { sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length };
  assert.equal(artifactBytesMatch(bytes, artifact), true);
  assert.equal(artifactBytesMatch(Buffer.from("outdated draft PDF"), artifact), false);
  assert.equal(artifactBytesMatch(bytes, { ...artifact, byteSize: 1 }), false);
  assert.equal(artifactBytesMatch(bytes, { sha256: null, byteSize: bytes.length }), false);
});
