import { CaptureForm } from "@/components/capture-form";

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ sourceUrl?: string }> }) {
  const params = await searchParams;
  return (
    <div className="content">
      <div className="eyebrow">New application</div>
      <h1 className="page-title">Capture a job</h1>
      <p className="page-copy">
        Paste the page as-is. The system separates the actual posting from LinkedIn
        navigation, company marketing, applicant statistics, and scanner noise.
      </p>
      <details className="terminal-shortcut"><summary>Prefer pasting in your terminal?</summary><p>Copy the posting, then run <code>bash scripts/queue-job.sh --clipboard</code> from this project. The worker tailors it while you collect the next job. Repeat <code>--paste-file path.txt</code> to queue saved postings together. Existing captures are reused.</p><p>Capture and queueing use no model tokens. Resume generation uses your configured Codex session.</p></details>
      <CaptureForm initialSourceUrl={params.sourceUrl ?? ""} />
    </div>
  );
}
