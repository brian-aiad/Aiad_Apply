import assert from "node:assert/strict";
import test from "node:test";
import { compareLinkedInFit, visibleLinkedInContact, readDiscoveryView, discoveryViewSearch } from "../../src/lib/discovery/view-state";

test("LinkedIn ordering puts documented qualification and fit ahead of Premium", () => {
  const supported = { qualified: true, score: 80, linkedin: { premiumSignal: "NONE" } };
  const premium = { qualified: false, score: 95, linkedin: { premiumSignal: "TOP_APPLICANT" } };
  assert.ok(compareLinkedInFit(supported, premium) < 0);
  assert.ok(compareLinkedInFit(supported, { ...supported, score: 70, linkedin: premium.linkedin }) < 0);
  assert.ok(compareLinkedInFit({ ...supported, linkedin: premium.linkedin }, supported) < 0);
});
test("excluded LinkedIn view round trips independently from recommendations", () => {
  const view = readDiscoveryView(new URLSearchParams("channel=linkedin&tab=excluded"));
  assert.equal(view.tab, "excluded");
  assert.equal(readDiscoveryView(new URLSearchParams(discoveryViewSearch(view))).tab, "excluded");
});
test("contact drafts require a named individual LinkedIn profile", () => {
  assert.equal(visibleLinkedInContact({name:"Pat",profileUrl:"https://www.linkedin.com/in/pat/"}), true);
  for (const profileUrl of ["https://www.linkedin.com.evil.test/in/pat", "javascript:alert(1)", "https://www.linkedin.com/jobs/1", "https://www.linkedin.com/in/", "https://user@www.linkedin.com/in/pat"]) assert.equal(visibleLinkedInContact({name:"Pat",profileUrl}), false);
  assert.equal(visibleLinkedInContact({profileUrl:"https://www.linkedin.com/in/pat"}), false);
});
