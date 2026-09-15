import assert from "node:assert/strict";
import test from "node:test";
import { assertIsolatedDatabase } from "../../src/lib/test-database";

test("test database guard rejects shared schemas regardless of credentials or loopback aliases", () => {
  assert.throws(() => assertIsolatedDatabase("postgresql://test@127.0.0.1/app?schema=public", "postgresql://user@localhost:5432/app"), /separate/);
  assert.doesNotThrow(() => assertIsolatedDatabase("postgresql://localhost/app?schema=isolated", "postgresql://localhost/app"));
});
