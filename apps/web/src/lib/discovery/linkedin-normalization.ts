import { employmentType, safeExternalUrl, textFromHtml, workArrangement } from "./normalization";
import type { Opening } from "./types";

export type LinkedInRawOpening = {
  externalId?: unknown; company?: unknown; title?: unknown; location?: unknown;
  sourceUrl?: unknown; applyUrl?: unknown; description?: unknown; salaryText?: unknown;
  employmentType?: unknown; workArrangement?: unknown; postedAt?: unknown;
  topApplicant?: unknown; premiumMatch?: unknown; contacts?: unknown;
};
export type LinkedInOpening = Opening & {
  applyUrl: string | null; topApplicant: boolean;
  premiumMatch: "high" | "medium" | "low" | null;
  contacts: unknown[];
};

/** Retain routing and requisition parameters; remove only known attribution keys. */
export function canonicalApplyUrl(value: unknown): string | null {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.port || url.hostname.endsWith(".") || url.hostname.includes(":") || /(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  // safeExternalUrl is shared with public feeds; tighten local network protection here.
  if (/^(?:0\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.)/.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname) || /\.(?:local|localhost|internal|test|invalid)$/.test(url.hostname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|trk|trackingId|refId|referralSearchId|eBP|gh_src|source|src|referrer|tracking|campaign|iis|iisn)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

/** Fail closed on conflicting bands/currencies. Annualize explicit periods only. */
export function linkedInBasePay(text: string) {
  const empty = { salaryMin: null, salaryMax: null, salaryText: null };
  // Exact rates and explicit starting rates establish a lower bound; "up to" does not.
  text = text.split("\n").map(line => {
    if (/up to|maximum|bonus|equity|OTE/i.test(line) || /[-–—]\s*\$?\d|\bto\s*\$?\d/i.test(line)) return line;
    return line.replace(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?(?=\s*(?:\/(?:hr|hour|yr|year|mo|month)\b|per\s+(?:hour|year|month)\b|annually\b))/i,
      (_, value, suffix) => `$${value}${suffix || ""}–$${value}${suffix || ""}`);
  }).join("\n");
  const amount = String.raw`\$\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?`;
  const unit = String.raw`(?:\s*(?:\/|per\s+)(hour|hr|year|yr|month|mo)\b)?`;
  const range = new RegExp(`${amount}${unit}\\s*(?:USD)?\\s*(?:[-–—]|to)\\s*\\$?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*([kK])?${unit}`, "gi");
  const values: { salaryMin: number; salaryMax: number; salaryText: string }[] = [];
  for (const match of text.matchAll(range)) {
    const start = match.index ?? 0;
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const lineEnd = text.indexOf("\n", start + match[0].length);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const previous = text.slice(0, lineStart).trimEnd().split("\n").at(-1) || "";
    let context = /^(?:base pay range|salary range|annual salary|hourly (?:pay|rate)|monthly (?:pay|salary))\s*:?$/i.test(previous.trim()) ? `${previous} ${line}` : line;
    // Some employer templates retain both alternatives. A K-denominated annual
    // band cannot be the template's hourly alternative; keep ordinary ambiguous
    // or explicitly conflicting periods unresolved. Original posting is retained.
    if (match[2] && match[5] && !match[3] && !match[6]
      && /annual\s+salary range\s+or\s+the\s+hourly range/i.test(context)) {
      context = context.replace(/annual\s+salary range\s+or\s+the\s+hourly range/i, "annual salary range");
    }
    if (/\b(?:CAD|AUD|NZD|SGD|EUR|GBP)\b|[€£]/i.test(context)) return empty;
    if (/\b(?:bonus|equity|stock|OTE|total compensation)\b/i.test(context) && !/\b(?:base|annual salary|hourly|monthly)\b/i.test(context)) continue;
    const periods = [match[3], match[6], ...[...context.matchAll(/\b(hourly|annually|annual|monthly|per hour|per year|per month)\b/gi)].map(m => m[1])]
      .filter(Boolean).map(value => /hour|hr/i.test(value!) ? "hour" : /month|mo/i.test(value!) ? "month" : "year");
    if (new Set(periods).size > 1) return empty;
    const period = periods[0] || (/\b(?:salary|base pay)\b/i.test(context) ? "year" : null);
    if (!period) continue;
    const min = Number(match[1].replaceAll(",", "")) * (match[2] ? 1000 : 1);
    const max = Number(match[4].replaceAll(",", "")) * (match[5] ? 1000 : 1);
    if (min <= 0 || max < min || (period === "hour" && max > 1000)) return empty;
    const factor = period === "hour" ? 2080 : period === "month" ? 12 : 1;
    values.push({ salaryMin: Math.floor(min * factor), salaryMax: Math.floor(max * factor), salaryText: match[0] + `/${period}` });
  }
  const unique = [...new Map(values.map(value => [`${value.salaryMin}:${value.salaryMax}`, value])).values()];
  return unique.length === 1 ? unique[0] : empty;
}

export function normalizeLinkedInOpening(raw: LinkedInRawOpening): LinkedInOpening | null {
  const source = safeExternalUrl(raw.sourceUrl);
  if (!source) return null;
  const url = new URL(source);
  if (url.port || !/^(?:www\.)?linkedin\.com$/i.test(url.hostname)) return null;
  const pathId = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1];
  const id = pathId || (/^\/jobs\/search(?:-results)?\/?$/.test(url.pathname) ? url.searchParams.get("currentJobId") : null);
  if (!id || !/^\d+$/.test(id)) return null;
  if (raw.externalId !== undefined && String(raw.externalId) !== id) return null;
  const company = textFromHtml(raw.company), title = textFromHtml(raw.title), location = textFromHtml(raw.location);
  const description = textFromHtml(raw.description);
  if (!company || !title || !location || !description || /^Unknown company$/i.test(company) || /^Untitled role$/i.test(title)) return null;
  // Selected worksite is authoritative; other offices in body copy do not overwrite it.
  const payInput = `${textFromHtml(raw.salaryText)}\n${description}`
    .replace(/(\d(?:[\d,.]*)(?:[kK])?)\s*USD\s*(?=[–—-]|to\b)/g, "$1")
    .replace(/(\d[kK])USD\b/g, "$1 USD");
  const pay = linkedInBasePay(payInput);
  const postedAt = typeof raw.postedAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw.postedAt) ? new Date(raw.postedAt) : raw.postedAt instanceof Date ? raw.postedAt : null;
  const premium = typeof raw.premiumMatch === "string" ? raw.premiumMatch.toLowerCase() : "";
  return {
    externalId: id, sourceKey: "linkedin:premium", company, title, location,
    sourceUrl: `https://www.linkedin.com/jobs/view/${id}/`, description,
    employmentType: employmentType(raw.employmentType, description), workArrangement: workArrangement(raw.workArrangement),
    ...pay, postedAt: postedAt && Number.isFinite(postedAt.getTime()) && (!(typeof raw.postedAt === "string" && raw.postedAt.length === 10) || postedAt.toISOString().slice(0, 10) === raw.postedAt) ? postedAt : null,
    applyUrl: canonicalApplyUrl(raw.applyUrl), topApplicant: raw.topApplicant === true,
    premiumMatch: premium === "high" || premium === "medium" || premium === "low" ? premium : null,
    contacts: Array.isArray(raw.contacts) ? raw.contacts.slice(0, 20) : [],
  };
}

