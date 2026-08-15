import { CaptureForm } from "@/components/capture-form";

export default function CapturePage() {
  return (
    <div className="content">
      <div className="eyebrow">New application</div>
      <h1 className="page-title">Capture a job</h1>
      <p className="page-copy">
        Paste the page as-is. The system separates the actual posting from LinkedIn
        navigation, company marketing, applicant statistics, and scanner noise.
      </p>
      <CaptureForm />
    </div>
  );
}
