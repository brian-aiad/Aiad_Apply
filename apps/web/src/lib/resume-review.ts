type ReviewChange = {
  paragraphId: string;
  section: string;
  paragraphKind: string;
  beforeText: string;
  finalText: string;
  changeType: string;
};

const sections: Record<string, { title: string; category: string; order: number }> = {
  summary: { title: "Professional summary", category: "Summary", order: 0 },
  skills: { title: "Skills", category: "Skills", order: 1 },
  "experience.original_insurance": { title: "Original Insurance Group", category: "Experience", order: 2 },
  "experience.csulb": { title: "Cal State Long Beach", category: "Experience", order: 3 },
  "experience.wehelp": { title: "WeHelp · Christ the Good Shepherd Food Bank", category: "Experience", order: 4 },
  "projects.loavenly": { title: "Loavenly", category: "Projects", order: 5 },
};

const skillOrder = [
  ["technical_support", "support_operations"],
  ["apis_identity", "identity_admin"],
  ["languages_dbs", "apis_integrations"],
  ["cloud_systems", "scripting_data"],
  ["tools", "cloud_tools"],
];

function humanize(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectionId(change: Pick<ReviewChange, "section" | "paragraphId">) {
  // Semantic paragraph IDs retain the employer even in older records with only
  // a broad section label such as "experience".
  const entry = change.paragraphId.match(/^(experience|projects)\.([^.]+)/);
  if (entry) return `${entry[1]}.${entry[2]}`;
  if (change.paragraphId === "summary" || change.paragraphId.startsWith("summary.")) return "summary";
  if (change.paragraphId.startsWith("skills.")) return "skills";
  return change.section || change.paragraphId.split(".")[0] || "other";
}

function fallbackParagraphOrder(change: ReviewChange) {
  const bullet = change.paragraphId.match(/\.bullet\.(\d+)$/);
  if (bullet) return Number(bullet[1]);
  if (change.paragraphKind === "entry_heading" || change.paragraphKind === "section_heading") return -1;
  if (sectionId(change) === "skills") {
    const index = skillOrder.findIndex((aliases) => aliases.includes(change.paragraphId.replace(/^skills\./, "")));
    if (index >= 0) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function reviewParagraphLabel(change: Pick<ReviewChange, "paragraphId" | "paragraphKind" | "section" | "beforeText">) {
  const bullet = change.paragraphId.match(/\.bullet\.(\d+)$/);
  if (bullet) return `Bullet ${Number(bullet[1])}`;
  if (sectionId(change) === "summary") return "Summary";
  if (sectionId(change) === "skills") {
    const colon = change.beforeText.indexOf(":");
    if (colon > 0) return change.beforeText.slice(0, colon).trim();
  }
  if (change.paragraphKind === "entry_heading" || change.paragraphKind === "section_heading") return "Heading";
  const suffix = change.paragraphId.replace(`${sectionId(change)}.`, "");
  return humanize(suffix) || "Paragraph";
}

export function groupResumeChanges<T extends ReviewChange>(changes: T[], reportOrder: string[]) {
  const positions = new Map<string, number>();
  reportOrder.forEach((id, index) => { if (!positions.has(id)) positions.set(id, index); });
  const groups = new Map<string, { id: string; title: string; category: string; changes: T[] }>();
  const groupPositions = new Map<string, number>();
  for (const change of changes) {
    const id = sectionId(change);
    const position = positions.get(change.paragraphId);
    if (position !== undefined) groupPositions.set(id, Math.min(groupPositions.get(id) ?? Infinity, position));
    // The exported text is authoritative, including punctuation and whitespace.
    // Layout fallback can leave a proposed edit identical to the original.
    if (change.beforeText === change.finalText) continue;
    let group = groups.get(id);
    if (!group) {
      const known = sections[id];
      const [category, ...entry] = id.split(".");
      group = { id, title: known?.title ?? humanize(entry.join(" ") || id), category: known?.category ?? humanize(category), changes: [] };
      groups.set(id, group);
    }
    group.changes.push(change);
  }
  const byRecordedOrder = (a: number | undefined, b: number | undefined) => {
    if (a !== undefined && b !== undefined) return a - b;
    if (a !== undefined) return -1;
    if (b !== undefined) return 1;
    return 0;
  };
  for (const group of groups.values()) {
    group.changes.sort((a, b) => byRecordedOrder(positions.get(a.paragraphId), positions.get(b.paragraphId))
      || fallbackParagraphOrder(a) - fallbackParagraphOrder(b)
      || a.paragraphId.localeCompare(b.paragraphId, undefined, { numeric: true }));
  }
  return [...groups.values()].sort((a, b) => byRecordedOrder(groupPositions.get(a.id), groupPositions.get(b.id))
    || (sections[a.id]?.order ?? 100) - (sections[b.id]?.order ?? 100)
    || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
