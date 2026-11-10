import assert from "node:assert/strict";
import test from "node:test";
import { chooseNextAction } from "../../src/lib/next-action";

const application = (status: string, company: string, runStatus = "SUCCEEDED") => ({
  id: `${company.toLocaleLowerCase()}-id`,
  status,
  job: { company, title: `${company} Support Engineer` },
  tailoringRuns: [{ status: runStatus, errorMessage: runStatus === "FAILED" ? "Renderer unavailable" : null }],
});

test("next actions keep their label, destination, and button aligned", () => {
  const result = chooseNextAction({
    followUps: [{ id: "follow-up-id", job: { company: "Due Co", title: "Support Analyst" } }],
    applications: [application("READY", "Ready Co")],
    strongDiscoveries: 4,
  });
  assert.deepEqual(
    { kind: result.kind, href: result.href, actionLabel: result.actionLabel },
    { kind: "apply", href: "/applications/ready co-id?tab=apply", actionLabel: "Open ready application" },
  );
});

test("next actions prioritize ready work and surface failed tailoring before saved jobs", () => {
  const ready = chooseNextAction({
    followUps: [],
    applications: [application("CAPTURED", "Saved Co"), application("READY", "Ready Co")],
    strongDiscoveries: 0,
  });
  assert.equal(ready.kind, "apply");

  const retry = chooseNextAction({
    followUps: [],
    applications: [application("CAPTURED", "Saved Co"), application("CAPTURED", "Failed Co", "FAILED")],
    strongDiscoveries: 0,
  });
  assert.equal(retry.kind, "retry");
  assert.match(retry.note, /Renderer unavailable/);
});

test("next actions send an empty workspace to curated discovery", () => {
  const result = chooseNextAction({ followUps: [], applications: [], strongDiscoveries: 3 });
  assert.equal(result.kind, "discover");
  assert.match(result.label, /3 strong openings/);
});

test("next action explains a database-backed queue when the worker is offline", () => {
  const result = chooseNextAction({
    followUps: [],
    applications: [application("TAILORING", "Queued Co", "QUEUED")],
    strongDiscoveries: 0,
    workerAvailable: false,
  });

  assert.equal(result.kind, "wait");
  assert.match(result.label, /Waiting to tailor/);
  assert.match(result.note, /saved.*worker reconnects/i);
});


test("urgent commitments outrank ready work without letting old reminders monopolize Today", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const result = chooseNextAction({ followUps: [], applications: [application("READY", "Ready Co")], strongDiscoveries: 0, now,
    commitments: [{ id: "interview", dueAt: new Date("2026-10-21T12:00:00Z"), job: { company: "Interview Co", title: "Support" } }] });
  assert.equal(result.kind, "commitment");
});

test("a reviewed resume with an uncertain attempt is recovery work, never a fresh Apply recommendation", () => {
  const result=chooseNextAction({ followUps:[], applications:[{...application("READY","Uncertain Co"),automationStatus:"UNKNOWN"}],strongDiscoveries:0 });
  assert.equal(result.kind,"recovery");
  const safe=chooseNextAction({followUps:[],applications:[{...application("READY","Uncertain Co"),automationStatus:"UNKNOWN"},application("REVIEW","New Co")],strongDiscoveries:0});
  assert.equal(safe.kind,"review");
});
