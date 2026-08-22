import Link from "next/link";
import { Plus } from "lucide-react";
import { ApplicationTable } from "@/components/application-table";
import { getApplications } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await getApplications();
  return (
    <div className="content">
      <div className="page-heading" style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="eyebrow">Pipeline</div>
          <h1 className="page-title">Applications</h1>
          <p className="page-copy">
            A single record for every posting, tailoring run, resume artifact, and
            application outcome.
          </p>
        </div>
        <Link href="/capture" className="button button-primary">
          <Plus size={15} />
          Capture job
        </Link>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <ApplicationTable applications={applications} showTools />
      </section>
    </div>
  );
}
