# Aiad_Apply

Resume tailoring and application tracking for Brian Aiad.

This is the retained V2 implementation, renamed to **Aiad_Apply**. The canonical
repository is `https://github.com/brian-aiad/Aiad_Apply`. The new terminal command
is `aiadapply`; `aiadapplyv2` remains a compatibility alias. The internal
`aiadapply_v2` Python module is unchanged.

The system accepts a noisy LinkedIn, Simplify, or employer-page paste, extracts the real role,
tailors the finalized base resume, exports a validated one-page DOCX/PDF, and
records every keyword decision and exact paragraph change in a private-purpose
application dashboard.

## Daily Use

Existing hosted dashboard: https://aiadapply-web.vercel.app (local changes are not
live there until deployed). The Mac and Windows localhost dashboards now use the
same verified Supabase database; the Vercel deployment is separate and must use
that same configuration to show the same records.

Start the localhost dashboard and its tailoring worker:

```powershell
.\scripts\start-local.ps1
```

On macOS:

```bash
bash scripts/start-local.sh
```

For everyday use, you can instead double-click `Start AiadApply.command` on
macOS or `Start AiadApply.cmd` on Windows. Matching Stop launchers are included
in the repository root. The command-line scripts remain available for readable
diagnostics when setup needs attention.

The launcher opens `http://127.0.0.1:3000`. Use **Capture job** to paste a
posting, optionally add or edit its URL, and either save it for later or queue
the tailored draft immediately.

Capture now previews the extracted role, requirements, documented skill overlap,
evidence gaps, and a factor-by-factor Apply recommendation before saving. Company,
role, location, workplace, and employment extraction can be corrected in place;
the original paste and fingerprint remain intact. The recommendation is stored
with the application for later review. This preliminary screening does not create
an application or call the tailoring model. Resume review highlights individual
changed phrases, and pressing `/` on Applications focuses its search field.

The dashboard now guides each record through **Capture → Tailor → Review → Apply**:

- Search, filter, and sort Applications by status or evidence-backed coverage.
- Use the review guide to jump between posting details, exact resume changes,
  keyword decisions, Stretch Lab, and downloadable files.
- Store private notes and an optional follow-up reminder on each application.
- Marking an application Applied automatically schedules a follow-up seven days later
  unless a reminder already exists; the delay is configurable in Settings.
- Change the daily goal and timezone from Settings; Today uses those preferences
  immediately.
- The top-right health indicator verifies the database, protected base resume,
  and a fresh local-worker heartbeat instead of displaying a hard-coded online
  state.

Coverage is not an ATS guarantee or interview probability. It reports how much
of a posting can be supported by evidence already present in the protected
candidate record. A specialized role can correctly have low coverage while its
review-only Stretch Lab proposes honest ways to close the gap.

### Discover and daily accountability

**Today** prioritizes due follow-ups, ready applications, resume review, failed
runs, saved jobs, active tailoring, and curated openings. It shows actual daily
submissions against your adjustable goal, a Monday–Sunday ledger, your streak,
and follow-ups due. Saving or tailoring a job does not count as applying.

**Discover** checks 15 curated employer/staffing boards through public
Greenhouse, Lever, Ashby, and SmartRecruiters feeds. It targets application
support, technical support, IT operations, systems support, and software
integrations using evidence from the protected base resume. Defaults are Seal
Beach 90740, a maximum 30-mile radius, full-time, and $60,000/year
(approximately $28.85/hour at 2,080 hours/year). Staffing employers are included;
postings explicitly marked temporary, contract, or part-time are excluded.
Remote roles are off by default and can be enabled in Preferences.

- Opening Today or Discover initiates a check if the last search is at least
  20 hours old. Refresh openings runs a manual check with a one-minute cooldown.
  This is not a background scheduler: no searches run while the app is closed.
- Today/this-week filters mean first discovered by this workspace, not a guessed
  employer posting date. The feed also shows its last verification time.
- Distances are approximate city-centre radius measurements, not driving miles
  or verified street addresses. Check the worksite before approving.
