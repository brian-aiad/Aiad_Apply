import { fetchPublicJson } from "./public-fetch";
import { reserveAdzunaRequest } from "./request-budget";
import { annualPay, employmentType, safeExternalUrl, textFromHtml, workArrangement } from "./normalization";
import type { DiscoveryPreferences, Opening, Source } from "./types";

type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === "object" ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";
const listText = (v: unknown): string => Array.isArray(v) ? v.map((x) => typeof x === "string" ? x : str(row(x).Name)).join("\n") : str(v);
const date = (v: unknown): Date | null => { const d = new Date(str(v)); return Number.isFinite(d.getTime()) ? d : null; };

export function integrationStatus(env: Readonly<Record<string, string | undefined>> = process.env) {
  return [
    { key: "adzuna", label: "Adzuna", enabled: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY), message: "Searches local jobs across employers. Requires an API ID and key; excerpts need a full posting before tailoring.", url: "https://developer.adzuna.com/signup" },
    { key: "usajobs", label: "USAJOBS", enabled: Boolean(env.USAJOBS_API_KEY && env.USAJOBS_EMAIL), message: "Federal IT openings. Requires an API key and the email used to register.", url: "https://developer.usajobs.gov/APIRequest/Index" },
    { key: "jobicy", label: "Jobicy", enabled: true, message: "Free remote job feed; searched when Include remote roles is enabled.", url: "https://jobicy.com/jobs-rss-feed" },
    { key: "onet", label: "O*NET", enabled: true, message: "56 occupation titles help recognize related roles. Bundled data; no key needed.", url: "https://www.onetcenter.org/database.html" },
  ];
}

export function externalSources(prefs: DiscoveryPreferences, env: Readonly<Record<string, string | undefined>> = process.env): Source[] {
  const result: Source[] = [];
  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
    for (const query of ["application support", "systems analyst", "technical support", "implementation", "IT operations", "integration analyst"]) {
      result.push({ key: `adzuna:${query.replaceAll(" ", "-")}`, board: query, provider: "adzuna", company: `Adzuna · ${query}`, url: "https://www.adzuna.com" });
    }
  }
  if (env.USAJOBS_API_KEY && env.USAJOBS_EMAIL) result.push({ key: "usajobs:2210", board: "2210", provider: "usajobs", company: "USAJOBS · Federal IT", url: "https://www.usajobs.gov" });
  if (prefs.includeRemote) result.push({ key: "jobicy:usa", board: "usa", provider: "jobicy", company: "Jobicy · US remote", url: "https://jobicy.com" });
  return result;
}

export function normalizeExternal(source: Source, value: unknown): Opening | null {
  const j = row(value);
  let id: unknown, title = "", company = "", location = "", description = "", url: unknown, published: unknown, type: unknown, mode: unknown;
  let pay = annualPay(null, null, "USD", "year");
  if (source.provider === "adzuna") {
    id = j.id; title = str(j.title); company = str(row(j.company).display_name); location = str(row(j.location).display_name);
    description = textFromHtml(j.description); url = j.redirect_url; published = j.created;
    type = j.contract_type === "contract" ? "contract" : j.contract_time === "full_time" ? "Full-time" : j.contract_time;
    mode = location;
    // Salary predictions are never treated as employer-confirmed compensation.
    if (j.salary_is_predicted === 0 || j.salary_is_predicted === "0") pay = annualPay(j.salary_min, j.salary_max, "USD", "year");
  } else if (source.provider === "jobicy") {
    id = j.id; title = str(j.jobTitle); company = str(j.companyName); location = str(j.jobGeo);
    description = textFromHtml(j.jobDescription); url = j.url; published = j.pubDate;
    type = listText(j.jobType); mode = "Remote";
    pay = annualPay(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod);
  } else if (source.provider === "usajobs") {
    const d = row(j.MatchedObjectDescriptor); const details = row(row(d.UserArea).Details);
    id = j.MatchedObjectId || d.PositionID; title = str(d.PositionTitle); company = str(d.OrganizationName);
    location = str(d.PositionLocationDisplay); url = d.PositionURI; published = d.PublicationStartDate;
    if (date(d.ApplicationCloseDate) && date(d.ApplicationCloseDate)!.getTime() < Date.now()) return null;
    description = [listText(details.JobSummary), listText(details.MajorDuties), "Qualifications", str(d.QualificationSummary), "Requirements", listText(details.Requirements), listText(details.KeyRequirements), "Education", listText(details.Education), "Who may apply", str(row(details.WhoMayApply).Name)].join("\n");
    description = textFromHtml(description); type = rows(d.PositionSchedule).map((r) => str(r.Name)).join(" "); mode = location;
    const salary = rows(d.PositionRemuneration)[0];
    if (salary) pay = annualPay(Number(salary.MinimumRange), Number(salary.MaximumRange), "USD", salary.Description === "Per Year" ? "year" : salary.Description === "Per Hour" ? "hour" : "unknown");
  }
  const sourceUrl = safeExternalUrl(url);
  if (!id || !title || !company || !sourceUrl || description.trim().length < 40) return null;
  return { externalId: String(id), sourceKey: source.key, company, title: title.slice(0, 250), location: location.slice(0, 500), sourceUrl, description: description.slice(0, 100000), employmentType: employmentType(type, description), workArrangement: workArrangement(mode), ...pay, postedAt: date(published) };
}

