import { annualPay, employmentType, payFromText, safeExternalUrl, textFromHtml, workArrangement } from "./normalization";
import { couldBeRelevant } from "./matching";
import type { Opening, Source } from "./types";

type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : v ? [v] : [];
const date = (v: unknown) => { const d = new Date(str(v)); return Number.isFinite(d.getTime()) ? d : null; };
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "") || "";

export const LOCAL_BOARD_URLS: Record<string, string> = {
  "pageup:csulb": "https://careers.pageuppeople.com/873/lb/en-us/latest_jobs.rss",
  "jobvite:laserfiche": "https://jobs.jobvite.com/laserfiche/jobs",
};

export async function publicText(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000), headers: { Accept: "application/rss+xml, text/html", "User-Agent": "AiadApply/2.0 (personal job discovery)" } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source returned no content.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 8 * 1024 * 1024) throw new Error("Source exceeds collection limit."); chunks.push(next.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

export function pageUpOpenings(source: Source, xml: string, now = new Date()): Opening[] {
  if (source.key !== "pageup:csulb" || !/<rss\b/i.test(xml)) throw new Error("University feed format changed.");
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(match => {
    const item = match[1], sourceUrl = safeExternalUrl(textFromHtml(tag(item, "link")));
    if (!sourceUrl || !/^https:\/\/careers\.pageuppeople\.com\/873\/lb\/en-us\/job\/\d+(?:\/[^/?#]+)?\/?$/.test(sourceUrl)) return [];
    const title = textFromHtml(tag(item, "title"));
    const description = textFromHtml(tag(item, "job:description"));
    const close = date(tag(item, "job:closingDate"));
    if (!couldBeRelevant(title) || description.length < 300 || close && close <= now) return [];
    const category = [...item.matchAll(/<job:category>([\s\S]*?)<\/job:category>/g)].map(m => textFromHtml(m[1])).join(" ");
    const location = textFromHtml(tag(item, "job:location")).split("|").pop()?.trim() || "";
    return [{ externalId: sourceUrl.match(/\/job\/(\d+)/)![1], sourceKey: source.key, company: source.company, title, location,
      sourceUrl, description, employmentType: employmentType(category), workArrangement: workArrangement(description.match(/(?:Work (?:Mode|Arrangement)|Location Type):[^\n]+/i)?.[0] || ""),
      ...payFromText((description.split("\n").find(line => /hiring range/i.test(line) && line.includes("$")) || description).replace(/\(Step[^)]*\)/gi, ""), title), postedAt: date(tag(item, "pubDate")) }];
  });
}

export function jobviteOpening(source: Source, html: string, url: string, now = new Date()): Opening | null {
  if (source.key !== "jobvite:laserfiche" || !/^https:\/\/jobs\.jobvite\.com\/laserfiche\/job\/[\w-]+$/.test(url)) return null;
  const values = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m => { try { return list(JSON.parse(m[1])); } catch { return []; } });
  const entries = values.flatMap(v => row(v)["@graph"] ? list(row(v)["@graph"]) : [v]);
  const j = entries.map(row).find(j => list(j["@type"]).includes("JobPosting"));
  if (!j || j.url && safeExternalUrl(j.url) !== url) return null;
  const title = str(j.title), description = textFromHtml(j.description), close = date(j.validThrough);
  if (!title || description.length < 300 || close && close <= now) return null;
  const salary = row(j.baseSalary), value = row(salary.value);
  let pay = annualPay(Number(value.minValue), Number(value.maxValue), salary.currency, value.unitText);
  if (pay.salaryMin === null) pay = payFromText(description, title);
  const addresses = list(j.jobLocation).map(v => row(row(v).address));
  const visibleMeta = html.match(/<p\b[^>]*class=["']jv-job-detail-meta["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  const visibleLocation = textFromHtml(visibleMeta.split(/<span\b[^>]*class=["']jv-inline-separator["'][^>]*><\/span>/i).slice(1).join(" ")).replace(/\s+/g, " ").trim();
  const structuredLocation = addresses.map(a => [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ")).join("; ");
  const location = addresses.some(a => a.addressLocality) ? structuredLocation : visibleLocation || structuredLocation;
  return { externalId: url.split("/").pop()!, sourceKey: source.key, company: source.company, title, description, location, sourceUrl: url,
    employmentType: employmentType(list(j.employmentType).join(" ")), workArrangement: workArrangement(/TELECOMMUTE/i.test(str(j.jobLocationType)) ? "Remote" : str(j.jobLocationType) || visibleLocation), ...pay, postedAt: date(j.datePosted) };
}

export async function collectLocalBoard(source: Source, signal?: AbortSignal) {
  const url = LOCAL_BOARD_URLS[source.key]; if (!url) throw new Error("Unknown local employer board.");
  const html = await publicText(url, signal);
  if (source.provider === "pageup") {
    const openings = pageUpOpenings(source, html);
    return { openings, liveIds: openings.map(j => j.externalId), complete: true, authoritative: false, checked: [...html.matchAll(/<item\b/g)].length };
  }
  if (!/class=["']jv-job-list["']/.test(html)) throw new Error("Employer job-list format changed or requires browser access.");
  const links = new Map<string, string>();
  for (const table of html.matchAll(/<table\b[^>]*class=["']jv-job-list["'][^>]*>([\s\S]*?)<\/table>/g)) {
    for (const m of table[1].matchAll(/<a\b[^>]*href=["'](\/laserfiche\/job\/[\w-]+)["'][^>]*>([\s\S]*?)<\/a>/g)) if (couldBeRelevant(textFromHtml(m[2]))) links.set(`https://jobs.jobvite.com${m[1]}`, textFromHtml(m[2]));
  }
  const openings: Opening[] = []; let failures = 0;
  for (const link of [...links.keys()].slice(0, 12)) { try { const opening = jobviteOpening(source, await publicText(link, signal), link); if (opening) openings.push(opening); else failures++; } catch { failures++; } }
  return { openings, liveIds: openings.map(j => j.externalId), complete: failures === 0 && links.size <= 12, authoritative: false, checked: links.size, failures };
}
