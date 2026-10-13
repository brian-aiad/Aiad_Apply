import test from "node:test";
import assert from "node:assert/strict";
import { linkedInEligibility, rankLinkedIn, scanGate, pacificDayStart, premiumSignal } from "../../src/lib/discovery/linkedin-policy";
const now = new Date("2026-10-13T10:00:00Z");
const candidate = { active:true, excluded:false, score:85, cautions:[], description:"Support incidents and access administration. ".repeat(10), postedAt:"2026-10-12T10:00:00Z", lastSeenAt:now };
const meta = { applyUrl:"https://jobs.example.org/123", premiumSignal:"TOP_APPLICANT" };
test("LinkedIn qualification respects hard exclusions and substantive gaps regardless of Premium", () => {
  assert.equal(linkedInEligibility(candidate, meta, now).status,"eligible");
  for(const changes of [{excluded:true,cautions:["Unconfirmed salary"]},{cautions:["Required specialist credential"]},{postedAt:null},{lastSeenAt:"2026-10-09"},{dismissedAt:now},{approvedApplicationId:"existing"}]) assert.notEqual(linkedInEligibility({...candidate,...changes},meta,now).status,"eligible");
  assert.equal(linkedInEligibility({...candidate,cautions:["Work schedule: Travel up to 10%."]},meta,now).status,"eligible");
  assert.equal(linkedInEligibility(candidate,{...meta,destinationType:"EASY_APPLY"},now).status,"needs_review");
});
test("Premium only prioritizes comparable fit and never invents absent signals",()=>{
  assert.equal(premiumSignal({}),"UNKNOWN");
  assert.ok(rankLinkedIn({...candidate,score:95},{...candidate,score:65,linkedin:meta})<0);
  assert.ok(rankLinkedIn({...candidate,linkedin:meta},candidate)<0);
});
test("Pacific daily limits follow local midnight across daylight saving boundaries",()=>{
  assert.equal(pacificDayStart(now).toISOString(),"2026-10-13T07:00:00.000Z");
  assert.equal(pacificDayStart(new Date("2026-11-02T10:00:00Z")).toISOString(),"2026-11-02T08:00:00.000Z");
});
test("manual scans obey rate limit and active lease; crashed lease expires",()=>{
  assert.equal(scanGate({retryAfter:"2026-10-14T10:00:00Z"},true,now)?.status,"cooldown");
  assert.equal(scanGate({status:"running",startedAt:now.toISOString()},true,now)?.status,"running");
  assert.equal(scanGate({status:"running",startedAt:"2026-10-11T10:00:00Z"},false,now),null);
});
