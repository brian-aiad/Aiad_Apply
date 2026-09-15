import type { ParsedCapture } from "./job-parser";
import evidence from "./discovery/candidate-evidence.json";
import { localDistance, roleFamily } from "./discovery/matching";
import {
  DEFAULT_DISCOVERY_PREFERENCES,
  type DiscoveryPreferences,
} from "./discovery/types";

type DimensionTone = "positive" | "caution" | "negative" | "neutral";
type FitDimension = {
  key: string;
  label: string;
  status: string;
  detail: string;
  tone: DimensionTone;
};

const supportedTerms = [
  "SQL", "PostgreSQL", "MySQL", "Python", "PowerShell", "Bash", "Microsoft 365",
  "Entra ID", "Postman", "REST APIs", "Webhooks", "Jira", "Linux", "Windows",
  "SaaS", "Application Support", "Troubleshooting", "Root Cause Analysis",
  "Incident Response", "SLA Management", "AWS", "ETL", "OAuth", "SAML", "RBAC",
];
const namedTools = [
  "ServiceNow", "Workday", "SAP", "Salesforce", "Kubernetes", "Terraform", "ITIL",
  "Oracle", "Snowflake", "Datadog", "Dynatrace", "Splunk", "Grafana", "Zendesk",
  "Azure DevOps", "Tableau",
];
const candidateEvidence = evidence.evidence.join("\n");
const confirmedExposure = evidence.confirmedExposure.map((item) =>
  item.toLocaleLowerCase(),
);

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, term: string) =>
  new RegExp(`\\b${escapePattern(term)}\\b`, "i").test(text);
const negatesTerm = (line: string, term: string) => {
  if (!mentions(line, term)) return false;
  const escaped = escapePattern(term);
  return new RegExp(
    `(?:\\bno\\s+(?:prior\\s+)?${escaped}(?:\\s+(?:experience|knowledge))?\\s+(?:is\\s+)?required\\b|` +
      `\\b${escaped}[^.\\n]{0,40}\\b(?:is\\s+)?not\\s+(?:required|necessary)\\b)`,
    "i",
  ).test(line);
};
const affirmativeLines = (lines: string[], term: string) =>
  lines.filter((line) => mentions(line, term) && !negatesTerm(line, term));
const isNegatedConstraint = (line: string) =>
  /\b(?:clearance|citizenship|degree|certification|travel)\b[^.\n]{0,40}\b(?:is\s+)?not\s+(?:required|necessary)\b/i.test(line) ||
  /\bno\s+(?:prior\s+)?(?:clearance|degree|certification)(?:\s+\w+){0,3}\s+(?:is\s+)?required\b/i.test(line);
const dimension = (
  key: string,
  label: string,
  status: string,
  detail: string,
  tone: DimensionTone,
): FitDimension => ({ key, label, status, detail, tone });

function explicitExperienceYears(lines: string[]) {
  return Math.max(
    0,
    ...lines.flatMap((line) =>
      [...line.matchAll(/\b(\d{1,2})(?:\s*[-\u2013\u2014]\s*(\d{1,2}))?\+?\s*(?:years|yrs)\b/gi)]
        .map((match) => Number(match[1])),
    ),
  );
}

function isExperienceRequirement(line: string) {
  return /\b\d{1,2}(?:\s*[-\u2013\u2014]\s*\d{1,2})?\+?\s*(?:years|yrs)\b/i.test(line);
}

