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

Every future export follows the [resume content and layout rules](docs/resume-export-rules.md),
including substantive evidence-backed tailoring, aligned bullet continuations,
and single-line Skills rows. Failed final checks block acceptance.
The standing editable-draft preference is also recorded in [AGENTS.md](AGENTS.md)
for future coding sessions and embedded in the runtime prompt and export checks.
MATLAB is an example of the general rule, not a skill automatically added to all jobs.

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
Greenhouse, Lever, Ashby, SmartRecruiters, and RTX Workday feeds. It targets application
support, technical support, IT operations, systems support, and software
integrations using evidence from the protected base resume. Defaults are Seal
Beach 90740, a maximum 30-mile radius, full-time, and $60,000/year
(approximately $28.85/hour at 2,080 hours/year). Staffing employers are included;
postings explicitly marked temporary, contract, or part-time are excluded.
Remote roles are off by default and can be enabled in Preferences.

- The running local worker checks the discovery schedule every 15 minutes and
  refreshes every six hours by default, including while the browser is closed.
  The computer and local app/worker must remain running. Today and Discover also
  check for due searches; manual refresh has a one-minute cooldown.
- Automatic tailoring is optional and off by default. Preferences exposes a daily
  limit (default two) and minimum score (default 80). Only recently verified,
  dated openings with no fit cautions qualify; automatic submission is not implemented.
- Local discovery defaults to postings within 21 days; separate first-found
  filters and an unknown-date option preserve that distinction. Employer feeds
  usually do not expose applicant counts, so competition remains unknown.
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
run starts with one structured Codex call. Validation and final rendered coverage
can trigger bounded corrections (up to three quality attempts with two plan calls
per attempt); the run report records actual calls and token usage.

Local Codex calls allow up to 15 minutes by default so a correction pass can
finish on slower machines. Set `AIADAPPLY_CODEX_TIMEOUT_SECONDS` to a value from
60 through 1800 seconds when a different bound is needed.

Tailoring is pinned to `gpt-6-astra` with `high` reasoning by default so Discover,
Capture, Mac, and Windows produce consistent results without inheriting a changing
interactive Codex selection. Override these defaults with `AIADAPPLY_CODEX_MODEL`
and `AIADAPPLY_CODEX_REASONING_EFFORT` when intentionally evaluating another model.

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
- Important supported job terms are placed in relevant experience prose. Posting
  technologies without project evidence remain review gaps, not invented Loavenly
  implementations. Plausible future extensions belong in Stretch Lab.
- Explicitly negative phrases such as `not a traditional help desk role` are
  classified as exclusions instead of target keywords.
- Unrelated physical technologies remain outside the draft. Software and data
  technologies stay in their evidenced employer, project or Skills context.
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
Outputs prefer `~/Library/CloudStorage/OneDrive-Personal/Downloads/Resume_Builder/OUTPUT_RESUMES`
on macOS when OneDrive is installed, and OneDrive Downloads on Windows. Otherwise
they use local Downloads. `AIADAPPLY_BASE_RESUME` sets the base document path. Every successful tailor also copies its
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

All new tailoring runs use evidence-based wording. Rewrite relevant existing bullets
substantively while preserving real systems, project purpose and outcomes. Where
Loavenly overlaps with the role, lightly reframe one or two existing project bullets
instead of freezing the whole section or rewriting every bullet. Do not
force every posting technology into Loavenly: technical plausibility alone is not
proof of implementation. Unsupported tools remain gaps; proposed extensions stay
in Stretch Lab. Skills-only knowledge does not become an employer/project claim.
Historical aggressive drafts retain their warnings and files; Tailor again creates
a new version under the current policy. The old `aggressive_draft=True` engine flag
is reserved for explicit historical/audit compatibility, not normal product paths.
See [resume export rules](docs/resume-export-rules.md).

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
parse gate, information retention below 90%, missing required project technologies,
unflagged or out-of-scope draft additions, and known unnatural wording patterns.
Evidence-only historical runs additionally retain the strict base-skill audit.


### Fast terminal capture and RTX referrals

Copy the complete posting, then run from this repository:

```bash
bash scripts/queue-job.sh --clipboard
# Or queue several saved descriptions without sending them through chat:
bash scripts/queue-job.sh --paste-file ~/Downloads/job-one.txt --paste-file ~/Downloads/job-two.txt
# Capture without using the model:
bash scripts/queue-job.sh --clipboard --save-only
```

The app and worker must be running (`bash scripts/start-local.sh`). Queueing parses,
deduplicates and saves locally; only the worker's tailoring step uses Codex. Identical
pastes reuse the existing application. For another version, open that application
and use **Tailor again**. Every direct `aiadapply draft` output uses a unique directory
so previous drafts stay intact. Python commands outside the wrapper can use
`PYTHONPATH=packages/resume-engine/src uv run aiadapply ...`.

Discover supports selecting up to ten jobs and saving or tailoring the batch. Filters and
search are retained in the Discover URL, including the selected RTX scope. Search
matches skills and description text as well as titles, employers and cities.
Cards expose a short employer qualification excerpt. Required experience and
clearance are assessed separately from preferred qualifications; one shorter skill
requirement cannot cancel a longer independent experience requirement.

The direct-source registry includes HNTB and TravisMathew Workday boards. Only
verified employer hosts are fetched, posting dates are not inferred from relative
labels, and location-filtered refreshes do not close older saved worksites. A source
being available does not imply it currently has suitable openings.

