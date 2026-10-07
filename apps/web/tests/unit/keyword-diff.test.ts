import assert from "node:assert/strict";
import test from "node:test";
import { highlightAddedKeywords, isSkillsReorder } from "../../src/lib/keyword-diff";
import { wordDiff } from "../../src/lib/word-diff";

test("audited multiword additions form one purple span across changed and unchanged words", () => {
  const before = "Supported data from 22 feeds.";
  const after = "Supported data integration from 22 feeds.";
  const parts = highlightAddedKeywords(wordDiff(before, after).after, ["data integration"]);
  assert.deepEqual(parts.filter(part => part.keyword).map(part => part.text), ["data integration"]);
  assert.equal(parts.map(part => part.text).join(""), after);
  assert.ok(parts.some(part => !part.keyword && !part.changed));
});

test("case-insensitive whole-term matches preserve case, punctuation and whitespace", () => {
  const after = "API, capital, APIs, API_key; C++, C#, .NET. DATA\n  integration!";
  const parts = highlightAddedKeywords([{ text: after, changed: true }], ["API", "C++", "C#", ".NET", "data integration"]);
  assert.deepEqual(parts.filter(part => part.keyword).map(part => part.text), ["API", "C++", "C#", ".NET", "DATA\n  integration"]);
  assert.equal(parts.map(part => part.text).join(""), after);
});

test("overlapping phrases, repeated occurrences and duplicate terms never duplicate text", () => {
  const after = "Data integration and data integration.";
  const parts = highlightAddedKeywords(wordDiff("Data and data.", after).after, ["data", "integration", "data integration", "data integration"]);
  assert.deepEqual(parts.filter(part => part.keyword).map(part => part.text), ["Data integration", "data integration"]);
  assert.equal(parts.map(part => part.text).join(""), after);
});

test("missing audited terms do not create highlights or change the diff", () => {
  const parts = wordDiff("Support production.", "Troubleshoot production.").after;
  assert.deepEqual(highlightAddedKeywords(parts, []), parts);
  assert.deepEqual(highlightAddedKeywords(parts, ["API", " "]), parts);
});

test("historical skill order changes are distinguished from additions and rewrites", () => {
  assert.equal(isSkillsReorder("Languages & DBs: Python, SQL", "Languages & DBs: SQL, Python"), true);
  assert.equal(isSkillsReorder("Support: Production Support, Troubleshooting", "Support: Troubleshooting, Production Support"), true);
  assert.equal(isSkillsReorder("Languages: Python, SQL", "Languages: SQL, Python, JSON"), false);
  assert.equal(isSkillsReorder("Skills: API, API, SQL", "Skills: API, SQL, SQL"), false);
  assert.equal(isSkillsReorder("Skills: Python, SQL", "Skills: Python, SQL"), false);
  assert.equal(isSkillsReorder("Python, SQL", "SQL, Python"), false);
});
