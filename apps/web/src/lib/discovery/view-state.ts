import { rankLinkedIn } from "./linkedin-policy";
export type DiscoveryView = {
  channel: "local" | "rtx" | "linkedin";
  tab: "all" | "matches" | "review" | "approved" | "dismissed" | "excluded";
  period: string;
  sort: "fit" | "newest" | "nearest";
  query: string;
  rtxLocal: boolean;
  rtxRemote: boolean;
};
export function readDiscoveryView(params: URLSearchParams): DiscoveryView {
  const value = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(name);
    return allowed.includes(v as T) ? v as T : fallback;
  };
  return {
    channel: value("channel", ["local", "rtx", "linkedin"], "local"),
    tab: value("tab", ["all", "matches", "review", "approved", "dismissed", "excluded"], "all"),
    period: value("period", ["recommended", "21", "7", "3", "undated", "active", "today", "week"], "recommended"),
    sort: value("sort", ["fit", "newest", "nearest"], "fit"),
    query: (params.get("q") ?? "").slice(0, 200),
    rtxLocal: params.get("statewide") !== "1",
    rtxRemote: params.get("remote") === "1",
  };
}
export function discoveryViewSearch(view: DiscoveryView): string {
  const params = new URLSearchParams();
  if (view.channel !== "local") params.set("channel", view.channel);
  if (view.tab !== "all") params.set("tab", view.tab);
  if (view.period !== "recommended") params.set("period", view.period);
  if (view.sort !== "fit") params.set("sort", view.sort);
  if (view.query.trim()) params.set("q", view.query.trim().slice(0, 200));
  if (!view.rtxLocal) params.set("statewide", "1");
  if (view.rtxRemote) params.set("remote", "1");
  return params.toString();
}

export function compareLinkedInFit(a: { qualified: boolean; score: number; linkedin?: { premiumSignal?: string; topApplicant?: boolean } }, b: { qualified: boolean; score: number; linkedin?: { premiumSignal?: string; topApplicant?: boolean } }) {
  return Number(b.qualified) - Number(a.qualified) || rankLinkedIn({ ...a, postedAt: null }, { ...b, postedAt: null });
}
export function visibleLinkedInContact(contact: { name?: string; profileUrl?: string }) {
  if (!contact.name?.trim() || !contact.profileUrl) return false;
  try { const url = new URL(contact.profileUrl); return url.protocol === "https:" && url.hostname === "www.linkedin.com" && /^\/in\/[^/]+\/?$/.test(url.pathname) && !url.username && !url.password; } catch { return false; }
}
