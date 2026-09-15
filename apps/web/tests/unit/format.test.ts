import assert from "node:assert/strict";
import test from "node:test";
import { formatMoneyRange } from "../../src/lib/format";

test("hourly compensation never renders as a zero-thousand-dollar salary", () => {
  assert.equal(formatMoneyRange(28, 40, "$28-$40/hour"), "$28-$40/hour");
  assert.equal(formatMoneyRange(28, 40), "Pay period not listed");
  assert.match(formatMoneyRange(85000, 105000), /85K.*105K/);
});
