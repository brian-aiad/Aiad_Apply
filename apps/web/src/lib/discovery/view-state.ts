export type DiscoveryView = {
  channel: "local" | "rtx";
  tab: "all" | "matches" | "review" | "approved" | "dismissed";
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
    channel: value("channel", ["local", "rtx"], "local"),
    tab: value("tab", ["all", "matches", "review", "approved", "dismissed"], "all"),
    period: value("period", ["21", "7", "3", "undated", "active", "today", "week"], "21"),
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
  if (view.period !== "21") params.set("period", view.period);
  if (view.sort !== "fit") params.set("sort", view.sort);
  if (view.query.trim()) params.set("q", view.query.trim().slice(0, 200));
  if (!view.rtxLocal) params.set("statewide", "1");
  if (view.rtxRemote) params.set("remote", "1");
  return params.toString();
}
