import Link from "next/link";
export default function ApplyHelp() {
  return <div className="content apply-help">
    <div className="eyebrow">Find → tailor → apply → confirm</div>
    <h1 className="page-title">Your application workflow</h1>
    <p>With automatic mode enabled, qualifying jobs move from discovery to a validated job-specific resume and then to the application queue. You can review any resume, but individual approval is optional in automatic mode.</p>
    <section className="panel"><h2>Two computers, one queue</h2>
      <p>Windows collects jobs on the saved 12-hour schedule. You can request a search and review its results from either computer or the hosted dashboard.</p>
      <p>The selected application computer opens employer forms in its dedicated browser, reuses saved answers and verifies the exact tailored PDF before submission. Check the status menu for the current application computer and whether its browser is online.</p>
      <p>Only an employer confirmation marks a job Applied. A completed resume, uploaded file or final button click does not establish submission.</p>
    </section>
    <section className="panel"><h2>When one job needs attention</h2><ol>
      <li><strong>Sign-in or CAPTCHA:</strong> complete it in the existing employer tab on the selected application computer. Keep that tab open, then resume the same parked attempt.</li>
      <li><strong>Missing information:</strong> answer the factual question in the application report. Choose Save for future applications only when the answer is reusable. Job-specific commitments remain scoped to that employer.</li>
      <li><strong>Technical issue:</strong> after the failed step is repaired, resume that attempt with the same verified resume.</li>
      <li><strong>Submission unconfirmed:</strong> check the employer receipt or existing application status. Do not start another application; a retry could create a duplicate.</li>
    </ol><p>Other eligible jobs continue while this one waits. Enter passwords and verification codes only on the employer website.</p></section>
    <section className="panel"><h2>Stay in control</h2><p>Pause automatic mode in Settings to revoke automatic submission authorization. You can cancel queued work before submission starts. Manual mode still lets you approve an exact resume and authorize one application.</p><p>Jobs that fail the saved pay, location, full-time or factual experience requirements stay out of automatic applications. Unsupported qualifications are never invented to increase keyword coverage.</p><Link href="/settings">Open settings →</Link></section>
    <details className="panel"><summary>Optional manual tools</summary>
      <p>You can download the job-specific PDF and apply directly, or use your preferred autofill helper. Replace any default resume with the correct job-specific file and verify the employer’s attachment before submitting. Record the actual employer confirmation afterward.</p>
      <p>The optional AiadApply Assistant lives in <code>extensions/application-assistant</code> inside this project. It previews recognized fields and a selected resume packet; it does not submit applications. A packet stays tied to its original resume version.</p>
    </details>
    <Link href="/applications">Back to applications →</Link>
  </div>;
}
