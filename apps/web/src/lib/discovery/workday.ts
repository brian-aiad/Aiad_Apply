import { fetchPublicJson } from "./public-fetch";
import { annualPay, employmentType, payFromText, safeExternalUrl, textFromHtml, workArrangement } from "./normalization";
import { couldBeRelevant, hasLocalLocationOption, localDistance } from "./matching";
import type { DiscoveryPreferences, Opening, Source } from "./types";

type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
const str = (v: unknown) => typeof v === "string" ? v : "";

// Fixed public employer boards verified from their careers pages; no arbitrary host fetches.
export const WORKDAY_BOARDS: Record<string, { tenant: string; host: string; site: string }> = {
  "workday:hntb": { tenant: "hntb", host: "hntb.wd5.myworkdayjobs.com", site: "HNTB_Careers" },
  "workday:travismathew": { tenant: "tcbrands", host: "tcbrands.wd1.myworkdayjobs.com", site: "TravisMathew-Careers" },
};

export function localWorkdayFacets(facets: unknown, prefs: DiscoveryPreferences): Record<string, string[]> {
  const selections: Record<string, string[]> = {};
  for (const facet of rows(facets)) {
    const parameter = str(facet.facetParameter);
    if (/^locations?$/i.test(parameter)) {
      const ids = rows(facet.values).filter(value => {
        const location = str(value.descriptor);
        const distance = localDistance(location);
        return distance !== null && distance <= prefs.radiusMiles || hasLocalLocationOption(location, prefs.radiusMiles)
          || prefs.includeRemote && /remote/i.test(location) && /United States|California|US-CA/i.test(location);
      }).map(value => str(value.id)).filter(Boolean);
      if (ids.length) selections[parameter] = ids;
    }
    Object.assign(selections, localWorkdayFacets(facet.values, prefs));
  }
  return selections;
}

export function normalizeWorkday(source: Source, raw: unknown): Opening | null {
  const config = WORKDAY_BOARDS[source.key];
  const j = row(row(raw).jobPostingInfo);
  if (!config || j.canApply !== true || j.posted === false || !str(j.jobReqId)) return null;
  const description = textFromHtml(j.jobDescription);
  if (description.length < 100 || !str(j.title)) return null;
  const sourceUrl = safeExternalUrl(j.externalUrl);
  if (!sourceUrl) return null;
  const url = new URL(sourceUrl);
  if (url.hostname !== config.host || !url.pathname.includes(`/${config.site}/job/`)) return null;
  const location = [str(j.location), ...rows(j.additionalLocations).map(value => str(value.descriptor))].filter(Boolean).join("; ");
  const printedDate = description.match(/(?:Date Posted|Original Posting Date):\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  const rawDate = printedDate || str(j.startDate);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00Z`) : null;
  const postedAt = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === rawDate ? date : null;
  // Some employers print minimum / midpoint / maximum without dollar signs.
  const triple = description.match(/\b([\d,]+\.\d{2})\s*[-–]\s*([\d,]+\.\d{2})\s*[-–]\s*([\d,]+\.\d{2})\s+USD\s+Annual\b/i);
  const pay = triple && Number(triple[1].replaceAll(",", "")) <= Number(triple[2].replaceAll(",", "")) && Number(triple[2].replaceAll(",", "")) <= Number(triple[3].replaceAll(",", ""))
    ? annualPay(Number(triple[1].replaceAll(",", "")), Number(triple[3].replaceAll(",", "")), "USD", "year") : payFromText(description, str(j.title));
  return { externalId: str(j.jobReqId), sourceKey: source.key, company: source.company, title: str(j.title), location, sourceUrl, description, employmentType: employmentType(j.timeType), workArrangement: workArrangement(`${location}\n${str(j.remoteType)}\n${str(j.title)}`), ...pay, postedAt };
}

export async function collectWorkday(source: Source, prefs: DiscoveryPreferences, signal?: AbortSignal) {
  const config = WORKDAY_BOARDS[source.key];
  if (!config) throw new Error("Unknown Workday employer board.");
  const api = `https://${config.host}/wday/cxs/${config.tenant}/${config.site}`;
  const list = async (offset: number, appliedFacets: Record<string, string[]> = {}) => row(await fetchPublicJson(`${api}/jobs`, signal, {}, { appliedFacets, limit: 20, offset, searchText: "" }));
  const initial = await list(0);
  if (!Array.isArray(initial.jobPostings) || typeof initial.total !== "number") throw new Error("Employer listing format changed.");
  const facets = localWorkdayFacets(initial.facets, prefs);
  const filtered = Object.keys(facets).length > 0;
  const listing: Row[] = [];
  let complete = true;
  for (let offset = 0; offset < 1000; offset += 20) {
    const page = offset === 0 && !filtered ? initial : await list(offset, facets);
    if (!Array.isArray(page.jobPostings) || typeof page.total !== "number") throw new Error("Employer listing format changed.");
    listing.push(...rows(page.jobPostings));
    if (listing.length >= page.total) break;
    if (!page.jobPostings.length || offset === 980) { complete = false; break; }
  }
  const candidates = listing.filter(item => couldBeRelevant(str(item.title)));
  const openings: Opening[] = [];
  let failures = 0;
  for (let offset = 0; offset < candidates.length; offset += 4) {
    if (signal?.aborted) { complete = false; break; }
    const batch = await Promise.allSettled(candidates.slice(offset, offset + 4).map(async item => {
      const path = str(item.externalPath);
      if (!/^\/job\/[\w/-]+$/.test(path)) throw new Error("Unexpected employer detail path.");
      return normalizeWorkday(source, await fetchPublicJson(`${api}${path}`, signal));
    }));
    for (const result of batch) {
      if (result.status === "rejected") failures++;
      else if (result.value) openings.push(result.value);
    }
  }
  // A location-filtered response is not authoritative for older saved worksites.
  return { openings, liveIds: listing.flatMap(item => Array.isArray(item.bulletFields) ? item.bulletFields.map(String) : []), complete: complete && failures === 0, authoritative: !filtered, checked: listing.length, failures };
}
