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

export function roleFamily(title: string): "core" | "adjacent" | null {
  if (/\b(?:director|head of|vice president|vp|intern|internship|principal|staff engineer)\b/i.test(title)) return null;
  if (/\b(?:mechanical|electrical|aerospace|avionics|payload|fluid|environmental test|mission|manufacturing|weld|life support|logistics|subcontracts|field service|sales|RF|propulsion|weapons?|missiles?|maritime|flight|air vehicles|robotics|electronic warfare|precision engagement|advanced effects|edge compute)\b/i.test(title)) return null;
  if (/\b(?:application|technical|production|software|product|IT|IS|desktop|systems?)\s+support\b|\bsupport\s+(?:engineer|analyst|specialist|technician)\b|\b(?:service|help)[ -]?desk\b/i.test(title)) return "core";
  if (/\b(?:implementation|integration|integrations)\s+(?:analyst|specialist|engineer|consultant)\b|\b(?:business|IT|information)\s+systems\b|\bsystems?\s+administrator\b|\bIT\s+(?:operations|analyst|specialist|technician)\b/i.test(title)) return "adjacent";
  return null;
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

export function assessOpening(opening: Opening, preferences: DiscoveryPreferences) {
  const family = roleFamily(opening.title);
  const distanceMiles = localDistance(opening.location);
  const remote = opening.workArrangement === "Remote";
  const text = opening.description;
  const matchReasons = skillDefinitions.filter(([, pattern, evidence]) => baseEvidence.includes(evidence) && pattern.test(text)).map(([label]) => label);
  const cautions: string[] = [];
  let excluded = !family;
  if (remote && !preferences.includeRemote) excluded = true;
  if (remote && !/\b(?:United States|USA|US|California|CA)\b/i.test(opening.location)) {
    cautions.push("Confirm this remote role hires in California.");
  }
  if (!remote && distanceMiles === null) {
    if (!/^(?:California|CA|Orange County)(?:,|$)/i.test(opening.location)) excluded = true;
    cautions.push("Confirm the worksite is within 30 miles of Seal Beach.");
  }
  if (!remote && distanceMiles !== null && distanceMiles > preferences.radiusMiles) excluded = true;
  if (opening.employmentType === "Other") excluded = true;
  if (opening.employmentType === "Not listed") cautions.push("Full-time status is not listed.");
  if (opening.salaryMax !== null && opening.salaryMax < preferences.minimumSalary) excluded = true;
  if (opening.salaryMin === null) cautions.push("Salary is not confirmed; ask for the base-pay range.");
  else if (opening.salaryMin < preferences.minimumSalary) cautions.push("The posted range starts below your salary target.");
  const senior = /\b(?:senior|sr\.?|lead|manager|supervisor|staff)\b/i.test(opening.title);
  if (senior) cautions.push("Check seniority and leadership requirements against your experience.");
  if (/\b(?:security clearance|active clearance|SECRET|TS\/SCI)\b/i.test(`${opening.title}\n${text}`)) cautions.push("Clearance mentioned: check whether it is required and confirm your eligibility; your resume does not establish clearance.");
  if ([...text.matchAll(/\b(\d{1,2})(?:\s*[-–—]\s*\d{1,2})?\+?\s*(?:years|yrs)\b[^\n.]{0,100}\bexperience\b/gi)].some((m) => Number(m[1]) > 3)) cautions.push("The experience requirement may exceed the 3+ years on your base resume.");
  if (/\b(?:CAD|NX|TeamCenter|AV|Workday|security officer|security manager)\b/i.test(opening.title)) cautions.push("Specialist platform or domain experience is not established by your base resume; review the requirements carefully.");
  if (matchReasons.length < 2) cautions.push("Limited overlap with the skills documented in your base resume.");
  const score = Math.max(0, Math.min(100, (family === "core" ? 38 : family ? 25 : 0) + Math.min(48, matchReasons.length * 7) + (distanceMiles !== null && distanceMiles <= 15 ? 6 : 0) - (senior ? 16 : 0)));
  return { excluded, distanceMiles, score, matchReasons, cautions, qualified: !excluded && cautions.length === 0 && matchReasons.length >= 2 };
}
