import { DiscoveryBoard, type DiscoveryData } from "@/components/discovery-board";
import Link from "next/link";
import { DiscoveryAutoRefresh } from "@/components/discovery-auto-refresh";
import { readDiscoveryView } from "@/lib/discovery/view-state";
import { discoverySnapshot } from "@/lib/discovery/service";
import { DiscoveryEvidenceUnavailable } from "@/lib/discovery/current-evidence";
export const dynamic = "force-dynamic";
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const view = readDiscoveryView(new URLSearchParams(Object.entries(parameters).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])));
  let snapshot;
  try { snapshot = await discoverySnapshot(); } catch (error) {
    if (!(error instanceof DiscoveryEvidenceUnavailable)) throw error;
    return <div className="content discover-page"><section className="panel"><h1>Refresh your resume evidence</h1><p>Open Discover on your desktop to sync the current resume, then reload this page. Your saved jobs and applications are retained.</p><Link href="/applications">View applications</Link></section></div>;
  }
  return <div className="content discover-page"><DiscoveryAutoRefresh /><DiscoveryBoard initialView={view} initial={JSON.parse(JSON.stringify(snapshot)) as DiscoveryData} /></div>;
}
