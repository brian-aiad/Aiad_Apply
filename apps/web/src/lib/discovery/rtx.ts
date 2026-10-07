import { fetchPublicJson } from "./public-fetch";
import { annualPay, employmentType, textFromHtml, workArrangement } from "./normalization";
import { rtxExperiencedTitle } from "./rtx-fit";
import { postedWithin } from "./freshness";
import type { Opening, Source } from "./types";

export const RTX_SOURCE: Source = { key: "rtx:california", provider: "rtx", board: "REC_RTX_Ext_Gateway", company: "RTX / Raytheon", url: "https://careers.rtx.com/global/en/search-results" };
const API = "https://globalhr.wd5.myworkdayjobs.com/wday/cxs/globalhr/REC_RTX_Ext_Gateway";
type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
const str = (v: unknown) => typeof v === "string" ? v : "";

export function californiaLocations(facets: unknown): string[] {
  return rows(facets).flatMap((facet) => facet.facetParameter === "locations"
    ? rows(facet.values).filter((v) => str(v.descriptor).startsWith("US-CA-")).map((v) => str(v.id)).filter(Boolean)
    : californiaLocations(facet.values));
}
export function rtxCareerLevel(title: string): "early" | "experienced" | "student" {
  if (/\b(?:intern|internship|co-op|skillbridge)\b/i.test(title)) return "student";
  if (rtxExperiencedTitle(title)) return "experienced";
  return "early";
}
export function normalizeRtx(raw: unknown, now = new Date()): Opening | null {
  const j = row(row(raw).jobPostingInfo);
  if (j.canApply !== true || j.posted === false) return null;
  const locations = [str(j.location), ...rows(j.additionalLocations).map((l) => str(l.descriptor))];
  const california = locations.filter((l) => /^US-CA-/i.test(l));
  if (!california.length) return null;
  const description = textFromHtml(j.jobDescription);
  // An explicitly printed original date wins over Workday's refresh/start date.
  const published = description.match(/Date Posted:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || str(j.startDate);
  if (!postedWithin(published, 21, now) || !str(j.jobReqId) || description.length < 100) return null;
  const url = str(j.externalUrl);
  if (!/^https:\/\/globalhr\.wd5\.myworkdayjobs\.com\/(?:en-US\/)?REC_RTX_Ext_Gateway\/job\//.test(url)) return null;
  const band = description.match(/salary range for this role is\s*([\d,.]+)\s*USD\s*[-–]\s*([\d,.]+)\s*USD/i);
  const rawSalary = description.match(/salary range for this role[^.\n]{0,120}/i)?.[0];
  const pay = band ? annualPay(Number(band[1].replaceAll(",", "")), Number(band[2].replaceAll(",", "")), "USD", "year") : annualPay(null, null, "USD", "year");
  if (!band && rawSalary && /\$|USD/.test(rawSalary)) pay.salaryText = "Pay needs verification · employer formatting";
  const company = /\bAt Raytheon\b|\bRaytheon (?:Software|Engineering|Technologies|Intelligence)/i.test(description) ? "Raytheon" : /Collins Aerospace|At Collins,/i.test(description) ? "Collins Aerospace" : /Pratt & Whitney/i.test(description) ? "Pratt & Whitney" : "RTX · confirm business unit";
  return { externalId: str(j.jobReqId), sourceKey: RTX_SOURCE.key, company, title: str(j.title), location: california.join("; "), sourceUrl: url, description, employmentType: employmentType(j.timeType), workArrangement: workArrangement(description.match(/Position Role Type:\s*(\w+)/i)?.[1] || j.title), ...pay, postedAt: new Date(published) };
}

export async function collectRtx(signal?: AbortSignal) {
  const list = async (offset: number, locations: string[] = []) => row(await fetchPublicJson(`${API}/jobs`, signal, {}, { appliedFacets: locations.length ? { locations } : {}, limit: 20, offset, searchText: "" }));
  const initial = await list(0);
  const locations = californiaLocations(initial.facets);
  if (!locations.length) throw new Error("RTX's California location filters changed; use the employer search link.");
  const listing: Row[] = [];
  let complete = true;
  for (let offset = 0; offset < 1000; offset += 20) {
    const page = await list(offset, locations);
    if (!Array.isArray(page.jobPostings) || typeof page.total !== "number") throw new Error("RTX's listing format changed.");
    listing.push(...rows(page.jobPostings));
    if (listing.length >= page.total) break;
    if (!page.jobPostings.length || offset === 980) { complete = false; break; }
  }
  const candidates = listing.filter((j) => rtxCareerLevel(str(j.title)) === "early" && !/30\+/.test(str(j.postedOn)) && Number(str(j.postedOn).match(/\d+/)?.[0] ?? 0) <= 21);
  const openings: Opening[] = [];
  let failures = 0;
  const errors: string[] = [];
  for (let offset = 0; offset < candidates.length; offset += 4) {
    if (signal?.aborted) { complete = false; break; }
    const results = await Promise.allSettled(candidates.slice(offset, offset + 4).map(async (j) => {
      const path = str(j.externalPath);
      if (!/^\/job\/[\w/-]+$/.test(path)) throw new Error("Unexpected RTX detail path.");
      return normalizeRtx(await fetchPublicJson(`${API}${path}`, signal));
    }));
    for (const result of results) {
      if (result.status === "rejected") { failures++; errors.push(result.reason instanceof Error ? result.reason.message : "Detail unavailable"); }
      else if (result.value) openings.push(result.value);
    }
  }
  return { openings, liveIds: listing.flatMap((j) => Array.isArray(j.bulletFields) ? j.bulletFields.map(String) : []), checked: listing.length, complete: complete && failures === 0, authoritative: true, failures, message: errors.length ? `${failures} RTX descriptions unavailable: ${[...new Set(errors)].join("; ")}` : undefined };
}
