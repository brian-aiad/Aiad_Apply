import { DiscoveryBoard, type DiscoveryData } from "@/components/discovery-board";
import { DiscoveryAutoRefresh } from "@/components/discovery-auto-refresh";
import { discoverySnapshot } from "@/lib/discovery/service";
export const dynamic = "force-dynamic";
export default async function DiscoverPage() {
  const snapshot = await discoverySnapshot();
  return <div className="content discover-page"><DiscoveryAutoRefresh /><DiscoveryBoard initial={JSON.parse(JSON.stringify(snapshot)) as DiscoveryData} /></div>;
}
