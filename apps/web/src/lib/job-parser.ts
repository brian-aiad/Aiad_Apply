import { createHash } from "node:crypto";

export type ParsedCapture = {
  company: string;
  title: string;
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  sourceUrl: string | null;
  postedText: string | null;
  applicantCount: number | null;
  cleanDescription: string;
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  rawPasteSha256: string;
};

type PostingFingerprintInput = Pick<
  ParsedCapture,
  "company" | "title" | "location"
> & {
  cleanDescription: string | null;
};

const sectionStops = [
  "Benefits found in job post",
  "Set alert for similar jobs",
  "See how you compare",
  "Exclusive Job Seeker Insights",
  "About the company",
  "More jobs",
  "Hiring?",
];

const locationHeader =
  /^(?:[A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2}|United States|USA|US|Remote(?:,\s*(?:US|USA|United States))?)(?:\s*(?:Â·|·)\s*|$)/i;

function cleanLines(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeFingerprintPart(value: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function postingFingerprint(posting: PostingFingerprintInput) {
  const stableContent = [
    posting.company,
    posting.title,
    posting.location,
    posting.cleanDescription,
  ]
    .map(normalizeFingerprintPart)
    .join("\n");
  return createHash("sha256").update(stableContent).digest("hex");
}

function findCompany(lines: string[]) {
  const logoIndex = lines.findIndex((line) =>
    /^Company(?: logo for,|,)\s*/i.test(line),
  );
  if (logoIndex >= 0) {
    const inline = lines[logoIndex]
      .replace(/^Company(?: logo for,|,)\s*/i, "")
      .replace(/\.$/, "");
    if (inline && !/^Company$/i.test(inline)) return inline;
    return lines[logoIndex + 1] ?? "Unknown company";
  }
  if (isOfficialEmployerPage(lines)) {
    const rtxBusiness = lines
      .map((line) => line.match(/\bRTX\b.*\b(Raytheon|Collins Aerospace|Pratt & Whitney)\b/i))
      .find((match) => match !== null);
    if (rtxBusiness) return rtxBusiness[1];
    const officialTitleIndex = findOfficialTitleIndex(lines);
    const following = lines[officialTitleIndex + 1];
    if (following && !looksLikeOfficialMetadata(following)) return following;
  }
  const locationIndex = lines.findIndex((line) => locationHeader.test(line));
  if (locationIndex >= 2) return lines[locationIndex - 2];
  const about = lines.indexOf("About the job");
  if (about > 2) return lines[about - 3];
  return "Unknown company";
}

function findTitle(lines: string[], company: string) {
  if (isOfficialEmployerPage(lines)) {
    const officialTitleIndex = findOfficialTitleIndex(lines);
    if (officialTitleIndex >= 0) {
      return lines[officialTitleIndex].replace(/^(?:Raytheon\s+)?Full-time\s+/i, "");
    }
  }
  const companyIndex = lines.findIndex(
    (line) => line.toLocaleLowerCase() === company.toLocaleLowerCase(),
  );
  const candidates = lines.slice(companyIndex + 1, companyIndex + 6);
  return (
    candidates.find(
      (line) =>
        !/^(save|apply|full-time|part-time|contract|on-site|remote|hybrid)$/i.test(
          line,
        ) &&
        !/^(.*\s(?:Â·|·)\s.*)$/.test(line) &&
        !/\b(?:CA|NY|TX|WA|IL|MA)\b.*(?:ago|applicant|clicked)/i.test(line),
    ) ?? "Untitled role"
  );
}

function isOfficialEmployerPage(lines: string[]) {
  return (
    lines.some((line) => /^Date Posted:/i.test(line)) &&
    lines.some((line) => /^Qualifications (?:You Must Have|We Prefer)$/i.test(line))
  );
}

function looksLikeOfficialMetadata(line: string) {
  return /^(?:rtx_logo|-|\d+_[A-Za-z0-9_]+|Location\b|Category\b|Job Type\b|Onsite\b|Relocation\b|Job ID\b|Saved\b|Back to search results\b)/i.test(
    line,
  );
}

function findOfficialTitleIndex(lines: string[]) {
  const dateIndex = lines.findIndex((line) => /^Date Posted:/i.test(line));
  const limit = dateIndex >= 0 ? dateIndex : Math.min(lines.length, 20);
  return lines.slice(0, limit).findIndex((line) => {
    if (looksLikeOfficialMetadata(line)) return false;
    if (/^(?:Raytheon|RTX|Collins Aerospace|Pratt & Whitney)$/i.test(line)) return false;
    return line.length >= 6 && line.length <= 180;
  });
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([Kk])?/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Math.round(match[2] ? amount * 1000 : amount);
}

function extractJobSections(lines: string[]) {
  const result = {
    responsibilities: [] as string[],
    requiredQualifications: [] as string[],
    preferredQualifications: [] as string[],
  };
  let current: keyof typeof result | null = null;
  let qualificationsStarted = false;
  const responsibilityHeading =
    /^(?:Responsibilities|Job Responsibilities|What You(?:'|’|â€™)ll (?:Do|Be Doing|Accomplish)|Essential Job Duties and Responsibilities|Essential Functions(?: & Responsibilities)?|Key Responsibilities|Required Duties|Accountabilities|Your Impact|Functions and duties of this role include, but not limited to):?$/i;
  const requiredHeading =
    /^(?:Required Qualifications(?:, Capabilities And Skills)?|Required Technical Experience \(MUST\)|Required Education\/Credentials\/Qualifications|Requirements|Qualifications|Minimum Requirements|Job Qualifications\/Requirements|Who You Are|What We Require|What We(?:'|’|â€™)re Looking For|What We Are Looking For|What You(?:'|’|â€™)ll Bring(?:\s*\(Required\))?|What You Bring(?:\s*\(Required\))?|Required Skills, Knowledge and Abilities):?$/i;
  const preferredHeading =
    /^(?:Preferred|Preferred Qualifications(?:, Capabilities And Skills)?|Nice To Have|Bonus Points If You Have|Experience That Would Be Helpful):?$/i;
  const expandedResponsibilityHeading =
    /^(?:Core Responsibilities|Your Responsibilities|Technical Support Engineer Key Responsibilities|You Will|Your Team Will|In This Role, You Will|Essential Functions & Responsibilities):?$/i;
  const officialResponsibilityHeading = /^What You Will Do:?$/i;
  const expandedRequiredHeading =
    /^(?:Basic Requirements|Minimum Qualifications|Required Experience|Necessary Skills\/Abilities|Qualifications & Experience|Who This Role Is For|About You|Your Profile):?$/i;
  const expandedPreferredHeading =
    /^(?:Preferred Skills|Strongly Preferred|Nice(?:-| )To(?:-| )Have(?: Requirements| But Not Required)?):?$/i;
  const officialRequiredHeading = /^Qualifications You Must Have:?$/i;
  const officialPreferredHeading = /^Qualifications We Prefer:?$/i;
  const qualificationSubheading =
    /^(?:Education(?:\/| and )Credentials|Prior Experience|Technical Skills|Experience):?$/i;
  const responsibilitySubheading =
    /^(?:Operational Support|Documentation & Process Management|Documentation, Compliance & Collaboration|Continuous Improvement|Collaboration|Application & End User Support|System Operations & Maintenance|Application & Platform Support|Systems & Data Operations|Customer Communication & Experience|Integration & SaaS Tool Support|Tooling & Operational Excellence):?$/i;
  const expandedResponsibilitySubheading =
    /^(?:Client Support & Issue Resolution|Onboarding & Implementation Execution|Account Maintenance & Accuracy|Systems, Tools & Process Improvement|Product & Customer Support|Field Responsibilities):?$/i;
  const expandedEndHeading =
    /^(?:Additional Information|Why |Our Offer|What You Won|What This Role Is|Role Basics|Attributes|About )/i;
  const officialEndHeading = /^(?:What You Will Learn|What We Offer):?$/i;
  const endHeading =
    /^(?:Benefits|Perks|What We Give|Work Environment|Why You(?:'|’|â€™)ll Love|Why Join|About Us|The pay|The salary|The annual|Salary range|Compensation|US Salary|Equal Opportunity|Bank of Hope is an equal|GoFundMe is proud)/i;
  const unheadedResponsibility =
    /^(?:Administer|Analy[sz]e|Build|Collaborate|Configure|Coordinate|Create|Diagnose|Document|Ensure|Implement|Investigate|Liaison|Maintain|Manage|Monitor|Optimize|Perform|Provide|Responsible\b|Review|Support|Test|Troubleshoot|Validate)\b/i;

  for (const sourceLine of lines) {
    const rawLine = sourceLine.replace(/^\/\/\s*/, "");
    const line = rawLine
      .replace(/^[•●\-]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (/\bsuchs\s*[.!]?$/i.test(line)) continue;
    if (
      responsibilityHeading.test(line) ||
      expandedResponsibilityHeading.test(line) ||
      officialResponsibilityHeading.test(line)
    ) {
      current = "responsibilities";
      continue;
    }
    if (
      requiredHeading.test(line) ||
      expandedRequiredHeading.test(line) ||
      officialRequiredHeading.test(line)
    ) {
      current = "requiredQualifications";
      qualificationsStarted = true;
      continue;
    }
    if (
      preferredHeading.test(line) ||
      expandedPreferredHeading.test(line) ||
      officialPreferredHeading.test(line)
    ) {
      current = "preferredQualifications";
      qualificationsStarted = true;
      continue;
    }
    if (qualificationSubheading.test(line)) {
      current = "requiredQualifications";
      continue;
    }
    if (responsibilitySubheading.test(line) || expandedResponsibilitySubheading.test(line)) continue;
    if (
      endHeading.test(line) ||
      expandedEndHeading.test(line) ||
      officialEndHeading.test(line)
    ) {
      current = null;
      continue;
    }
    if (
      !current &&
      !qualificationsStarted &&
      unheadedResponsibility.test(line) &&
      line.length >= 18
    ) {
      result.responsibilities.push(line);
      continue;
    }
    if (!current || line.length < 15 || line.length > 500) continue;
    if (
      (line.endsWith(":") || line === line.toLocaleUpperCase()) &&
      /^[A-Z][A-Za-z &/,\-]{2,45}:?$/.test(line) &&
      line.split(/\s+/).length <= 7
    ) {
      current = null;
      continue;
    }
    const destination =
      current === "requiredQualifications" &&
      (/^Preferred(?: qualifications?)?\s*:/i.test(line) ||
        /\b(?:(?:is|are|would be)\s+(?:an?\s+)?(?:asset|preferred)|is\s+a\s+plus|advantageous)\b/i.test(
          line,
        ))
        ? "preferredQualifications"
        : current;
    result[destination].push(line);
  }

  return {
    responsibilities: [...new Set(result.responsibilities)].slice(0, 30),
    requiredQualifications: [...new Set(result.requiredQualifications)].slice(
      0,
      30,
    ),
    preferredQualifications: [...new Set(result.preferredQualifications)].slice(
      0,
      30,
    ),
  };
}

export function parseCapture(
  rawPaste: string,
  suppliedUrl?: string,
): ParsedCapture {
  const normalized = rawPaste.replace(/\r\n?/g, "\n").trim();
  const lines = cleanLines(normalized);
  const company = findCompany(lines);
  const title = findTitle(lines, company);
  const titleIndex = lines.findIndex((line) => line === title);
  const nearbyHeaderLines = lines.slice(titleIndex + 1, titleIndex + 9);
  const locationLine =
    nearbyHeaderLines.find((line) =>
      /^[A-Za-z][A-Za-z .'-]+,\s*[A-Z][A-Za-z ]+,\s*United States(?: of America)?$/i.test(
        line,
      ),
    ) ??
    nearbyHeaderLines.find((line) =>
      /,\s*(?:[A-Z]{2}|[A-Z][A-Za-z ]+)\b|^(?:United States|USA|US)\s*\(Remote\)|^Remote(?:,\s*(?:US|USA|United States))?/i.test(
        line,
      ),
    );
  const location = locationLine?.split(/\s*(?:Â·|·)\s*/)[0]?.trim() ?? null;
  const postedText =
    locationLine?.match(
      /\b(?:Reposted\s+)?\d+\s+(?:minute|hour|day|week|month)s?\s+ago\b/i,
    )?.[0] ?? null;

  const salaryNormalized = normalized.replace(/\s+to\s+(?=\$\s?\d)/gi, " - ");
  const salaryMatch = salaryNormalized.match(
    /\$\s?[\d,.]+(?:\.\d+)?[Kk]?(?:\/(?:yr|year|hr|hour))?\s*(?:-|–|—|â€“|â€”)\s*\$\s?[\d,.]+(?:\.\d+)?[Kk]?(?:\/(?:yr|year|hr|hour))?/i,
  );
  const officialSalaryMatch = salaryNormalized.match(
    /\d[\d,]*(?:\.\d+)?\s*USD\s*-\s*\d[\d,]*(?:\.\d+)?\s*USD/i,
  );
  const selectedSalaryMatch = salaryMatch ?? officialSalaryMatch;
  const salaryParts =
    selectedSalaryMatch?.[0].split(/\s*(?:-|–|—|â€“|â€”)\s*/) ?? [];
  const salaryMin = salaryParts[0] ? parseMoney(salaryParts[0]) : null;
  const salaryMax = salaryParts[1] ? parseMoney(salaryParts[1]) : null;
  const singleSalaryMatch = selectedSalaryMatch
    ? null
    : normalized.match(/\$\s?\d[\d,]*(?:\.\d+)?[Kk]?\/(?:yr|year|hr|hour)/i);
  const singleSalaryAmount = singleSalaryMatch ? parseMoney(singleSalaryMatch[0]) : null;
  const salaryText = (selectedSalaryMatch?.[0] ?? singleSalaryMatch?.[0] ?? "").replace(
    /[,.]$/,
    "",
  );

  const aboutIndex = lines.findIndex((line) => /^About the job$/i.test(line));
  const descriptionStart =
    aboutIndex >= 0 ? aboutIndex + 1 : Math.max(titleIndex + 1, 0);
  let descriptionEnd = lines.length;
  for (const stop of sectionStops) {
    const index = lines.findIndex(
      (line, current) => current > descriptionStart && line.startsWith(stop),
    );
    if (index >= 0) descriptionEnd = Math.min(descriptionEnd, index);
  }
  const descriptionLines = lines.slice(descriptionStart, descriptionEnd);
  const cleanDescription = descriptionLines.join("\n");

  const { responsibilities, requiredQualifications, preferredQualifications } =
    extractJobSections(descriptionLines);

  const officialUrl = normalized.match(
    /^Official posting:\s*(https?:\/\/[^\s)]+)/im,
  );
  const linkedInUrl = normalized.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/jobs\/(?:view\/)?[^\s)]+/i,
  );
  const sourceUrl =
    suppliedUrl?.trim() || officialUrl?.[1] || linkedInUrl?.[0] || null;
  const headerArrangement = lines.some((line) => /^On-?site$/i.test(line))
    ? "On-site"
    : ["Hybrid", "Remote"].find((item) =>
        lines.some((line) => line.toLocaleLowerCase() === item.toLocaleLowerCase()),
      );
  const inferredArrangement =
    /\b(?:hybrid\s+(?:office|work(?:ing)?|environment|role)|work mode is hybrid)\b/i.test(
      cleanDescription,
    )
      ? "Hybrid"
      : /\b(?:fully remote|remote (?:position|role|environment))\b/i.test(
            cleanDescription,
          )
        ? "Remote"
        : /\b(?:fully )?on[ -]?site\s+(?:position|role|environment)\b/i.test(
              cleanDescription,
            )
          ? "On-site"
          : undefined;
  const employmentType = lines.some((line) => /^(?:Job Type\s+)?Full[ -]time$/i.test(line))
    ? "Full-time"
    : lines.some((line) => /^(?:Job Type\s+)?Part[ -]time$/i.test(line))
      ? "Part-time"
      : ["Contract", "Temporary", "Internship"].find((item) =>
          lines.some((line) => line.toLocaleLowerCase() === item.toLocaleLowerCase()),
        );
  const applicantText = normalized.match(
    /(?:Applicants|Candidates who clicked apply)\s*\n?\s*(\d[\d,]*)|\b(\d[\d,]*)\s+(?:applicants?|people clicked apply)\b/i,
  );

  return {
    company,
    title,
    location,
    workArrangement: inferredArrangement ?? headerArrangement ?? null,
    employmentType: employmentType ?? null,
    salaryMin: salaryMin ?? singleSalaryAmount,
    salaryMax,
    salaryText: salaryText || null,
    sourceUrl,
    postedText,
    applicantCount: applicantText
      ? Number((applicantText[1] ?? applicantText[2]).replace(/,/g, ""))
      : null,
    cleanDescription,
    responsibilities,
    requiredQualifications,
    preferredQualifications,
    rawPasteSha256: createHash("sha256").update(normalized).digest("hex"),
  };
}