/** Conservative cross-source key; distinct selected cities remain distinct. */
export function sameRoleIdentity(company: string, title: string, location: string): string {
  const clean = (value: string) => value.toLowerCase().normalize("NFKC").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const employer = clean(company).replace(/\s+(?:incorporated|inc|llc|corporation|corp|ltd)$/, "");
  const role = clean(title).replace(/\bii\b/g, "2").replace(/\biii\b/g, "3");
  const place = location.toLowerCase().replace(/\bcalifornia\b/g, "CA")
    .replace(/\b(?:united states(?: of america)?|usa|county)\b/gi, "")
    .replace(/\bCA\s*[-–—]\s*\d+.*$/i, "CA")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "");
  return [employer, role, clean(place)].join("|");
}

/** Known ATS requisition identity; unknown URL shapes deliberately return null. */
export function employerRequisitionIdentity(value: unknown): string | null {
  const safe = canonicalApplyUrl(value);
  if (!safe) return null;
  const url = new URL(safe), host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (/^(?:job-boards|boards)\.greenhouse\.io$/.test(host)) {
    const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/|$)/);
    return match ? `greenhouse:${match[1].toLowerCase()}:${match[2]}` : null;
  }
  if (host === "jobs.lever.co") {
    const match = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})(?:\/|$)/i);
    return match ? `lever:${match[1].toLowerCase()}:${match[2].toLowerCase()}` : null;
  }
  if (host === "jobs.ashbyhq.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})(?:\/|$)/i);
    return match ? `ashby:${match[1].toLowerCase()}:${match[2].toLowerCase()}` : null;
  }
  if (/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(host)) {
    const jobIndex = parts.indexOf("job");
    if (jobIndex < 1) return null;
    const board = parts[jobIndex - 1];
    const req = parts.at(-1)?.match(/_((?:R|JR|REQ)-?\d+)(?:-\d+)?$/i)?.[1];
    return req ? `workday:${host}:${board.toLowerCase()}:${req.toLowerCase()}` : null;
  }
  return null;
}