- Missing salary/full-time information, clearance, seniority, and specialist
  requirements appear under **Needs closer look**, never as confirmed matches.
  Matching is a screening aid, not a determination that you meet every requirement.
- **Approve & save** adds a normal captured application. **Approve & tailor**
  queues the existing validated tailoring engine. Neither submits an application.
- Duplicate approvals are transaction-locked. Partial/failed source checks retain
  earlier results and disclose the issue instead of pretending coverage is complete.
- The local government, university, healthcare, and additional staffing directory
  links are clearly manual sources; they are not claimed as automated feeds.

The curated source registry is `apps/web/src/lib/discovery/sources.ts`; this is
not an exhaustive search of the web. The compact discovery evidence file is tied
by a regression-tested SHA-256 to `Brian_Aiad_BASE.format.json`. Refresh that
evidence when updating the base inspection; the tailoring engine itself always
uses the protected resume and candidate profile.

### Windows, Mac, and saved resumes

Open a job and choose **Permanently delete job** under Application details. Type
`DELETE` to confirm. This hard-deletes the posting, application, notes, all runs,
decisions, changes, events, database artifact bytes, and linked Discover record
from the shared database. It does not retain a deleted-job history or recycle bin.
Cloud artifacts are removed through the Supabase Storage API before deleting the
database rows; devices deleting older cloud-backed jobs need the server-only
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. Failed cloud deletion
keeps the database job for retry (some cloud objects may already have been removed).
Active RUNNING tailoring must finish first; queued runs can be deleted.

The initiating device also removes exact hash-verified files in its configured
output folder and matching USED_RESUME PDFs, protecting files still referenced by
another job. Other computers' local output folders, user-added files, manual
downloads, old exported backups, and database-provider recovery backups cannot be
erased by this action. A deleted posting may be rediscovered from its employer's
public feed later; no blacklist/tombstone is retained. Refresh another device's
dashboard to see the deletion. The protected base resume is never deleted.

**Git transfers code, not pasted descriptions, application records, or generated
resume history.** Those records live in the configured PostgreSQL database.
On September 14, 2026, Windows and Mac were verified against the same secured
Supabase database: 9 jobs/applications, 18 tailoring runs, and 90 artifacts with
90 size/hash-verified database file copies. Both devices' own workers and
status/notes synchronization passed verification. These are migration-baseline
counts, not fixed limits. Refresh the other dashboard after saving a change.
Settings reports the configured storage mode and portable file count.

Each successful worker result stores size/hash-verified artifact bytes in the
database as well as retaining the existing local/optional Supabase paths. The
download route can serve those bytes on another computer connected to that same
database. All 90 baseline artifact downloads were verified on both computers. Older
tailoring runs can now be selected from an application's Resume versions section.

The existing Mac and Windows installations use the **same secured hosted
PostgreSQL database**. For a new installation, transfer the private shared
configuration outside Git and preserve its own resume/output paths. Never import
a local workspace into this populated shared database using the empty-destination
restore command below. Avoid two local databases if you expect automatic sync.

For a manual transfer, download the private workspace backup in Settings. Keep
this JSON outside Git: it contains your resume files, pasted descriptions, notes,
and application history. On an **empty, configured destination database**, from
`apps/web`, run:

```bash
npm run db:push
npm run backup:restore -- --file /path/to/aiadapply-backup.json
npm run backup:restore -- --file /path/to/aiadapply-backup.json --apply
```

Use a Windows path on Windows. The first restore command validates without writing;
`--apply` imports transactionally and refuses to overwrite existing jobs or
discoveries. It is a one-time transfer, not a merge/synchronization mechanism.
Interrupted runs are cancelled on restore and can be restarted deliberately.

Existing installations get the two additive tables automatically through
`npm run dev`. For a hosted release, run `npm run db:improvements` against the
intended database before releasing the build. This migration does not drop or
rewrite existing application tables. To backfill older locally available files:

```bash
npm run backup:artifacts
```