export async function collectExternalSource(source: Source, prefs: DiscoveryPreferences, signal?: AbortSignal) {
  const listing: Row[] = [];
  let cursor: string | null = null;
  let complete = false;
  // Three pages per query; no unbounded crawling or model usage.
  for (let page = 1; page <= 3; page++) {
    let url: URL;
    let headers: Record<string, string> = {};
    if (source.provider === "adzuna") {
      await reserveAdzunaRequest();
      url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
      url.search = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID || "", app_key: process.env.ADZUNA_APP_KEY || "", what: source.board, where: "Seal Beach, CA", distance: String(Math.ceil(prefs.radiusMiles * 1.609344)), results_per_page: "50", full_time: "1", sort_by: "date", max_days_old: "30" }).toString();
    } else if (source.provider === "usajobs") {
      url = new URL("https://data.usajobs.gov/api/search");
      url.search = new URLSearchParams({ JobCategoryCode: "2210", LocationName: "Seal Beach, California", Radius: String(prefs.radiusMiles), ResultsPerPage: "100", Page: String(page), Fields: "Full" }).toString();
      headers = { "Authorization-Key": process.env.USAJOBS_API_KEY || "", "User-Agent": process.env.USAJOBS_EMAIL || "", Host: "data.usajobs.gov" };
    } else {
      url = new URL("https://jobicy.com/api/v2/remote-jobs");
      url.search = new URLSearchParams({ geo: "usa", count: "100", ...(cursor ? { cursor } : {}) }).toString();
    }
    let data: Row;
    try { data = row(await fetchPublicJson(url.toString(), signal, headers)); }
    catch { throw new Error(`${source.provider} could not be reached. Check credentials and provider limits.`); }
    const rawBatch = source.provider === "adzuna" ? data.results : source.provider === "usajobs" ? row(data.SearchResult).SearchResultItems : data.jobs;
    if (!Array.isArray(rawBatch)) throw new Error(`${source.provider} returned an unexpected response; previous listings were preserved.`);
    const batch = rows(rawBatch);
    listing.push(...batch);
    const total = source.provider === "adzuna" ? Number(data.count) : Number(row(data.SearchResult).SearchResultCountAll);
    cursor = str(data.nextCursor) || null;
    const hasMore = source.provider === "jobicy" ? Boolean(cursor) : listing.length < total && batch.length > 0;
    if (!hasMore) { complete = true; break; }
  }
  const openings = listing.map((j) => normalizeExternal(source, j)).filter((j): j is Opening => j !== null);
  // Search results are a window, not an exhaustive active employer board. Absence
  // never closes older listings; they age into a recheck state instead.
  return { openings, liveIds: openings.map((j) => j.externalId), complete, authoritative: false, checked: listing.length, failures: 0 };
}
