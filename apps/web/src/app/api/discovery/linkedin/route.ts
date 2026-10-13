import { NextResponse } from "next/server";
import { z } from "zod";
import { captureLinkedInOpenSearch, scanLinkedIn, openLinkedInBrowser, linkedInSession, configureLinkedIn, configureLinkedInSearch, importLinkedInPaste } from "@/lib/discovery/linkedin";
import { crossOriginMutation } from "@/lib/web-url";
export const runtime = "nodejs";
export const maxDuration = 600;
const schema = z.object({ action: z.enum(["open", "scan", "status", "pause", "resume", "import", "save-search", "capture-open-search"]), window: z.enum(["day", "week", "both"]).default("both"), searchUrl: z.string().max(4000).optional(), oneJob: z.string().regex(/^\d+$/).optional(), text: z.string().min(300).max(60000).optional(), sourceUrl: z.string().url().max(2000).optional(), applyUrl: z.string().url().max(2000).optional() });
export async function POST(request: Request) {
  if (crossOriginMutation(request)) return NextResponse.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  const body = await request.text();
  if (body.length > 70000) return NextResponse.json({ error: "Paste only this job's details (up to 60,000 characters)." }, { status: 413 });
  let parsed; try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const input = schema.safeParse(parsed);
  if (!input.success) return NextResponse.json({ error: "Check the action, job URL and pasted description." }, { status: 400 });
  try {
    const data = input.data;
    if (data.action === "capture-open-search") return NextResponse.json(await captureLinkedInOpenSearch());
    if (data.action === "save-search") {
      if (data.searchUrl === undefined) return NextResponse.json({ error: "Provide your LinkedIn job-search URL." }, { status: 400 });
      try { return NextResponse.json(await configureLinkedInSearch(data.searchUrl)); }
      catch { return NextResponse.json({ error: "Could not save this search. Use the full LinkedIn jobs/search or jobs/search-results URL with keywords." }, { status: 400 }); }
    }
    if (data.action === "import") {
      if (!data.text || !data.sourceUrl) return NextResponse.json({ error: "Paste the selected job and its LinkedIn URL." }, { status: 400 });
      return NextResponse.json(await importLinkedInPaste({ text: data.text, sourceUrl: data.sourceUrl, applyUrl: data.applyUrl }));
    }
    if (data.action === "pause" || data.action === "resume") return NextResponse.json(await configureLinkedIn(data.action === "resume"));
    if (data.action === "status") return NextResponse.json(await linkedInSession());
    return NextResponse.json(data.action === "open" ? await openLinkedInBrowser() : await scanLinkedIn(data.window, true, data.oneJob));
  } catch (error) {
    const identityError = error instanceof Error && error.message.startsWith("Job identity, company, title");
    return NextResponse.json({ error: input.data.action === "import" ? (identityError ? error.message : "This job could not be imported. Check its selected job details and employer URL, then retry.") : input.data.action === "capture-open-search" ? "Could not capture the open search. On this Mac, open your LinkedIn search in Chrome and allow macOS Automation access. Saved jobs are retained." : "This action could not finish. Saved jobs are retained; check LinkedIn status." }, { status: input.data.action === "import" ? 422 : 503 });
  }
}
