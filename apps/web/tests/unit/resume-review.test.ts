import assert from "node:assert/strict";
import test from "node:test";
import { groupResumeChanges, reviewParagraphLabel } from "../../src/lib/resume-review";

function change(paragraphId: string, extra = {}) {
  return { paragraphId, section: paragraphId.split(".bullet.")[0], paragraphKind: "bullet", beforeText: "Original sentence.", finalText: "Tailored sentence.", changeType: "reframed", ...extra };
}

test("uses saved document order instead of database alphabetical order, preserving input", () => {
  const input = [change("experience.csulb.bullet.2"), change("summary"), change("experience.original_insurance.bullet.1"), change("skills.tools")];
  const original = [...input];
  const groups = groupResumeChanges(input, ["summary", "skills.tools", "experience.original_insurance.bullet.1", "experience.csulb.bullet.2"]);
  assert.deepEqual(groups.map((g) => g.id), ["summary", "skills", "experience.original_insurance", "experience.csulb"]);
  assert.deepEqual(input, original);
  assert.equal(groups[2].title, "Original Insurance Group");
});

test("historical reports without ordering follow template order with numeric bullets", () => {
  const input = ["projects.loavenly.bullet.1", "experience.csulb.bullet.1", "experience.original_insurance.bullet.10", "skills.tools", "summary", "experience.wehelp.bullet.1", "experience.original_insurance.bullet.2", "skills.technical_support"].map((id) => change(id));
  const groups = groupResumeChanges(input, []);
  assert.deepEqual(groups.map((g) => g.id), ["summary", "skills", "experience.original_insurance", "experience.csulb", "experience.wehelp", "projects.loavenly"]);
  assert.deepEqual(groups[2].changes.map((c) => c.paragraphId), ["experience.original_insurance.bullet.2", "experience.original_insurance.bullet.10"]);
  assert.equal(groups[1].changes[0].paragraphId, "skills.technical_support");
});

test("actual exported text excludes reverted proposals and retains punctuation-only edits", () => {
  const groups = groupResumeChanges([
    change("skills.tools", { finalText: "Original sentence." }),
    change("summary", { finalText: "Original sentence!", changeType: "unchanged" }),
  ], []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "summary");
  assert.equal(groups[0].changes[0].finalText, "Original sentence!");
});

test("partial and duplicate saved order retains unknown historical sections", () => {
  const groups = groupResumeChanges([
    change("experience.other_employer.bullet.2", { section: "experience" }),
    change("experience.csulb.bullet.2"), change("summary"), change("education.degree", { section: "education" }),
  ], ["experience.other_employer.bullet.2", "summary", "experience.other_employer.bullet.2"]);
  assert.deepEqual(groups.map((g) => g.id), ["experience.other_employer", "summary", "experience.csulb", "education"]);
  assert.equal(groups[0].title, "Other Employer");
  assert.equal(groups[0].category, "Experience");
});

test("unchanged paragraphs still establish their group's saved position", () => {
  const groups = groupResumeChanges([
    change("experience.csulb.bullet.1", { finalText: "Original sentence." }),
    change("experience.csulb.bullet.3"), change("experience.original_insurance.bullet.1"),
  ], ["experience.csulb.bullet.1", "experience.original_insurance.bullet.1"]);
  assert.equal(groups[0].id, "experience.csulb");
  assert.equal(groups[0].changes.length, 1);
  assert.equal(reviewParagraphLabel(groups[0].changes[0]), "Bullet 3");
});

test("labels use protected Skills headings and readable historical fallbacks", () => {
  assert.equal(reviewParagraphLabel(change("summary", { paragraphKind: "summary" })), "Summary");
  assert.equal(reviewParagraphLabel(change("skills.languages_dbs", { beforeText: "Languages & DBs: Python, SQL", paragraphKind: "skill_line" })), "Languages & DBs");
  assert.equal(reviewParagraphLabel(change("skills.apis_integrations", { beforeText: "APIs & Integrations: JSON", paragraphKind: "skill_line" })), "APIs & Integrations");
  assert.equal(reviewParagraphLabel(change("skills.old_category", { section: "skills" })), "Old Category");
  assert.equal(reviewParagraphLabel(change("experience.csulb.heading", { paragraphKind: "entry_heading" })), "Heading");
  assert.deepEqual(groupResumeChanges([], []), []);
});
