import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="content">
      <section className="panel page-error">
        <FileQuestion size={28} color="var(--amber)" />
        <div>
          <div className="eyebrow">Not found</div>
          <h1>This application record is not available.</h1>
          <p>It may have been removed, or the link may be incomplete.</p>
          <Link href="/applications" className="button button-primary"><ArrowLeft size={15} />Return to applications</Link>
        </div>
      </section>
    </div>
  );
}
