import { postedWithin } from "./freshness";
import { clearanceRequirement, experienceRequirement, requiredQualifications } from "./requirements";
import type { DiscoveryPreferences, Opening } from "./types";

/** Brian targets support/IT and genuine entry routes, not experienced software engineering. */
export function rtxExperiencedTitle(title: string) {
  return /\b(?:senior|sr|principal|principle|manager|director|lead|leader|chief|staff|supervisor|S[3-6]|III|IV|[3456])\b/i.test(title)
    || /\bengineer\s*(?:II|2)\b/i.test(title)
    || /\bengineer\b/i.test(title) && !/\b(?:I|1|entry[ -]level|associate|junior)\b/i.test(title)
      && !/\b(?:IT|desktop|application|technical|systems?|software)\s+support\s+engineer\b/i.test(title);
}

export function rtxRequiredSection(text: string) {
  return text.split(/Qualifications (?:You Must Have|We Require)|Basic Qualifications|Minimum Qualifications|Required Qualifications/i)[1]?.split(/Qualifications (?:We Prefer|You Prefer)|Preferred Qualifications|What We Offer/i)[0] ?? text;
}

/** Rank actual career fit. Scores are sorting aids, never a likelihood of being hired. */
export function rtxFit(opening: Opening, distanceMiles: number | null, overlap: string[], now = new Date(), eligibility: Pick<DiscoveryPreferences, "usCitizen" | "clearance"> = {}) {
  const text = opening.description;
  const required = rtxRequiredSection(text);
  const cautions: string[] = [];
  const reasons: string[] = [];
  const requirementLines = requiredQualifications(text);
  const yearsRequirement = experienceRequirement(requirementLines.length ? requirementLines : required.split(/\n/));
  const minYears = yearsRequirement?.years ?? null;
  const clearance = clearanceRequirement(text);
  const dayOne = clearance === "existing";
  const support = /\b(?:IT|desktop|application|technical|systems?|software)\s+support\b|\b(?:help|service)[ -]?desk\b|\b(?:IT|information technology)\s+(?:specialist|technician|analyst)\b|\bsystems? administrator\b/i.test(opening.title);
  const adjacent = /\b(?:business|data|program|cost|supply chain|operations|production|procurement|material|financial)\b.*\b(?:analyst|planner|coordinator|specialist|associate)\b|\b(?:analyst|planner|coordinator|administrative assistant)\b/i.test(opening.title);
  const physical = /\b(?:operator|assembler|technician|production worker|inspector)\b/i.test(opening.title) && !support;
  const engineering = /\bengineer\b/i.test(opening.title) && !support;
  const specialistExperience = required.split(/\n|(?<=[.!?])\s+/).some((line) =>
    /\bexperience\b/i.test(line) && !/\b(?:no|without|not required|preferred)\b/i.test(line)
    && /\bembedded|real.time|radar|RF\/|circuit|semiconductor|lithography|machinin|solder|fabrication|composite|cleanroom|manufacturing organizations|environmental health and safety|EH&S/i.test(line));
  const nonCsDegree = /(?:degree|bachelor)[^\n.]{0,70}\b(?:electrical|mechanical|chemical|aerospace) engineering\b/i.test(required)
    && !/computer science|\bSTEM\b|related (?:field|discipline)|equivalent/i.test(required);
  if (support) reasons.push("Closest to your application support / IT background");
  else if (adjacent) reasons.push("Adjacent analyst or operations route");
  else if (physical) reasons.push("Alternative entry route outside IT");
  else if (engineering) cautions.push("Entry engineering title, but your documented background is support/IT. Review the required engineering experience first.");
  else cautions.push("Role is outside your main support/IT search; confirm the work and entry requirements.");
  if (rtxExperiencedTitle(opening.title)) cautions.push("Outside your entry-level target: experienced engineering or senior role.");
  if (minYears !== null && minYears > 3) cautions.push(`Required experience pathway is ${minYears} years; outside your current target.`);
  else if (minYears !== null) reasons.push(`Entry pathway: ${minYears} years stated`);
  else if (/entry.level|no (?:prior )?experience|training (?:is |will be )?provided/i.test(required)) reasons.push("Entry-level or training pathway stated");
  else cautions.push("Experience threshold is not explicit; confirm the entry pathway.");
  if (specialistExperience) cautions.push("Requires specialist embedded, hardware, manufacturing or safety-program experience you have not established; drafting software keywords does not satisfy it.");
  for (const [term, pattern] of [["SAP/MRP", /\bSAP\b|\bMRP\b/i], ["financial analysis and communications", /financial (?:analysis|communications)/i]] as const) {
    if (pattern.test(required)) cautions.push(`Required ${term} experience is not established by your support/IT background; confirm the actual requirement before tailoring.`);
  }
  if (nonCsDegree) cautions.push("Required engineering degree does not list a CS or related-degree pathway.");
  if (dayOne) cautions.push(eligibility.clearance === "none" ? "Existing clearance required before starting; you confirmed no active clearance." : "Existing clearance required before starting; verify the exact level and transferability.");
  else if (/ability to obtain (?:a )?(?:security )?clearance/i.test(text) || /security clearance|DoD Clearance/i.test(text) && !/Security Clearance Type:\s*(?:None|Not Required)/i.test(text)) cautions.push("Clearance eligibility needs confirmation; the posting allows obtaining or maintaining clearance.");
  if (/U\.S\. citizenship is required|U\.S\. citizens|US citizen/i.test(text)) {
    if (eligibility.usCitizen === true) reasons.push("U.S. citizenship confirmed");
    else cautions.push("U.S. citizenship required; not confirmed in your profile.");
  }
  if (/computer science|\bSTEM\b|science, technology, engineering/i.test(required)) reasons.push("CS / STEM degree pathway listed");
  if (physical || adjacent && !support) cautions.push("Check daily duties, training and pay for this career change.");
  if (/transcripts|cumulative GPA/i.test(text)) cautions.push("Application requests transcripts/GPA; check the employer instructions.");
  if (distanceMiles === null || distanceMiles > 30) cautions.push(opening.workArrangement === "Remote" ? "California remote role; confirm home-location eligibility." : "Outside the confirmed Seal Beach commute radius; check the exact worksite.");
  if (opening.salaryMin === null) cautions.push("Base pay not confirmed.");
  else if (opening.salaryMin < 60000) cautions.push("Posted pay starts below your $60k target.");
  if (opening.employmentType === "Not listed") cautions.push("Full-time status is not confirmed.");
  const excluded = rtxExperiencedTitle(opening.title) || /\b(?:intern|internship|co-op|skillbridge)\b/i.test(opening.title)
    || minYears !== null && minYears > 3 || specialistExperience || nonCsDegree
    || dayOne && eligibility.clearance === "none" || eligibility.usCitizen === false && /U\.S\. citizenship is required|U\.S\. citizens|US citizen/i.test(text)
    || !postedWithin(opening.postedAt, 21, now) || opening.employmentType === "Other";
  const score = Math.max(0, Math.min(engineering ? 49 : physical ? 55 : 95,
    (support ? 65 : adjacent ? 45 : physical ? 25 : 15) + Math.min(15, overlap.length * 3)
    + (minYears !== null && minYears <= 2 ? 10 : 0) - (dayOne || specialistExperience || nonCsDegree ? 40 : 0)));
  return { excluded, distanceMiles, score, matchReasons: [...reasons, ...overlap], cautions, qualified: !excluded && support && cautions.length === 0 && score >= 65 };
}
