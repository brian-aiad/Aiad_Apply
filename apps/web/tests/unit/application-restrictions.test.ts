import assert from "node:assert/strict";
import test from "node:test";
import { referralOnlyEmployer } from "../../src/lib/application-restrictions";
test("referral-only restrictions cover RTX companies and their ATS without blocking other employers", () => {
  const policy = { referralOnlyEmployers: ["RTX", "Collins"] };
  for (const name of ["RTX", "RTX · confirm business unit", "Collins Aerospace", "Raytheon", "Pratt & Whitney"]) assert.equal(referralOnlyEmployer(name, [], policy), true);
  assert.equal(referralOnlyEmployer("Unresolved company", ["https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway/job/123"], policy), true);
  assert.equal(referralOnlyEmployer("Anduril", [], policy), false);
  assert.equal(referralOnlyEmployer("RTXify", [], policy), false);
  assert.equal(referralOnlyEmployer("Other", ["https://careers.rtx.com.evil.test/job"], policy), false);
  assert.equal(referralOnlyEmployer("RTX", [], undefined), false);
});
