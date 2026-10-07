import { clearanceRequirement, experienceRequirement, requiredQualifications, roleConditions } from "./requirements";
import { rtxFit } from "./rtx-fit";
import occupationTitles from "./occupation-titles.json";
import resumeEvidence from "./candidate-evidence.json";
import type { DiscoveryPreferences, Opening } from "./types";

// The protected document's checked-in inspection, not generated resume prose.
const baseEvidence = resumeEvidence.evidence.join("\n").toLowerCase();
const skillDefinitions: [string, RegExp, string][] = [
  ["SQL & databases", /\b(?:SQL|PostgreSQL|MySQL|database queries)\b/i, "sql"],
  ["API troubleshooting", /\b(?:REST|APIs?|Postman|webhooks?)\b/i, "postman"],
  ["Microsoft 365", /\b(?:Microsoft|Office|M)\s*365\b/i, "microsoft 365"],
  ["Identity & access", /\b(?:Entra|Azure AD|RBAC|SSO|SAML|OAuth|MFA)\b/i, "entra"],
  ["Incident resolution", /\b(?:incident|troubleshoot\w*|root cause|production support)\b/i, "incident"],
  ["Python & automation", /\b(?:Python|PowerShell|Bash)\b/i, "python"],
  ["Ticketing & SLAs", /\b(?:Jira|ticket\w*|SLAs?|escalation\w*)\b/i, "jira"],
  ["Cloud & operating systems", /\b(?:AWS|Linux|Windows|EC2|IAM)\b/i, "linux"],
  ["Integrations & data flows", /\b(?:ETL|integrations?|data.sync|synchroni[sz]\w*)\b/i, "etl"],
  ["SaaS support", /\b(?:SaaS|application support|software support)\b/i, "saas"],
];

export function excludedTitle(title: string) {
  return /\b(?:director|head of|vice president|vp|intern|internship|principal|staff engineer|mechanical|electrical|aerospace|avionics|payload|fluid|environmental test|mission|manufacturing|weld|life support|logistics|subcontracts|field service|sales|RF|propulsion|weapons?|missiles?|maritime|flight|air vehicles|robotics|electronic warfare|precision engagement|advanced effects|edge compute)\b/i.test(title);
}