The backup format excludes worker secrets and database credentials. It does not
back up your `.env`, protected base resume, or Python dependencies; configure the
destination installation separately. Database file copies improve portability,
but an off-device backup is still needed to survive loss of a local database.

For a bounded LinkedIn review session, open the isolated browser profile:

```powershell
.\scripts\start-linkedin-review.ps1
Set-Location apps\web
npm run linkedin:review -- --limit 8
```

On macOS:

```bash
bash scripts/start-linkedin-review.sh
cd apps/web
npm run linkedin:review -- --limit 8
```

The dedicated profile is stored under `.runtime/`, separately from your normal
Chrome profile. Sign into LinkedIn in that window if prompted.

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

Local Codex calls allow up to 15 minutes by default so a correction pass can
finish on slower machines. Set `AIADAPPLY_CODEX_TIMEOUT_SECONDS` to a value from
60 through 1800 seconds when a different bound is needed.

The hosted dashboard is protected by `AIADAPPLY_PASSWORD` using HTTP Basic
authentication; the optional username defaults to `brian`.

Use this command when finished:

```powershell
.\scripts\stop-local.ps1
```

On macOS, stop both services with `bash scripts/stop-local.sh`.

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
- Every run also produces a review-only Stretch Lab with evidence questions,
  qualification gaps, and proposed gap-closing projects. Stretch items are never
  inserted into the application-ready DOCX/PDF unless they are later completed or
  confirmed in the candidate profile.
- Important job terms may be inserted when direct or defensibly transferable
  evidence exists.
- Explicitly negative phrases such as `not a traditional help desk role` are
  classified as exclusions instead of target keywords.
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
- Resume DOCX/PDF filenames include the candidate, company, and role, for example
  `Brian_Aiad_Resume_Raytheon_RF_Microwave_Antenna_Electrical_Engineer_I_Onsite`.

## Pipeline

```text
Raw LinkedIn/Simplify/employer-page paste
-> source-region parsing and keyword grading
-> target-role profile
-> DOCX-derived evidence graph
-> BGE in-memory semantic retrieval
-> structured Codex review and rewrite
-> context-aware keyword exclusions and review-only Stretch Lab
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

Python 3.13, [uv](https://docs.astral.sh/uv/), and Node.js 22 are required. The
repository includes `.python-version` and `.nvmrc`; `uv sync --extra dev` selects
the tested Python release, while `nvm install && nvm use` selects the tested Node
release. Codex must be installed and logged in. LibreOffice is the supported
renderer on both Windows and macOS.

The macOS launcher also repairs the inherited Finder hidden flag found on some
copied `.venv` directories, which otherwise makes Python 3.13 skip editable installs.

The canonical base resume is `data/resumes/Brian_Aiad_BASE.docx`. Keep that
document factual and role-neutral; every tailored resume is derived from it.
Outputs default to `~/Downloads/Resume_Builder/OUTPUT_RESUMES` on macOS and the
equivalent Downloads folder on Windows. Every successful tailor also copies its
PDF into `Resume_Builder/USED_RESUME/YYYY-MM-DD` while retaining the complete
per-job output folder. Repeat runs never overwrite a different PDF. Set
`AIADAPPLY_OUTPUT_ROOT` to override the packet location or
`AIADAPPLY_USED_RESUME_ROOT` to override the PDF library independently.

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
Brian_Aiad_Resume_<Company>_<Role>.docx
Brian_Aiad_Resume_<Company>_<Role>.pdf
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

Playwright deletes and recreates its fixture records, so `npm run test:e2e`
requires `AIADAPPLY_E2E_DATABASE_URL` pointing to an isolated disposable database
or PostgreSQL schema. It intentionally refuses to use the normal dashboard database.

Audit a set of completed real-job stress runs:

```powershell
uv run python scripts\audit-tailoring-corpus.py <run-dir> <run-dir> ...
```

The corpus audit rejects multi-page results, DOCX files above the 2.5 MB ATS
parse gate, lost base skills, information retention below 90%, unsupported or
weak keyword leakage, and known unnatural wording patterns.
