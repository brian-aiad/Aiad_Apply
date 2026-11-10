import { detailWindow, isSourceAccessError } from "./detail-window";
import { fromZonedTime } from "date-fns-tz";
import { publicText } from "./local-boards";
import { couldBeRelevant } from "./matching";
import { employmentType, payFromText, textFromHtml, workArrangement } from "./normalization";
import type { Opening, Source } from "./types";
const SEARCH = "https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx";
function pacificDate(value: string, clock: string) {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return new Date(NaN);
  const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return new Date(NaN);
  return fromZonedTime(`${iso}T${clock}`, "America/Los_Angeles");
}
const counties: Record<string, string> = { "calcareers:orange": "358", "calcareers:losangeles": "681" };
const field = (html: string, id: string) => textFromHtml(html.match(new RegExp(`<span\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i"))?.[1]);
const section = (html: string, id: string) => textFromHtml(html.match(new RegExp(`<div\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)(?=<div\\b[^>]*id=["']pnl|$)`, "i"))?.[1]);
export function stateSearchForm(html: string, key: string) {
  const county = counties[key]; if (!county) throw new Error("Unknown state search.");
  const form = new URLSearchParams();
  for (const tag of html.matchAll(/<input\b[^>]+>/gi)) {
    if (!/type=["']hidden["']/i.test(tag[0])) continue;
    const name = tag[0].match(/\bname=["']([^"']+)["']/i)?.[1];
    if (name) form.set(name, (tag[0].match(/\bvalue=["']([^"']*)["']/i)?.[1] || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
  }
  if (!form.get("__VIEWSTATE")) throw new Error("State search form changed or requires access verification.");
  form.set("__EVENTTARGET", "ctl00$cphMainContent$btnSearch"); form.set("__EVENTARGUMENT", "");
  form.set("ctl00$cphMainContent$hdnSearchCriteria", `#kw=Information%20Technology&locid=${county}`);
  form.set("ctl00$cphMainContent$hdnInit", "true"); form.set("ctl00$cphMainContent$chkExactWordMatch", "on");
  return form;
}
export function stateSearchResults(html: string) {
  const count = Number(textFromHtml(html.match(/id=["']cphMainContent_lblTotalResultCount["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]).replace(/[^\d]/g, ""));
  if (!/id=["']cphMainContent_lblTotalResultCount["']/.test(html)) throw new Error("State search results changed.");
  const ids = [...new Set([...html.matchAll(/href=["']https:\/\/www\.calcareers\.ca\.gov\/CalHrPublic\/Jobs\/JobPosting\.aspx\?JobControlId=(\d+)["']/gi)].map(m => m[1]))];
  const dates: Record<string, Date> = {};
  for (const card of html.split(/id=["']cphMainContent_rptResults_pnlCardContainer_\d+["']/i).slice(1)) {
    const id = card.match(/JobControlId=(\d+)/)?.[1];
    // The site's time datetime attribute is a stale template value: use the
    // visible Publish Date, never the observation time.
    const visible = card.match(/Publish Date:[\s\S]*?<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1];
    const d = pacificDate(textFromHtml(visible), "00:00:00");
    if (id && Number.isFinite(d.getTime())) dates[id] = d;
  }
  return { ids, dates, complete: Number.isFinite(count) && ids.length === count, checked: count };
}
export function stateOpening(source: Source, html: string, id: string, now = new Date()): Opening | null {
  if (!counties[source.key] || !/^\d+$/.test(id) || field(html, "lblDetailsJobControlNumber") !== `JC-${id}`) return null;
  const title = field(html, "lblWorkingTitle"), description = section(html, "pnlJobDescription"), conditions = section(html, "pnlWorkingConditions");
  const deadline = field(html, "lblFinalFilingDate");
  const end = pacificDate(deadline, "23:59:59");
  if (!couldBeRelevant(title) || description.length < 300 || !Number.isFinite(end.getTime()) || end < now) return null;
  // County names and application mailing addresses are not confirmed worksites.
  // Use only explicit city statements in duties/working conditions; preserve
  // multiple named cities so normal commute checks cannot silently pick one.
  const cities = [...new Set([...`${description}\n${conditions}`.matchAll(/(?:located in|based in|location(?: is|:)?|reporting location[^.]{0,90}?located in)\s+(?:the city of\s+)?(Santa Ana|Costa Mesa|Irvine|Long Beach|Los Angeles|Anaheim|Norwalk|Cerritos|Santa Fe Springs|Downey|Carson|Torrance|Huntington Beach|Seal Beach|Sacramento|Lancaster)\b/gi)].map(m => m[1]))];
  const location = cities.length ? cities.map(c => `${c}, CA`).join("; ") : field(html, "lblWorkLocation");
  const type = field(html, "lblJobType");
  return { externalId: id, sourceKey: source.key, company: field(html, "lblDepartmentName") || source.company, title,
    location, sourceUrl: `https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=${id}`,
    description: `Application closing date: ${end.toISOString()}\n${description}\nWorking Conditions\n${conditions}\nState application eligibility\n${field(html, "lblWhoMayApply")}\n${field(html, "lblSpecialRequirementText")}`,
    employmentType: /limited term|temporary/i.test(type) ? "Other" : employmentType(type),
    workArrangement: workArrangement(field(html, "lblTelework").replace(/^In Office$/i, "On-site")),
    ...payFromText(`Salary: ${field(html, "lblPrimarySalary")}`), postedAt: null };
}
async function formRequest(url: string, signal?: AbortSignal, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`State source returned HTTP ${response.status}.`);
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty state response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 8 * 1024 * 1024) throw new Error("State response exceeds collection limit."); chunks.push(r.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return { html: Buffer.concat(chunks).toString("utf8"), cookies: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
}
export async function collectCalCareers(source: Source, signal?: AbortSignal, state?: unknown) {
  const initial = await formRequest(SEARCH, signal);
  const form = stateSearchForm(initial.html, source.key);
  const result = stateSearchResults((await formRequest(SEARCH, signal, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: initial.cookies }, body: form.toString() })).html);
  const window = detailWindow(result.ids, state);
  const openings: Opening[] = []; let failures = 0;
  for (const id of window.ids) {
    try { const j = stateOpening(source, await publicText(`https://calcareers.ca.gov/CalHrPublic/Jobs/JobPostingPrint.aspx?jcid=${id}`, signal), id); if (j) openings.push({ ...j, postedAt: result.dates[id] || null }); }
    catch (error) { if (isSourceAccessError(error)) throw error; failures++; }
  }
  return { openings, liveIds: openings.map(j => j.externalId), checked: result.checked, complete: result.complete && result.ids.length <= 12 && failures === 0, authoritative: false, failures, nextState: window.nextState, continuationPending: window.moreDetails || failures > 0 };
}