export function captureIntelligence(
  job: ParsedCapture,
  preferences: DiscoveryPreferences = DEFAULT_DISCOVERY_PREFERENCES,
) {
  const requiredText = job.requiredQualifications.join("\n");
  const responsibilityText = job.responsibilities.join("\n");
  const requirements = `${requiredText}\n${responsibilityText}`;
  const family = roleFamily(job.title);

  const matches = supportedTerms.flatMap((term) => {
    const source = evidence.evidence.find((text) => mentions(text, term));
    const requiredMentions = affirmativeLines(job.requiredQualifications, term);
    const responsibilityMentions = affirmativeLines(job.responsibilities, term);
    const preferredMentions = affirmativeLines(job.preferredQualifications, term);
    const mentioned = [...requiredMentions, ...responsibilityMentions, ...preferredMentions];
    if (!source || mentioned.length === 0) return [];
    return [{
      term,
      source,
      importance: requiredMentions.length
        ? "Critical"
        : responsibilityMentions.length
          ? "Core responsibility"
          : "Preferred",
    }];
  });
  const gaps = namedTools
    .filter(
      (term) =>
        [
          ...affirmativeLines(job.requiredQualifications, term),
          ...affirmativeLines(job.responsibilities, term),
          ...affirmativeLines(job.preferredQualifications, term),
        ].length > 0 &&
        !mentions(candidateEvidence, term) &&
        !evidence.confirmedSkills.some((skill) => mentions(skill, term)),
    )
    .map((term) => ({
      term,
      importance: affirmativeLines(job.requiredQualifications, term).length
        ? "Critical"
        : affirmativeLines(job.responsibilities, term).length
          ? "Core responsibility"
          : "Preferred",
      reason:
        "Not established by the protected resume or candidate profile. Keep it out of resume claims unless Brian confirms real evidence.",
    }));

  const degreeLines = job.requiredQualifications.filter((line) =>
    /\b(?:degree|bachelor|master|doctorate|ph\.?d)\b/i.test(line),
  );
  const citizenshipLines = job.requiredQualifications.filter((line) =>
    /\b(?:U\.?S\.?|United States)\s+citizen(?:ship)?\b/i.test(line),
  );
  const workAuthorizationLines = job.requiredQualifications.filter((line) =>
    /\b(?:authorized to work|work authorization|without (?:current or future )?sponsorship)\b/i.test(line),
  );
  const citizenshipConfirmed = confirmedExposure.includes("u.s. citizenship");
  const years = explicitExperienceYears(job.requiredQualifications);
  const confirmedRequirements = [
    ...degreeLines.filter(
      (line) =>
        /\b(?:bachelor|undergraduate|college)\b/i.test(line) &&
        !/\b(?:master|doctorate|ph\.?d)\b/i.test(line) &&
        /\b(?:computer science|related|technical|STEM|degree)\b/i.test(line),
    ),
    ...(citizenshipConfirmed
      ? [
          ...citizenshipLines.filter((line) => !/\bclearance\b/i.test(line)),
          ...workAuthorizationLines.filter((line) => !/\bclearance\b/i.test(line)),
        ]
      : []),
  ];
  const confirmedFacts = [
    ...(degreeLines.some((line) => confirmedRequirements.includes(line))
      ? ["B.S. in Computer Science"]
      : []),
    ...(citizenshipConfirmed && (citizenshipLines.length || workAuthorizationLines.length)
      ? ["U.S. citizenship"]
      : []),
    ...(years > 0 && years <= 3 ? ["3+ years across application support and IT operations"] : []),
  ];
  const checks = [...new Set(job.requiredQualifications.filter((line) => {
    if (confirmedRequirements.includes(line)) return false;
    if (isNegatedConstraint(line)) return false;
    if (isExperienceRequirement(line) && years <= 3) return false;
    return /\b(?:clearance|citizen(?:ship)?|sponsorship|authorized to work|work authorization|master|doctorate|ph\.?d|certification|travel|\d{1,2}(?:\s*[-\u2013\u2014]\s*\d{1,2})?\+?\s*(?:years|yrs))\b/i.test(line);
  }))];

  const missing = [
    job.company === "Unknown company" ? "Company not identified" : null,
    job.title === "Untitled role" ? "Role not identified" : null,
    !job.location ? "Location not listed" : null,
    !job.salaryText ? "Pay not listed" : null,
    !job.employmentType ? "Employment type not listed" : null,
  ].filter((value): value is string => Boolean(value));

  const distance = job.location ? localDistance(job.location) : null;
  const remote = job.workArrangement === "Remote";
  const requiredGaps = gaps.filter((gap) => gap.importance !== "Preferred");
  const definiteConflicts: string[] = [];
  if (job.employmentType && job.employmentType !== "Full-time") {
    definiteConflicts.push("The posting is not classified as full-time.");
  }
  if (job.salaryMax !== null && job.salaryMax < preferences.minimumSalary) {
    definiteConflicts.push("The full posted pay range is below your target.");
  }
  if (!remote && distance !== null && distance > preferences.radiusMiles) {
    definiteConflicts.push(`The listed city is about ${distance} miles from Seal Beach.`);
  }
  if (remote && !preferences.includeRemote) {
    definiteConflicts.push("Remote roles are outside your current discovery preference.");
  }

  const responsibilityMatches = matches.filter(
    (match) => match.importance === "Core responsibility",
  );
  const dimensions: FitDimension[] = [
    family === "core"
      ? dimension("role", "Role family", "Strong", "Directly within application, technical, production, or systems support.", "positive")
      : family === "adjacent"
        ? dimension("role", "Role family", "Adjacent", "Related implementation, integrations, systems, or IT operations work.", "caution")
        : dimension("role", "Role family", "Outside target", "The title is outside the current support and integrations target families.", "negative"),
    years === 0
      ? dimension("experience", "Experience", "Not explicit", "No clear years requirement was extracted.", "neutral")
      : years <= 3
        ? dimension("experience", "Experience", "Supported", `The posting asks for ${years}+ years; the protected resume establishes 3+ years.`, "positive")
        : years <= 5
          ? dimension("experience", "Experience", "Close review", `The posting asks for ${years}+ years; the protected resume establishes 3+ years.`, "caution")
          : dimension("experience", "Experience", "Material gap", `The posting asks for ${years}+ years; the protected resume establishes 3+ years.`, "negative"),
    matches.length >= 5
      ? dimension("technical", "Technical evidence", "Strong", `${matches.length} named skills have direct base-resume evidence.`, "positive")
      : matches.length >= 2
        ? dimension("technical", "Technical evidence", "Supported", `${matches.length} named skills have direct base-resume evidence.`, "positive")
        : dimension("technical", "Technical evidence", "Limited", "Few named skills connect directly to protected resume evidence.", "caution"),
    job.responsibilities.length
      ? dimension("responsibilities", "Responsibilities", responsibilityMatches.length ? "Supported" : "Needs review", `${job.responsibilities.length} responsibilities extracted; ${responsibilityMatches.length} contain documented skill overlap.`, responsibilityMatches.length ? "positive" : "caution")
      : dimension("responsibilities", "Responsibilities", "Unclear", "No separate responsibility section was identified.", "neutral"),
    degreeLines.length === 0
      ? dimension("education", "Education", "Not explicit", "No degree requirement was extracted.", "neutral")
      : confirmedRequirements.some((line) => degreeLines.includes(line))
        ? dimension("education", "Education", "Supported", "The protected resume includes a B.S. in Computer Science.", "positive")
        : dimension("education", "Education", "Needs review", "The extracted education requirement is not fully established by the protected resume.", "caution"),
    remote
      ? dimension("location", "Location", preferences.includeRemote ? "Within preference" : "Preference conflict", preferences.includeRemote ? "Remote roles are enabled in Discover preferences." : "Remote roles are currently disabled in Discover preferences.", preferences.includeRemote ? "positive" : "caution")
      : distance !== null
        ? dimension("location", "Location", distance <= preferences.radiusMiles ? "Within radius" : "Outside radius", `Approximately ${distance} miles from Seal Beach by city-centre radius.`, distance <= preferences.radiusMiles ? "positive" : "negative")
        : dimension("location", "Location", job.location ? "Verify" : "Not listed", job.location ? "The location could not be mapped confidently to one local city." : "Confirm the worksite before deciding.", "neutral"),
    job.employmentType === "Full-time"
      ? dimension("employment", "Employment", "Supported", "The posting explicitly says full-time.", "positive")
      : dimension("employment", "Employment", job.employmentType ? "Preference conflict" : "Not listed", job.employmentType || "Confirm that the role is full-time.", job.employmentType ? "negative" : "neutral"),
    job.salaryMin !== null && job.salaryMin >= preferences.minimumSalary
      ? dimension("compensation", "Compensation", "Meets target", `The posted floor meets your $${Math.round(preferences.minimumSalary / 1000)}K target.`, "positive")
      : job.salaryMax !== null && job.salaryMax < preferences.minimumSalary
        ? dimension("compensation", "Compensation", "Below target", `The posted ceiling is below your $${Math.round(preferences.minimumSalary / 1000)}K target.`, "negative")
        : job.salaryMin !== null
          ? dimension("compensation", "Compensation", "Range crosses target", `The range begins below your $${Math.round(preferences.minimumSalary / 1000)}K target.`, "caution")
          : dimension("compensation", "Compensation", "Not listed", "Compensation is not confirmed in the posting.", "neutral"),
    checks.length
      ? dimension("requirements", "Hard requirements", "Needs confirmation", `${checks.length} eligibility, credential, travel, or experience requirement${checks.length === 1 ? "" : "s"} need review.`, "caution")
      : dimension("requirements", "Hard requirements", "No known blocker", confirmedRequirements.length ? `${confirmedRequirements.length} explicit requirement${confirmedRequirements.length === 1 ? " is" : "s are"} supported by protected facts.` : "No explicit eligibility or credential blocker was extracted.", "positive"),
    requiredGaps.length
      ? dimension("tailoring", "Tailoring potential", "Bounded", `${requiredGaps.length} important named requirement${requiredGaps.length === 1 ? " is" : "s are"} unsupported and must stay out of the resume.`, "caution")
      : matches.length >= 3
        ? dimension("tailoring", "Tailoring potential", "High", "Several supported terms can improve alignment without adding new claims.", "positive")
        : dimension("tailoring", "Tailoring potential", "Limited", "Few high-value supported terms are available for a meaningful rewrite.", "neutral"),
  ];

  const specialistTitle = !family && /\b(?:engineer|architect|scientist|manager|director)\b/i.test(job.title);
  const recommendation =
    !requirements.trim() || missing.includes("Role not identified") || missing.includes("Company not identified")
      ? "Needs Review"
      : checks.length
        ? "Needs Review"
        : definiteConflicts.length >= 2 || (specialistTitle && matches.length < 2)
          ? "Skip"
          : definiteConflicts.length || !family
            ? "Low Priority"
            : requiredGaps.length
              ? "Stretch Apply"
              : family === "core" && matches.length >= 5
                ? "Strong Apply"
                : matches.length >= 3
                  ? "Apply"
                  : "Needs Review";
  const reason = recommendation === "Strong Apply"
    ? "Direct role-family alignment and broad protected evidence make this worth prioritizing. Review the exact requirements before applying."
    : recommendation === "Apply"
      ? "The role is relevant and several important skills have direct evidence. Tailoring can improve emphasis without adding unsupported claims."
      : recommendation === "Stretch Apply"
        ? "Relevant experience exists, but an important named requirement is not established. Apply only if that gap is not essential."
        : recommendation === "Low Priority"
          ? definiteConflicts[0] || "The role sits outside the current support, systems, and integrations target families."
          : recommendation === "Skip"
            ? definiteConflicts[0] || "The role family and documented evidence do not justify tailoring time."
            : "Confirm the highlighted requirements and missing details before spending time tailoring.";
  const detailCount =
    job.responsibilities.length +
    job.requiredQualifications.length +
    job.preferredQualifications.length;
  const confidence =
    missing.includes("Role not identified") || missing.includes("Company not identified") || detailCount < 2
      ? "Limited posting detail"
      : job.responsibilities.length >= 2 && job.requiredQualifications.length >= 1
        ? "High confidence"
        : "Moderate confidence";

  return {
    recommendation,
    confidence,
    reason,
    dimensions,
    matches,
    gaps,
    checks,
    confirmedRequirements,
    confirmedFacts,
    missing,
    definiteConflicts,
    family: family === "core"
      ? "Target role family"
      : family === "adjacent"
        ? "Adjacent role family"
        : "Outside target families",
  };
}

export type CaptureIntelligence = ReturnType<typeof captureIntelligence>;
