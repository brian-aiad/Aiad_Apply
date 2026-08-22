"use client";

import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="content">
      <section className="panel page-error" role="alert">
        <CircleAlert size={28} color="var(--red)" />
        <div>
          <div className="eyebrow">Page could not load</div>
          <h1>Check the local services, then retry.</h1>
          <p>The dashboard could not read this page. Your resume files and application records were not changed.</p>
          <div className="page-error-actions">
            <button className="button button-primary" type="button" onClick={reset}><RotateCcw size={15} />Try again</button>
            <Link href="/settings" className="button">Check settings</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