The separate **Raytheon / RTX referrals** tab only shows known California posting
dates within 21 calendar days. It starts with the Seal Beach radius filter; uncheck
it for statewide options. Select roles and copy the referral list with requisition
IDs and official links. No message is sent. Citizenship is confirmed and no active
clearance is recorded in discovery preferences; existing-clearance requirements,
embedded/hardware gaps, GPA requests and lower-pay alternative routes stay visible.
RTX includes Raytheon, Collins and Pratt postings with the business unit labeled.

Tailoring uses supported technologies in their actual context. Loavenly remains a
food-bank operations project rather than a place to insert every posting tool.
Unsupported technologies stay in review gaps or clearly proposed Stretch Lab ideas.
Earlier hypothetical project drafts retain their original files and a review warning.
The review distinguishes raw bullet edits from substantive sentence rewrites while
preserving the bullet count and one-page layout. Model evidence output is sparse;
failed runs retain measured usage in failure-report.json.

The integration choices and dated verification record are in
[the October 2 upgrade report](docs/verification-2026-10-02-upgrade.md) and the
[entry-level and neutral-layout verification](docs/verification-2026-10-02-entry-neutral.md), followed by the
[broad-tailoring and real-job verification](docs/verification-2026-10-02-broad-tailoring.md).

The workspace uses neutral charcoal surfaces with purple accents. Discover keeps
filters compact and supports **Save selected** / **Tailor selected**. RTX prioritizes
support/IT and entry-level adjacent routes; experienced software-engineering roles
are excluded. California remote roles can be included separately from commuting
options. Requirements and clearance checks take precedence over keyword overlap.

## Apply with free Simplify or AiadApply Assistant

Each application now has an **Apply** tab:

1. Review its selected resume version, download the PDF, and choose **Use this reviewed resume**.
2. Open the employer application and run free Simplify Copilot. Replace its default
   resume attachment with the reviewed AiadApply PDF, then check the filename.
3. Review and submit yourself. Record the employer's confirmation in AiadApply;
   this saves the reviewed version reference and schedules the normal follow-up.

The **Answer kit** stores a reusable application profile in the workspace. Existing
browser-only answers can be imported explicitly. Contact fields can be used for
filling; screening, authorization, salary, clearance and relocation remain copy-only.
Concurrent profile edits are detected instead of silently overwriting another tab.
Workspace backups include this profile.

For an optional local helper, load `extensions/application-assistant` as an unpacked
extension at `chrome://extensions`. The app's `/apply-help` page has setup steps.
Choose **Prepare autofill packet** after reviewing a resume and saving contact details.
On the employer form, import the packet into the extension, confirm the job, preview,
and fill. It uses temporary active-tab access and Chrome session storage; no hosted
service, paid API, background website access, or Simplify account connection is needed.
The packet is private and contains a hash-checked PDF, job identity, version and
contact data. It expires after 72 hours. Clear it from the extension when finished.

The helper fills recognized empty contact text inputs and one unambiguous PDF upload.
It preserves existing answers and asks separately before replacing an existing resume.
Repeated fields, reference contact details, custom controls, cross-origin frames,
login/CAPTCHA screens and screening questions need manual handling or Simplify.
It never submits. Unsupported forms fail visibly instead of guessing. Uploaded PDFs
may trigger the employer's normal file processing; check the resulting attachment.
A downloaded DOCX edited later is a different document: attach that edited file manually.

No general Simplify candidate API was found in its public help documentation. The
integration is an explicit browser handoff. Greenhouse and Lever submission APIs
require employer-issued credentials, so the app does not pretend to submit through them.

## Moving to another device (October 7, 2026)

Pull the latest `main` from `https://github.com/brian-aiad/Aiad_Apply.git`
(the former aiadapplyV2 URL redirects there). Read `AGENTS.md`, the latest entries
in `HANDOFF.txt`, and `docs/application-automation.md` before continuing development.

Transfer these privately, outside Git:
- `apps/web/.env`: actual shared DATABASE_URL, DIRECT_URL, WORKER_SECRET and
  optional isolated test database connections. Preserve the shared database; do
  not reset/seed/restore into it. `.env.example` contains placeholders only.
- `.runtime/application-onboarding.json`: private additional saved answers. Most
  profile/settings/application records already sync through the shared database,
  but this worker input is local and must be copied separately.
- The current DOCX selected by AIADAPPLY_BASE_RESUME (or its existing OneDrive
  sync). Update AIADAPPLY_BASE_RESUME, AIADAPPLY_OUTPUT_ROOT and
  AIADAPPLY_USED_RESUME_ROOT to paths on the new machine; do not retain Mac paths
  on Windows. Historical generated files can be downloaded from the database.

Install Node.js 22, uv/Python, Google Chrome, LibreOffice for PDF export, and Codex
CLI. Sign into Codex on the new device with the existing subscription; no paid
model API key is required. Use the setup instructions above, `uv sync --extra dev`
and `npm ci` in apps/web. Browser/plugin connections may need sign-in on the new
device. Do not copy Codex auth tokens into the repository.

Do not transfer node_modules, .venv, .next, PID/lock files, worker identity, pending
claims/outboxes or the whole .runtime directory. Only one application browser
worker should be active for this workspace: finish any live application before
stopping the old one with `bash scripts/application-worker.sh stop`. Start the
new worker only after configuration and authentication are ready.

Native Windows: the PowerShell launcher supports dashboard and tailoring. The
new application browser worker currently uses Unix fcntl locking and a shell
launcher; native Windows auto-apply is not yet supported or verified. Do not
assume WSL is fully tested. Mac auto-start/LaunchAgent setup is machine-specific.

Latest outcome: IT Systems Engineer and Product Operations Specialist, Air Defense
C2 have employer-confirmed submissions. Product Support Engineer job5238763007 is
unavailable (404); its finished tailored v2 is saved, but it was NOT submitted.
