import { DiscoveryBoard, type DiscoveryData } from "@/components/discovery-board";
import { DiscoveryAutoRefresh } from "@/components/discovery-auto-refresh";
import { readDiscoveryView } from "@/lib/discovery/view-state";
import { discoverySnapshot } from "@/lib/discovery/service";
export const dynamic = "force-dynamic";
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const view = readDiscoveryView(new URLSearchParams(Object.entries(parameters).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])));
  const snapshot = await discoverySnapshot();
  return <div className="content discover-page"><DiscoveryAutoRefresh /><DiscoveryBoard initialView={view} initial={JSON.parse(JSON.stringify(snapshot)) as DiscoveryData} /></div>;
}
