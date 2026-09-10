export function textFromHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•" };
  let result = value;
  for (let i = 0; i < 3; i++) result = result.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? all;
    const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
  return result.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<(?:br\s*\/|\/p|\/div|\/li|\/h[1-6]|\/ul|\/section|br)\s*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 100_000);
}

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|gh_src|source$)/i.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function employmentType(value: unknown, description = ""): "Full-time" | "Other" | "Not listed" {
  const text = typeof value === "string" ? value : "";
  if (/part.?time|intern|temporary|contract|freelance/i.test(text)) return "Other";
  if (/full[\s_-]?time|permanent/i.test(text)) return "Full-time";
  // A benefits paragraph mentioning full-time employees is not a commitment.
  if (/\b(?:employment|position|job)\s*type\s*:\s*full[ -]?time|\bthis (?:is a|position is) full[ -]?time\b/i.test(description)) return "Full-time";
  return "Not listed";
}

export function workArrangement(value: unknown): "On-site" | "Hybrid" | "Remote" | "Not listed" {
  const s = typeof value === "string" ? value : "";
  if (/hybrid/i.test(s)) return "Hybrid";
  if (/remote/i.test(s)) return "Remote";
  if (/on[ -]?site|on[ -]?premise/i.test(s)) return "On-site";
  return "Not listed";
}

type Pay = { salaryMin: number | null; salaryMax: number | null; salaryText: string | null };
export function annualPay(min: unknown, max: unknown, currency: unknown, interval: unknown): Pay {
  const empty = { salaryMin: null, salaryMax: null, salaryText: null };
  if (currency !== "USD" || typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return empty;
  const unit = String(interval).toLowerCase();
  const factor = /hour/.test(unit) ? 2080 : /year|annual/.test(unit) ? 1 : /month/.test(unit) ? 12 : 0;
  if (!factor) return empty;
  if (factor === 2080 && max > 1000) return empty;
  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: factor === 2080 ? 2 : 0 }).format(v);
  return { salaryMin: Math.round(min * factor), salaryMax: Math.round(max * factor), salaryText: `${fmt(min)}–${fmt(max)}/${factor === 2080 ? "hour" : factor === 12 ? "month" : "year"}` };
}

export function payFromText(text: string, title?: string): Pay {
  const empty = { salaryMin: null, salaryMax: null, salaryText: null };
  if (title) {
    const matchingLine = text.split("\n").find((line) => line.trim().toLowerCase().startsWith(`${title.trim().toLowerCase()}:`) && line.includes("$"));
    if (matchingLine) { const pay = payFromText(matchingLine); if (pay.salaryMin !== null) return pay; }
  }
  const ranges = [...text.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?(?:\s*\/\s*(?:hr|hour|year))?\s*(?:[-–—]|to)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?/g)];
  const parsed = ranges.flatMap((m) => {
    const context = text.slice(Math.max(0, (m.index ?? 0) - 90), (m.index ?? 0) + m[0].length + 70);
    if (/\b(?:CAD|AUD|NZD|SGD)\b/i.test(context)) return [];
    if (/\b(?:bonus|equity|sign-on|stock)\b/i.test(context) && !/\b(?:base (?:salary|pay)|hourly|annual salary)\b/i.test(context)) return [];
    const min = Number(m[1].replaceAll(",", "")) * (m[2] ? 1000 : 1);
    const max = Number(m[3].replaceAll(",", "")) * (m[4] ? 1000 : 1);
    const interval = min >= 10_000 && /\b(?:salary|annual|year|base pay|USD|compensation|pay range)\b/i.test(context) ? "year" : /\b(?:hour|hourly|hr)\b|\/hr/i.test(context) ? "hour" : /\bmonth(?:ly)?\b/i.test(context) ? "month" : "unknown";
    const pay = annualPay(min, max, "USD", interval);
    return pay.salaryMin === null ? [] : [pay];
  });
  // Multiple region-dependent bands need a human to identify the applicable one.
  const unique = [...new Map(parsed.map((p) => [`${p.salaryMin}:${p.salaryMax}`, p])).values()];
  return unique.length === 1 ? unique[0] : empty;
}
