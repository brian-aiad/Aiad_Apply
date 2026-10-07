/** Read qualifications in their section context, without treating company copy as requirements. */
export function requiredQualifications(description: string): string[] {
  const required = /^(?:education and experience|technical competencies(?: \(knowledge, skills & abilities\))?|required qualifications|minimum qualifications|basic qualifications|qualifications you must have|qualifications we require|what you(?:’|')?ll bring|what you bring|what you need|what we're looking for|what we’re looking for|requirements|qualifications|your qualifications|who you are|here(?:’|')s what you(?:’|')ll need)\s*:?$/i;
  const optional = /^(?:preferred qualifications|qualifications we prefer|qualifications you prefer|nice to haves?(?:\/other)?|bonus points(?: if you have)?|preferred skills|desirable qualifications)\s*:?$/i;
  const other = /^(?:what you(?:’|')?ll do|responsibilities|benefits|compensation|us salary range|salary range|about (?:us|the company)|equal opportunity|what we offer)\s*:?$/i;
  let section: "required" | "optional" | "other" = "other";
  const result: string[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[•*#\-\s]+/, "").trim();
    if (!line) continue;
    if (required.test(line)) { section = "required"; continue; }
    if (optional.test(line)) { section = "optional"; continue; }
    if (other.test(line)) { section = "other"; continue; }
    // Separate an explicit heading on one line from its qualification text.
    const colon = line.indexOf(":");
    if (colon > 0 && required.test(line.slice(0, colon))) {
      section = "required";
      if (line.slice(colon + 1).trim()) result.push(line.slice(colon + 1).trim());
      continue;
    }
    if (section === "optional") continue;
    if (section === "required" || /\b(?:must have|minimum of|required|at least|essential)\b/i.test(line) || /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*years?\b[^.]{0,80}experience/i.test(line)) {
      result.push(...line.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(part => !/\b(?:not required|preferred|nice to have|no (?:prior )?experience)\b/i.test(part)));
    }
  }
  return result;
}

const yearWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export function experienceRequirement(lines: string[]): { years: number; text: string } | null {
  const thresholds: { years: number; text: string }[] = [];
  for (const line of lines) {
    // A lower master's/PhD pathway does not establish eligibility for a bachelor's holder.
    const bachelorPath = line.split(/\bor\b/i).filter(part => !/\b(?:master|Ph\.?D|doctorate)/i.test(part));
    const eligible = bachelorPath.length ? bachelorPath.join(" or ") : line;
    if (!/experience|background|working|supporting/i.test(eligible)) continue;
    const values = [...eligible.matchAll(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[-–—]\s*(?:\d{1,2}|\w+))?\+?\s*(?:years?|yrs?)\b/gi)]
      .map(match => yearWords[match[1].toLowerCase()] ?? Number(match[1]));
    if (values.length) thresholds.push({ years: Math.min(...values), text: line });
  }
  // Independent requirements all apply; one year of SQL cannot cancel five years of support.
  return thresholds.sort((a, b) => b.years - a.years)[0] ?? null;
}

export function clearanceRequirement(description: string): "existing" | "obtainable" | "mentioned" | null {
  const lines = description.split(/\n/).filter(line => /\bclearance\b|TS\/SCI/i.test(line) && !/not required|no (?:security )?clearance required|clearance (?:type|level):\s*(?:none|not required)/i.test(line));
  if (lines.some(line => /active|current|existing|prior to (?:start|employment)|before (?:start|employment)/i.test(line) && !/ability to obtain|able to obtain|after day (?:1|one)|or (?:be able to )?obtain/i.test(line))) return "existing";
  if (lines.some(line => /(?:ability|able|eligible) to (?:obtain|secure)|obtain and maintain|after day (?:1|one)/i.test(line))) return "obtainable";
  return lines.length ? "mentioned" : null;
}

export function roleConditions(description: string): string[] {
  const conditions: string[] = [];
  const travel = description.match(/(?:willingness to |ability to |must )?travel\s+(?:up to\s+)?(\d{1,3})\s*%/i);
  if (travel && Number(travel[1]) > 0 && Number(travel[1]) <= 100) conditions.push(`Travel up to ${travel[1]}%`);
  if (/\b(?:2nd|second|evening) shift\b/i.test(description)) conditions.push("Evening / second shift");
  if (/\b(?:3rd|third|overnight|night) shift\b/i.test(description)) conditions.push("Overnight / third shift");
  if (/\bon[ -]call (?:rotation|schedule|support|duty)|participate in[^.\n]{0,45}on[ -]call/i.test(description)) conditions.push("On-call rotation");
  return conditions;
}
