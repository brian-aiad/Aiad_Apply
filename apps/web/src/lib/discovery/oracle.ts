import { fetchPublicJson } from "./public-fetch";
import { couldBeRelevant } from "./matching";
import { employmentType, payFromText, textFromHtml, workArrangement } from "./normalization";
import type { Opening, Source } from "./types";

// Only observed public candidate-experience boards belong here. Posting content
// never controls a request origin, site number, path, or category filter.
const BOARDS = {
  hoag: { origin: "https://iaucqy.fa.ocs.oraclecloud.com", publicUrl: "https://jobs.hoag.org/en/sites/CX_1/job/", category: "300000012021239" },
  lbtransit: { origin: "https://myportal.lbtransit.com", publicUrl: "https://myportal.lbtransit.com/hcmUI/CandidateExperience/en/sites/CX_1/job/", category: "" },
} as const;
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const objects = (v: unknown): Obj[] => Array.isArray(v) ? v.map(object) : [];
const string = (v: unknown): string => typeof v === "string" ? v.trim() : "";
const idOf = (v: unknown): string => /^(?:0|[1-9]\d*)$/.test(String(v)) ? String(v) : "";
const date = (v: unknown): Date | null => { const n = Date.parse(string(v)); return Number.isFinite(n) ? new Date(n) : null; };
function boardFor(source: Source) {
  const board = BOARDS[source.board as keyof typeof BOARDS];
  if (source.provider !== "oracle" || !board) throw new Error("Unsupported Oracle public board.");
  return board;
}
function endpoint(source: Source, resource: string, finder: string, expand: string) {
  const url = new URL(`/hcmRestApi/resources/latest/${resource}`, boardFor(source).origin);
  url.search = new URLSearchParams({ onlyData: "true", expand, finder }).toString();
  return url.toString();
}

export function normalizeOracleOpening(source: Source, raw: unknown, expectedId: string, now = Date.now()): Opening | null {
  const job = object(raw);
  if (!expectedId || idOf(job.Id) !== expectedId) throw new Error("Oracle job detail identity did not match its listing.");
  const end = date(job.ExternalPostedEndDate);
  if (end && end.getTime() <= now) return null;
  const title = string(job.Title);
  // Never use Internal* descriptions or infer availability from ApplyWhenNotPostedFlag.
  let description = [job.ExternalDescriptionStr, job.ExternalResponsibilitiesStr, job.ExternalQualificationsStr].map(textFromHtml).filter(Boolean).join("\n\n");
  if (!title || description.length < 100) throw new Error("Oracle job detail is incomplete.");
  const flex = objects(job.requisitionFlexFields);
  const flexSchedules = flex.filter(f => /^job schedule$/i.test(string(f.Prompt))).map(f => string(f.Value));
  const schedules = [string(job.JobSchedule), ...flexSchedules].filter(Boolean).map(s => employmentType(s));
  const schedule = schedules.includes("Other") ? "Other" : schedules.includes("Full-time") ? "Full-time" : employmentType("", description);
  // Preserve every listed worksite. The downstream eligibility gate must reject
  // ambiguity; never replace multiple addresses with a convenient nearby city.
  const worksites = [...objects(job.workLocation), ...objects(job.otherWorkLocations), ...objects(job.secondaryLocations)];
  const locations = [...new Set(worksites.map(loc => [loc.AddressLine1, loc.TownOrCity, loc.Region2, loc.PostalCode, loc.Country].map(string).filter(Boolean).join(", ")).filter(Boolean))];
  const ambiguous = worksites.some(loc => !string(loc.TownOrCity) || !/^(?:CA|California)$/i.test(string(loc.Region2)) || (string(loc.Country) && string(loc.Country) !== "US")) || locations.length > 1;
  const location = ambiguous ? "Multiple or unconfirmed worksites" : locations[0] || string(job.PrimaryLocation);
  if (ambiguous) description += `\n\nListed worksites (confirmation required): ${locations.join("; ") || "Not confirmed"}`;
  const payRange = [string(job.PayRange), ...flex.filter(f => /^pay range$/i.test(string(f.Prompt))).map(f => string(f.Value))].filter(Boolean).join("; ");
  // A nearby benefits sentence must not supply the missing period of a flex range.
  const parsedPay = [payFromText(payRange, title), payFromText(description, title)].filter(p => p.salaryMin !== null);
  const uniquePay = [...new Map(parsedPay.map(p => [`${p.salaryMin}:${p.salaryMax}`, p])).values()];
  const pay = uniquePay.length === 1 ? uniquePay[0] : payFromText("");
  if (pay.salaryMin === null && payRange) pay.salaryText = `${payRange} (pay period unconfirmed)`;
  const modes = [string(job.WorkplaceType), ...flex.filter(f => /^remote or onsite$/i.test(string(f.Prompt))).map(f => string(f.Value))].filter(Boolean).map(workArrangement);
  const mode = new Set(modes).size === 1 ? modes[0] : "Not listed";
  return { externalId: expectedId, sourceKey: source.key, company: source.company, title: title.slice(0, 250), location: location.slice(0, 500), sourceUrl: `${boardFor(source).publicUrl}${expectedId}/`, description: description.slice(0, 100_000), employmentType: schedule, workArrangement: mode || "Not listed", ...pay, postedAt: date(job.ExternalPostedStartDate) };
}

