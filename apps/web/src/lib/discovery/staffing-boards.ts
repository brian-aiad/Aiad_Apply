import { publicText } from "./local-boards";
import { couldBeRelevant } from "./matching";
import { annualPay, employmentType, payFromText, textFromHtml, workArrangement } from "./normalization";
import type { Opening, Source } from "./types";
type Row = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v : "";
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const BALBOA = "https://app.trinethire.com/companies/50346-balboa-technologies/jobs";
// Same unauthenticated feed used by the public careers page; only visible fields.
export const LUXUS_FEED = "https://luxusjobs.com/api/apps/6995b6d65824a888e7aee960/entities/JobMapping?" + new URLSearchParams({
  q: JSON.stringify({ sync_status: "active" }), sort: "-job_num", limit: "1000",
  fields: "job_num,job_code,portal_url_slug,portal_title,portal_description,portal_city,portal_state,portal_country,portal_compensation,salary_min,salary_max,opportunity_type,work_site,sync_status",
});
export function balboaLinks(html: string): string[] {
  if (!/class=["'][^"']*\bjob-list\b/.test(html)) throw new Error("Balboa job-list format changed or requires sign-in.");
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["'](\/companies\/50346(?:-balboa-technologies)?\/jobs\/(\d+-[\w-]+))["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (couldBeRelevant(textFromHtml(m[3]))) links.add(`https://app.trinethire.com/companies/50346/jobs/${m[2]}`);
  }
  return [...links];
}
export function balboaOpening(source: Source, html: string, url: string): Opening | null {
  const id = url.match(/^https:\/\/app\.trinethire\.com\/companies\/50346(?:-balboa-technologies)?\/jobs\/(\d+)-[\w-]+$/)?.[1];
  if (source.key !== "trinet:balboa" || !id || !/id=["']new_applicant["']/.test(html)) return null;
  const title = textFromHtml(html.match(/<h3\b[^>]*class=["']job-name["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
  const meta = html.match(/<ul\b[^>]*class=["']job-meta["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const items = [...meta.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m => textFromHtml(m[1]));
  const description = textFromHtml(html.match(/<div\b[^>]*class=["']job-descr content["'][^>]*>([\s\S]*?)<\/article>/i)?.[1]);
  if (!couldBeRelevant(title) || description.length < 300) return null;
  return { externalId: id, sourceKey: source.key, company: source.company, title,
    location: items.find(v => !/^(?:Category|Type|Min\. Experience|Salary):/i.test(v)) || "", sourceUrl: url, description,
    employmentType: employmentType(items.find(v => /^Type:/i.test(v))),
    workArrangement: workArrangement(description.match(/(?:Work (?:Schedule|Arrangement)|Location Type):[^\n]+/i)?.[0] || ""),
    ...payFromText(items.find(v => /^Salary:/i.test(v)) || ""), postedAt: null };
}
export function luxusOpenings(source: Source, data: unknown): Opening[] {
  if (source.key !== "luxus:careers" || !Array.isArray(data) || data.some(v => !row(v).portal_url_slug)) throw new Error("Luxus public board format changed.");
  return data.flatMap(value => {
    const j = row(value), title = str(j.portal_title), slug = str(j.portal_url_slug);
    if (j.sync_status !== "active" || !couldBeRelevant(title) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return [];
    const description = textFromHtml(j.portal_description).split(/Recruiting Keywords/i)[0].trim();
    if (description.length < 300) return [];
    const boardPay = annualPay(j.salary_min, j.salary_max, /^(?:United States|USA|US)$/i.test(str(j.portal_country)) ? "USD" : "", /^salary$/i.test(str(j.portal_compensation)) ? "year" : /hour/i.test(str(j.portal_compensation)) ? "hour" : "");
    const bodyPay = payFromText(description, title);
    // Never resolve conflicting published ranges toward a higher starting floor.
    const pay = boardPay.salaryMin !== null && (bodyPay.salaryMin === null || boardPay.salaryMin <= bodyPay.salaryMin) ? boardPay : bodyPay;
    const schedule = description.match(/(?:Work Schedule|Employment Type|Position Type|Job Type)\s*:\s*([^\n]+)/i)?.[1] || "";
    const term = /contract|temporary|part.?time|intern/i.test(str(j.opportunity_type)) ? "Other" : employmentType(schedule, description);
    return [{ externalId: str(j.job_num) || str(j.job_code) || slug, sourceKey: source.key, company: source.company, title, description,
      location: [j.portal_city, j.portal_state, j.portal_country].filter(v => typeof v === "string" && v.trim()).join(", "),
      sourceUrl: `https://luxusjobs.com/careers/${slug}`, employmentType: term,
      workArrangement: workArrangement(str(j.work_site)), ...pay, postedAt: null }];
  });
}
export async function collectStaffingBoard(source: Source, signal?: AbortSignal) {
  if (source.key === "luxus:careers") {
    const data: unknown = JSON.parse(await publicText(LUXUS_FEED, signal));
    const openings = luxusOpenings(source, data);
    return { openings, liveIds: openings.map(j => j.externalId), complete: Array.isArray(data) && data.length < 1000, authoritative: false, checked: Array.isArray(data) ? data.length : 0 };
  }
  if (source.key !== "trinet:balboa") throw new Error("Unknown staffing board.");
  const links = balboaLinks(await publicText(BALBOA, signal));
  const openings: Opening[] = []; let failures = 0;
  for (const url of links.slice(0, 12)) {
    try { const j = balboaOpening(source, await publicText(url, signal), url); if (j) openings.push(j); else failures++; }
    catch { failures++; }
  }
  return { openings, liveIds: openings.map(j => j.externalId), checked: links.length, complete: failures === 0 && links.length <= 12, authoritative: false, failures };
}
