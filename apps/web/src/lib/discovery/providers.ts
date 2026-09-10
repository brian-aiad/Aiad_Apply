import { annualPay, employmentType, payFromText, safeExternalUrl, textFromHtml, workArrangement } from "./normalization";
import { localDistance, roleFamily } from "./matching";
import type { DiscoveryPreferences, Opening, Source } from "./types";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const records = (v: unknown): RecordValue[] => Array.isArray(v) ? v.map(record) : [];
const string = (v: unknown): string => typeof v === "string" ? v : "";
const date = (v: unknown): Date | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

export async function fetchPublicJson(url: string, signal?: AbortSignal): Promise<unknown> {
  // Callers construct URLs from the fixed registry, never from a posting or user input.
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "AiadApply/2.0 (personal job discovery)" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
    redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const limit = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("Source response exceeds the collection limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source returned no content.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Source response exceeds the collection limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function normalizeOpening(source: Source, raw: unknown): Opening | null {
  const j = record(raw);
  const location = record(j.location);
  const categories = record(j.categories);
  let title = "", locationText = "", description = "", url: unknown, type: unknown, mode: unknown, published: unknown;
  let pay = payFromText("");
  if (source.provider === "greenhouse") {
    if (j.internal_job_id === null) return null;
    title = string(j.title); locationText = string(location.name); description = textFromHtml(j.content); url = j.absolute_url;
    const metadata = records(j.metadata);
    type = metadata.find((m) => /employment|commitment|job type/i.test(string(m.name)))?.value;
    mode = locationText;
    published = j.first_published; // updated_at is not a posting date.
    const bands = records(j.pay_input_ranges).filter((b) => b.currency_type === "USD");
    if (bands.length === 1) {
      const min = Number(bands[0].min_cents) / 100;
      // Benefit blurbs can mention sick-leave hours beside an annual salary.
      const label = string(bands[0].title);
      const interval = /hour|\/hr/i.test(label) ? "hour" : min >= 10_000 ? "year" : "unknown";
      pay = annualPay(min, Number(bands[0].max_cents) / 100, "USD", interval);
    }
  } else if (source.provider === "lever") {
    title = string(j.text); locationText = string(categories.location); url = j.hostedUrl;
    description = [j.openingPlain, j.descriptionPlain, ...records(j.lists).map((l) => `${string(l.text)}\n${textFromHtml(l.content)}`), j.additionalPlain, j.salaryDescriptionPlain].filter(Boolean).join("\n\n");
    type = categories.commitment; mode = j.workplaceType; published = j.createdAt;
    const salary = record(j.salaryRange);
    pay = annualPay(salary.min, salary.max, salary.currency, salary.interval);
  } else if (source.provider === "ashby") {
    if (j.isListed === false) return null;
    title = string(j.title); locationText = string(j.location); url = j.jobUrl;
    description = string(j.descriptionPlain) || textFromHtml(j.descriptionHtml);
    type = j.employmentType; mode = j.workplaceType || (j.isRemote ? "Remote" : ""); published = j.publishedAt;
    const comp = record(j.compensation);
    const components = records(comp.summaryComponents).filter((c) => c.compensationType === "Salary" && c.currencyCode === "USD");
    if (components.length === 1) pay = annualPay(components[0].minValue, components[0].maxValue, components[0].currencyCode, components[0].interval);
    if (pay.salaryMin === null && typeof comp.scrapeableCompensationSalarySummary === "string") pay = payFromText(comp.scrapeableCompensationSalarySummary);
  } else {
    title = string(j.name); locationText = string(location.fullLocation) || [location.city, location.region, location.country].filter(Boolean).join(", ");
    description = Object.values(record(record(j.jobAd).sections)).map((s) => { const section = record(s); return `${string(section.title)}\n${textFromHtml(section.text)}`; }).join("\n\n");
    url = j.postingUrl; type = record(j.typeOfEmployment).label;
    mode = location.hybrid ? "Hybrid" : location.remote ? "Remote" : "On-site";
    published = j.releasedDate;
  }
  const sourceUrl = safeExternalUrl(url);
  if (!title || !sourceUrl || description.trim().length < 100 || !j.id) return null;
  if (pay.salaryMin === null) pay = payFromText(description, title);
  return {
    externalId: String(j.id), sourceKey: source.key, company: source.company, title: title.slice(0, 250), location: locationText.slice(0, 500),
    sourceUrl, description: description.slice(0, 100_000), employmentType: employmentType(type, description), workArrangement: workArrangement(mode),
    ...pay, postedAt: date(published),
  };
}

export async function collectSource(source: Source, prefs: DiscoveryPreferences, signal?: AbortSignal) {
  const board = encodeURIComponent(source.board);
  let listing: RecordValue[] = [];
  let complete = true;
  if (source.provider === "greenhouse") {
    const data = record(await fetchPublicJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`, signal));
    if (!Array.isArray(data.jobs)) throw new Error("Source changed its job-list format.");
    listing = records(data.jobs);
  } else if (source.provider === "lever") {
    const data = await fetchPublicJson(`https://api.lever.co/v0/postings/${board}?mode=json`, signal);
    if (!Array.isArray(data)) throw new Error("Source changed its job-list format.");
    listing = records(data);
  } else if (source.provider === "ashby") {
    const data = record(await fetchPublicJson(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`, signal));
    if (!Array.isArray(data.jobs)) throw new Error("Source changed its job-list format.");
    listing = records(data.jobs).filter((j) => j.isListed !== false);
  } else {
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = record(await fetchPublicJson(`https://api.smartrecruiters.com/v1/companies/${board}/postings?limit=100&offset=${offset}`, signal));
      if (!Array.isArray(data.content) || typeof data.totalFound !== "number") throw new Error("Source changed its job-list format.");
      listing.push(...records(data.content));
      if (listing.length >= data.totalFound) break;
      if (offset === 900 || data.content.length === 0) { complete = false; break; }
    }
  }
  const liveIds = listing.map((j) => String(j.id));
  const candidates = listing.filter((j) => {
    if (!roleFamily(string(j.title || j.text || j.name))) return false;
    const loc = typeof j.location === "string" ? j.location : string(record(j.location).name || record(j.location).fullLocation || record(j.location).city || record(j.categories).location);
    const mode = workArrangement(j.workplaceType || loc);
    if (mode === "Remote") return prefs.includeRemote;
    const distance = localDistance(loc);
    // Collection remains local. Ambiguous California-only locations are reviewable.
    return distance !== null ? distance <= prefs.radiusMiles : /^(?:California|CA|Orange County)(?:,|$)/i.test(loc);
  });
  const openings: Opening[] = [];
  let failures = 0;
  // Each board is bounded; do not issue hundreds of full-description requests.
  if (candidates.length > 35) complete = false;
  for (let offset = 0; offset < Math.min(35, candidates.length); offset += 4) {
    const batch = await Promise.allSettled(candidates.slice(offset, offset + 4).map(async (j) => {
      const id = encodeURIComponent(String(j.id));
      const detail = source.provider === "greenhouse" ? await fetchPublicJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?pay_transparency=true`, signal)
        : source.provider === "smartrecruiters" ? { ...j, ...record(await fetchPublicJson(`https://api.smartrecruiters.com/v1/companies/${board}/postings/${id}`, signal)) } : j;
      return normalizeOpening(source, detail);
    }));
    for (const item of batch) {
      if (item.status === "rejected" || !item.value) failures++;
      else openings.push(item.value);
    }
  }
  return { openings, liveIds, complete: complete && failures === 0, checked: listing.length, failures };
}