export function roleFamily(title: string): "core" | "adjacent" | null {
  if (excludedTitle(title)) return null;
  if (/\b(?:application|technical|technology|production|software|product|IT|IS|desktop|systems?)\s+support\b|\bsupport\s+(?:engineer|analyst|specialist|technician|representative|rep)\b|\b(?:service|help)[ -]?desk\b/i.test(title)) return "core";
  if (/\b(?:implementation|integration|integrations)\s+(?:analyst|specialist|engineer|consultant)\b|\b(?:business|IT|information)\s+systems\b|\bsystems?\s+administrator\b|\bIT\s+(?:operations|analyst|specialist|technician)\b/i.test(title)) return "adjacent";
  if (/\b(?:applications?|business|systems?|business systems|information systems|technical|integration|data operations|data quality|implementation|reporting|identity|access|IAM|IT)\s+(?:analyst|administrator|specialist|consultant)\b|\b(?:QA|quality assurance|software test|API test)\s+(?:analyst|engineer|tester)\b/i.test(title)) return "adjacent";
  if (/\b(?:business strategy|consumer insights|business intelligence|reporting|data quality|data operations)\b.*\banalyst\b/i.test(title)) return "adjacent";
  const normalized = title.toLowerCase().replace(/\b(?:junior|jr|senior|sr|associate|ii|iii|iv|1|2|3)\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (occupationTitles.titles.some((item) => item.title.toLowerCase().split(" (")[0] === normalized)) return "adjacent";
  return null;
}

export function couldBeRelevant(title: string) {
  return !excludedTitle(title) && (roleFamily(title) !== null || /\b(?:analyst|specialist|administrator|support|technician|consultant)\b/i.test(title));
}

// Approximate city centres; the UI explicitly distinguishes radius from road miles.
const cities: [string, number, number][] = [
  ["seal beach", 33.7414, -118.1048], ["long beach", 33.7701, -118.1937],
  ["los alamitos", 33.8031, -118.0726], ["rossmoor", 33.7856, -118.0851],
  ["cypress", 33.816, -118.0373], ["westminster", 33.7513, -117.994],
  ["huntington beach", 33.6595, -117.9988], ["fountain valley", 33.7092, -117.9537],
  ["garden grove", 33.7743, -117.9379], ["stanton", 33.8025, -117.9931],
  ["buena park", 33.8675, -117.9981], ["anaheim", 33.8366, -117.9143],
  ["fullerton", 33.8704, -117.9242], ["orange", 33.7879, -117.8531],
  ["santa ana", 33.7455, -117.8677], ["costa mesa", 33.6411, -117.9187],
  ["newport beach", 33.6189, -117.9298], ["irvine", 33.6846, -117.8265],
  ["tustin", 33.7459, -117.8262], ["lake forest", 33.6469, -117.6892],
  ["laguna hills", 33.5916, -117.6987], ["aliso viejo", 33.5677, -117.7256],
  ["mission viejo", 33.600, -117.672], ["laguna beach", 33.5427, -117.7854],
  ["cerritos", 33.8583, -118.0648], ["artesia", 33.8658, -118.0831],
  ["lakewood", 33.8536, -118.1339], ["bellflower", 33.8817, -118.117],
  ["norwalk", 33.9022, -118.0817], ["downey", 33.9401, -118.1332],
  ["carson", 33.8317, -118.282], ["torrance", 33.8358, -118.3406],
  ["gardena", 33.8884, -118.309], ["compton", 33.8958, -118.2201],
  ["hawthorne", 33.9164, -118.3526], ["el segundo", 33.9192, -118.4165],
  ["redondo beach", 33.8492, -118.3884], ["san pedro", 33.7361, -118.2922],
  ["los angeles", 34.0522, -118.2437], ["culver city", 34.0211, -118.3965],
  ["inglewood", 33.9617, -118.3531], ["santa monica", 34.0195, -118.4912],
  ["whittier", 33.9792, -118.0328], ["brea", 33.9167, -117.9001],
  ["la mirada", 33.9172, -118.012], ["placentia", 33.8722, -117.8703],
  ["yorba linda", 33.8886, -117.8131], ["pasadena", 34.1478, -118.1445],
  ["burbank", 34.1808, -118.309], ["glendale", 34.1425, -118.2551],
  ["ontario", 34.0633, -117.6509], ["riverside", 33.9806, -117.3755],
  ["san diego", 32.7157, -117.1611], ["ventura", 34.2746, -119.229],
];

export function localDistance(location: string): number | null {
  const text = location.toLowerCase();
  // Avoid e.g. Irvine, Scotland or Lakewood, Colorado.
  if (/\b(?:scotland|canada|australia|india|united kingdom|colorado|new jersey|new york|texas|florida|washington|CO|NJ|NY|TX|FL|WA)\b/i.test(location)) return null;
  const matches = cities.filter(([city]) => new RegExp(`\\b${city}\\b`).test(text));
  if (!matches.length) return null;
  // Multiple offices require a location choice, not assuming the closest one.
  if (matches.length > 1) return null;
  const [, lat, lon] = matches[0];
  const rad = (n: number) => n * Math.PI / 180;
  const a = Math.sin(rad(lat - 33.7414) / 2) ** 2 + Math.cos(rad(33.7414)) * Math.cos(rad(lat)) * Math.sin(rad(lon + 118.1048) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export function hasLocalLocationOption(location: string, radiusMiles: number) {
  // Multi-office postings stay reviewable; never label a faraway office as local.
  return [...location.matchAll(/([A-Za-z ]+),\s*(?:CA|California)\b/g)].some((match) => {
    const distance = localDistance(`${match[1].trim()}, CA`);
    return distance !== null && distance <= radiusMiles;
  });
}

export function assessOpening(opening: Opening, preferences: DiscoveryPreferences) {
  let family = roleFamily(opening.title);
  const distanceMiles = localDistance(opening.location);
  const remote = opening.workArrangement === "Remote";
  const text = opening.description;
  const positiveText = text.split(/\n|(?<=[.!?])\s+/).filter((line) => !/\b(?:not required|no (?:prior )?experience (?:with|in)|does not require)\b/i.test(line)).join("\n");
  const matchReasons = skillDefinitions.filter(([, pattern, evidence]) => baseEvidence.includes(evidence) && pattern.test(positiveText)).map(([label]) => label);
  if (opening.sourceKey === "rtx:california") return rtxFit(opening, distanceMiles, matchReasons, new Date(), preferences);
  const cautions: string[] = [];
  if (!family && couldBeRelevant(opening.title) && matchReasons.length >= 4) {
    family = "adjacent";
    cautions.push("Related duties found under an unfamiliar title; review the role scope.");
  }
  let excluded = !family || /\b(?:software|systems?|electrical|mechanical|manufacturing|test)\s+engineer\s*(?:II|2|III|3)\b/i.test(opening.title) && !/\b(?:IT|support)\b/i.test(opening.title);
  if (remote && !preferences.includeRemote) excluded = true;
  if (remote && !/\b(?:United States|USA|US|California|CA)\b/i.test(opening.location)) {
    cautions.push("Confirm this remote role hires in California.");
  }
  if (!remote && distanceMiles === null) {
    if (!/^(?:California|CA|Orange County)(?:,|$)/i.test(opening.location) && !hasLocalLocationOption(opening.location, preferences.radiusMiles)) excluded = true;
    cautions.push(`Confirm the worksite is within ${preferences.radiusMiles} miles of Seal Beach.`);
  }
  if (!remote && distanceMiles !== null && distanceMiles > preferences.radiusMiles) excluded = true;
  if (opening.employmentType === "Other") excluded = true;
  if (opening.employmentType === "Not listed") cautions.push("Full-time status is not listed.");
  if (opening.salaryMax !== null && opening.salaryMax < preferences.minimumSalary) excluded = true;
  if (opening.salaryMin === null) cautions.push("Salary is not confirmed; ask for the base-pay range.");
  else if (opening.salaryMin < preferences.minimumSalary) cautions.push("The posted range starts below your salary target.");
  const senior = /\b(?:senior|sr\.?|lead|manager|supervisor|staff)\b/i.test(opening.title);
  if (senior) { excluded = true; cautions.push("Senior or leadership role is outside your current entry/support target."); }
  const requiredLines = requiredQualifications(text);
  const experience = experienceRequirement(requiredLines);
  if (experience && experience.years > 3) {
    cautions.push(`Required experience: ${experience.years}+ years; your documented background is 3+ years. ${experience.years >= 5 ? "Outside your current target." : "Review this stretch before tailoring."}`);
    if (experience.years >= 5) excluded = true;
  }
  const clearance = clearanceRequirement(text);
  if (clearance === "existing") {
    cautions.push(preferences.clearance === "none" ? "Existing clearance required; you confirmed no active clearance." : "Existing clearance required; confirm the level and transferability.");
    if (preferences.clearance === "none") excluded = true;
  } else if (clearance) cautions.push(clearance === "obtainable" ? "The posting allows obtaining clearance; confirm the eligibility and timeline." : "Clearance requirement is unclear; check the employer posting.");
  if (/\b(?:CAD|NX|TeamCenter|AV|Workday|security officer|security manager)\b/i.test(opening.title)) cautions.push("Specialist platform or domain experience is not established by your base resume; review the requirements carefully.");
  if (/\b(?:software|systems?) engineer\b/i.test(opening.title) && !/\b(?:IT|support)\b/i.test(opening.title)) excluded = true;
  const specialtyDomains = [...new Set(requiredLines.filter(line => /experience|background|proficien/i.test(line)).flatMap(line =>
    [...line.matchAll(/\b(?:IT engineering|embedded|radar|RF|hardware (?:design|test)|manufacturing|supply chain|defense logistics|financial analysis|business analytics|consumer insights|market research)\b/gi)].map(match => match[0].toLowerCase())
  ))];
  if (specialtyDomains.length) {
    cautions.push(`Required ${specialtyDomains.slice(0, 3).join(" / ")} experience is not established by your support/IT background.`);
  }
  if (!requiredLines.length) cautions.push("Required qualifications were not clearly identified; review the full posting.");
  cautions.push(...roleConditions(`${opening.title}\n${text}`).map(condition => `Work schedule: ${condition}.`));
  const specialistRequirements = ["ServiceNow", "Salesforce", "SAP", "Workday", "Epic", "Cerner", "CISSP", "CCNP", "Kubernetes", "Terraform", "Oracle ERP", "Odoo"];
  for (const term of specialistRequirements) {
    if (!baseEvidence.includes(term.toLowerCase()) && requiredLines.some((line) => new RegExp(`\\b${term}\\b`, "i").test(line) && !(/e\.g\.|such as|\bor\b/i.test(line) && /\b(?:Jira|Python|SQL|Microsoft 365)\b/i.test(line)))) {
      cautions.push(`Required ${term} experience or credential is not established in your base resume.`);
    }
  }
  if (opening.sourceKey.startsWith("adzuna:")) cautions.push("Adzuna supplies a description excerpt. Open the source and capture the full posting before tailoring.");
  if (opening.sourceKey.startsWith("usajobs:")) cautions.push("Federal opening: verify hiring eligibility, specialized experience and the announcement's resume requirements.");
  if (matchReasons.length < 3) cautions.push("Limited overlap with the duties documented in your base resume.");
  const score = Math.max(0, Math.min(100, (family === "core" ? 32 : family ? 28 : 0)
    + Math.min(49, matchReasons.length * 7)
    + (distanceMiles !== null && distanceMiles <= 15 ? 6 : 0)
    + (opening.salaryMin !== null && opening.salaryMin >= preferences.minimumSalary ? 5 : 0)
    + (opening.employmentType === "Full-time" ? 4 : 0)
    - (senior ? 16 : 0) - (cautions.some((c) => c.startsWith("Required ")) ? 18 : 0)));
  return { excluded, distanceMiles, score, matchReasons: [...(family === "core" ? ["Support duties align with your IT / application support background"] : family === "adjacent" ? ["Adjacent systems, analyst or operations route"] : []), ...matchReasons], cautions, qualified: !excluded && cautions.length === 0 && matchReasons.length >= 3 && score >= 65 };
}
