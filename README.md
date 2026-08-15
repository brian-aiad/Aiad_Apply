# aiadapplyV2

Resume tailoring and application tracking for Brian Aiad.

The system accepts a noisy LinkedIn, Simplify, or employer-page paste, extracts the real role,
tailors the finalized base resume, exports a validated one-page DOCX/PDF, and
records every keyword decision and exact paragraph change in a private-purpose
application dashboard.

## Daily Use

Hosted dashboard: https://aiadapply-web.vercel.app

Start the localhost dashboard and its tailoring worker:

```powershell
.\scripts\start-local.ps1
```

The launcher opens `http://127.0.0.1:3000`. Use **Capture job** to paste a
posting, optionally add or edit its URL, and either save it for later or queue
the tailored draft immediately.

For a bounded LinkedIn review session, open the isolated browser profile:

```powershell
.\scripts\start-linkedin-review.ps1
Set-Location apps\web
npm run linkedin:review -- --limit 8
```

To preserve a read-only review as dated local fixtures, pass a new directory.
The collector refuses to overwrite existing fixture files:

```powershell
npm run linkedin:review -- --job-ids 4453661445,4431436073 --limit 2 `
  --export-dir ..\..\data\fixtures\live_linkedin_20260813
```

Review mode is read-only. To capture and tailor only roles that clear the local
fit gate, use `--queue-qualified --max-tailors 3`. The command never submits a
job application. Browser collection and fit ranking do not call Codex; only
each role actually queued for resume tailoring uses the Codex review pipeline.
Normal capture, save, and status updates do not consume Codex usage. A tailoring
run normally makes one structured Codex call and makes one correction call only
when deterministic validation rejects the first plan.

The hosted dashboard is protected by `AIADAPPLY_PASSWORD` using HTTP Basic
authentication; the optional username defaults to `brian`.

Use this command when finished:

```powershell
.\scripts\stop-local.ps1
```

Terminal drafting remains available. A successful terminal draft is
automatically recorded in the same dashboard whenever its tracking endpoint is
reachable:

```powershell
uv run aiadapplyv2 draft --clipboard
```

Terminal drafts track the local dashboard by default. Use `--api-url` or
`AIADAPPLY_TRACKING_URL` only when intentionally targeting another deployment;
the unrelated `NEXTAUTH_URL` setting is never used for worker tracking.

## Product Policy

- There is one transformation system, not selectable safety modes.
- Important job terms may be inserted when direct or defensibly transferable
  evidence exists.
- Unsupported technologies and protocols are omitted from resume prose and
  remain visible as qualification gaps in the transformation report.
- Candidate-confirmed skills in `data/profile/Brian_Aiad_PROFILE.json` are durable
  evidence for future drafts.
- Existing skills are fused with role requirements instead of being replaced by
  scanner keywords.
- Simplify panels are hints; actual responsibilities and qualifications determine
  mandatory terms.
- Source skill rows are retained in full. Layout fallbacks may revert to the
  original paragraph, but cannot discard more than 10% of its evidence or remove
  named systems and protected operating context.
- Name, contact information, organizations, approved titles, dates, locations,
  education, certifications, numerical metrics, sections, entries, and bullet
  counts remain protected.
- The final output basename is always `Brian_Aiad_resume`.

## Pipeline

```text
Raw LinkedIn/Simplify/employer-page paste
-> source-region parsing and keyword grading
-> target-role profile
-> DOCX-derived evidence graph
-> BGE in-memory semantic retrieval
-> structured Codex review and rewrite
-> authenticated live progress events in the tracker
-> protected-content and metric validation
-> byte-preserving OOXML text-node replacement
-> LibreOffice PDF render
-> PyMuPDF paragraph, font, line, width, and anchor validation
-> targeted paragraph compression if needed
-> safe embedded-font removal with visual/document equivalence validation
-> DOCX, PDF, JSON report, and Markdown report
```

## Setup

Python 3.12+ and [uv](https://docs.astral.sh/uv/) are required. Codex must be
installed and logged in. LibreOffice is the supported renderer on both Windows
and macOS.

```powershell
uv sync --extra dev
uv run aiadapplyv2 doctor
```

Windows renderer path:

```text
C:\Program Files\LibreOffice\program\soffice.com
```

macOS renderer path:

```text
/Applications/LibreOffice.app/Contents/MacOS/soffice
```

The same locked environment is tested on `windows-latest` and `macos-latest`.
On macOS, use forward slashes in the command examples, for example:

```bash
uv run aiadapplyv2 transform \
  --paste-file data/fixtures/floqast_full.txt \
  --output-dir outputs/floqast
```

## Engine Commands

Or run `uv run aiadapplyv2 draft`, paste the complete page, and enter `::done`
on a new line. The command identifies the company and title, creates a dated
folder under `OUTPUT_RESUMES`, preserves the raw posting, and generates the
validated DOCX/PDF draft.

```powershell
uv run aiadapplyv2 inspect-base
uv run aiadapplyv2 inspect-format --output data\resumes\Brian_Aiad_BASE.format.json
uv run aiadapplyv2 parse --paste-file data\fixtures\floqast_full.txt
uv run aiadapplyv2 profile --paste-file data\fixtures\anduril_full.txt
uv run aiadapplyv2 transform `
  --paste-file data\fixtures\floqast_full.txt `
  --output-dir outputs\floqast
```

Successful transformation produces:

```text
Brian_Aiad_resume.docx
Brian_Aiad_resume.pdf
transformation_report.json
transformation_report.md
character_audit.json
```

## Verification

```powershell
uv run ruff format --check .
uv run ruff check .
uv run mypy packages\resume-engine\src
uv run pytest
Set-Location apps\web
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
```

Audit a set of completed real-job stress runs:

```powershell
uv run python scripts\audit-tailoring-corpus.py <run-dir> <run-dir> ...
```

The corpus audit rejects multi-page results, DOCX files above the 2.5 MB ATS
parse gate, lost base skills, information retention below 90%, unsupported or
weak keyword leakage, and known unnatural wording patterns.