export async function collectOracle(source: Source, signal?: AbortSignal) {
  const board = boardFor(source);
  const listings = new Map<string, Obj>();
  let complete = true, failures = 0, message: string | undefined;
  let expectedTotal: number | undefined;
  const expand = "requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields";
  // Nested metadata describes the jobs; top-level count/hasMore only describe
  // the single search envelope and must never terminate pagination.
  for (let offset = 0; offset < 200; offset += 25) {
    if (signal?.aborted) { complete = false; message = "Collection deadline reached."; break; }
    const finder = `findReqs;siteNumber=CX_1,facetsList=WORK_LOCATIONS;WORKPLACE_TYPES;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS;LOCATIONS,limit=25,offset=${offset},sortBy=POSTING_DATES_DESC${board.category ? `,lastSelectedFacet=CATEGORIES,selectedCategoriesFacet=${board.category}` : ""}`;
    const data = object(await fetchPublicJson(endpoint(source, "recruitingCEJobRequisitions", finder, expand), signal));
    const envelope = objects(data.items)[0];
    if (!envelope || !Array.isArray(envelope.requisitionList) || !Number.isInteger(envelope.TotalJobsCount) || Number(envelope.TotalJobsCount) < 0 || envelope.Offset !== offset) throw new Error("Oracle source changed its job-list format.");
    const total = Number(envelope.TotalJobsCount);
    if (expectedTotal !== undefined && expectedTotal !== total) { complete = false; message = "Source changed during pagination; prior listings were preserved."; }
    expectedTotal ??= total;
    const rows = objects(envelope.requisitionList);
    for (const row of rows) {
      const id = idOf(row.Id);
      if (!id || listings.has(id)) { complete = false; failures++; } else listings.set(id, row);
    }
    if (offset + rows.length >= Number(envelope.TotalJobsCount)) break;
    if (rows.length !== 25 || offset === 175) { complete = false; message = "Collection reached its bounded page limit or an incomplete page."; break; }
  }
  if (listings.size !== expectedTotal) complete = false;
  const candidates = [...listings].filter(([, row]) => couldBeRelevant(string(row.Title)));
  if (candidates.length > 40) { complete = false; message = "Collection reached its bounded detail limit."; }
  const openings: Opening[] = [];
  for (const [id] of candidates.slice(0, 40)) {
    if (signal?.aborted) { complete = false; message = "Collection deadline reached."; break; }
    try {
      const data = object(await fetchPublicJson(endpoint(source, "recruitingCEJobRequisitionDetails", `ById;Id="${id}",siteNumber=CX_1`, "all"), signal));
      const detail = objects(data.items);
      if (detail.length !== 1) throw new Error("Oracle job detail is missing or ambiguous.");
      const opening = normalizeOracleOpening(source, detail[0], id);
      if (opening) openings.push(opening);
    } catch (error) {
      complete = false; failures++;
      message = error instanceof Error ? error.message : "Oracle job detail could not be verified.";
      if (/HTTP (?:401|403|429)/.test(message)) break;
    }
  }
  return { openings, liveIds: [...listings.keys()], complete: complete && failures === 0, authoritative: true, checked: listings.size, failures, ...(message ? { message } : {}) };
}
