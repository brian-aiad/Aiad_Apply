# AiadApply — full project and continuation handoff

**Start here on Windows:** [October 13 Windows continuation](WINDOWS_CONTINUATION.md).
It records the latest 25-card assisted capture, three completed Review resumes,
device-local prerequisites and remaining Windows/LinkedIn limits. Earlier Git and
zero-import statements below are historical; automated LinkedIn remains blocked,
while assisted imports and real tailoring have succeeded.

**Latest implementation checkpoint:** [October 13 LinkedIn hardening and verification](linkedin-verification-2026-10-13.md).
Read it before the historical implementation snapshot below. Queue backpressure,
cross-source linking, assisted import, diagnostics, responsive UI and collector
guards have since been completed and tested locally. Live LinkedIn extraction
is still blocked by HTTP 429; no successful live import is claimed.

Updated October 13, 2026, America/Los_Angeles. Prepared from the current code,
existing project documentation, the conversation, Git state, and a read-only
runtime/database check at approximately 10:34 UTC / 3:34 a.m. Pacific.

This is the main continuation document for a new developer, Codex session, or
device. It records the product intent, latest decisions, implementation map,
historical work, verification evidence, and remaining work. It is a consolidated
handoff, not a claim that every requested capability is complete or a transcript
of every past terminal action. Historical results are labeled separately from
checks performed while writing this document.

## 1. Read this first

Brian wants a practical job-search system that finds roles he can realistically
land, prepares strong job-specific resumes, and handles the application after he
approves the exact resume. Repeatedly asking for already-confirmed facts, using
the wrong PDF, presenting unsuitable jobs, and claiming submission without a
receipt are the main failures to avoid.

The current priority is **LinkedIn Premium → Discover → automatic tailoring →
Brian's resume approval → Auto apply → verified application report**. LinkedIn
collection is implemented but has not passed a successful live import test. The
last live scan encountered HTTP 429, imported zero jobs, and now has a 24-hour
cooldown. Do not tell Brian that the whole LinkedIn pipeline already works.

Read these alongside this file:

- [AGENTS.md](../AGENTS.md): standing instructions and latest policy corrections.
- [Resume export rules](resume-export-rules.md): required before modifying the
  tailoring engine, prompts, review UI, validation, or exports.
- [Application automation](application-automation.md): attempt states, attachment
  verification, email handling, recovery, and implementation history.
- [Discovery improvements](discovery-search-improvements.md): search research,
  strict constraints, source expansion, and LinkedIn checkpoint.
- [Earlier session handoff](session-handoff.md): batch history and October 9–12 work.
- [README](../README.md): setup, commands, portability, and product overview.

Older documentation contains superseded statements. In particular, references
to a local-only database, 15 employer boards, exclusively app-open discovery,
unknown salaries being ordinary recommendations, and Skills-only treatment of
all common tools are not the current policy. Use current code, saved settings,
AGENTS.md, and the dated corrections here when reconciling them.

## 2. Repository and worktree checkpoint

| Item | Current checkpoint |
| --- | --- |
| Product name | AiadApply / Aiad_Apply |
| Canonical repository | `https://github.com/brian-aiad/Aiad_Apply` |
| Current directory | `/Users/brianaiad/Desktop/aiadapplyV2` |
| Branch | `main` |
| Local HEAD | `c77c03712fbc4055c2a963ddcb56ea32ab040935` |
| HEAD subject | Improve application recovery and add scoped email-code handling |
| Internal Python package | `aiadapply_v2` |
| Preferred CLI | `aiadapply`; `aiadapplyv2` remains an alias |
| Local dashboard | `http://127.0.0.1:3000` |
| Known hosted dashboard | `https://aiadapply-web.vercel.app`; deployment parity not verified |

**There are substantial uncommitted changes and untracked source files.** Git
alone does not yet contain all the work described here. This handoff operation
does not commit, push, or deploy anything. Do not reset or overwrite the worktree.
Some Gmail/OCR edits came from another terminal and must be preserved.

Changed areas include application browser driver/worker/reasoner/email handling,
application restriction enforcement, discovery matching/providers/sources/UI,
tailoring quality and technology checks, worker scheduling, tests, and docs.
New untracked files include the LinkedIn collector/service/routes/panel/tests,
discovery search-plan module, application restriction module/tests, final-result
normalization, and Gmail screenshot OCR helper. `git diff --stat` omits untracked
files; inspect `git status --short` as well before any cross-device handoff.

Recent committed milestones, newest first:

1. `c77c037` — application recovery and scoped email-code handling.
2. `185e61f` — canonical repository/device-handoff documentation.
3. `2c07839` — verified application automation and tailoring workflow.
4. `d8bc7e7` — tailoring workflow and application tools.
5. `623b846` — retained V2 renamed Aiad_Apply.

## 3. Brian's intended product

The desired daily experience is:

1. Search relevant local employer boards and LinkedIn, including new jobs daily.
2. Read actual duties and qualifications, not just titles or shared keywords.
3. Reject jobs outside salary, commute, employment-type, or realistic experience
   constraints before filling Discover with them.
4. Save full descriptions and correct application destinations; deduplicate.
5. Tailor suitable new jobs automatically within the agreed limits.
6. Show the finished one-page resume, changes, coverage, and gaps for approval.
7. Brian approves that exact resume and presses Auto apply for that application.
8. Fill the employer form using saved facts and the approved resume, upload the
   exact PDF, handle supported routine steps, and submit.
9. Report the employer's actual confirmation, questions answered, and unresolved
   issues. An attempted application is not a successful application.
10. Keep application history, follow-ups, and portable documents across devices.

Brian wants minimal supervision and thoughtful recovery. That means fixing
technical problems rather than repeatedly asking him for website option wording.
It does not mean inventing unknown facts, silently changing a resume, repeating
an uncertain submission, or promising compatibility with every ATS.

### Decisions that must persist

- Free tiers and existing Codex/LinkedIn subscriptions only. No new paid API,
  hosted browser, trial, metered fallback, or subscription without authorization.
- The latest workflow requires approval of every job-specific resume before
  submission. Older instructions allowing unreviewed future submissions are
  superseded.
- RTX and Collins are referral-only. Do not submit them, even on an old approval.
- LinkedIn automatic tailoring: **up to 10 new jobs per Pacific calendar day**.
- LinkedIn outreach: **find contacts and draft only**; do not send messages.
- Correct employer-facing resume filename, without version/hash prefixes.
- Reuse saved facts and confirmations. Ask only for consequential missing facts,
  conflicts, credentials that have not been supplied, or unusual commitments.
- Do not force every technology into Loavenly or manufacture accomplishments.
- Preserve historical resumes and audit evidence; changed policy applies to new
  runs rather than silently rewriting old artifacts.

## 4. Current live snapshot

The following was checked while preparing this handoff; it is time-sensitive:

| Check | Result |
| --- | --- |
| `/api/health` | `ready` |
| Database reachable | Yes |
| Protected base resume available | Yes |
| Tailoring worker heartbeat | Healthy; one worker |
| Active tailoring runs | Zero |
| Storage mode | Hosted database; object storage not configured |
| Jobs/applications | 21 |
| Application status counts | 10 READY, 2 REVIEW, 1 CAPTURED, 8 APPLIED |
| Tailoring run counts | 49 SUCCEEDED, 28 FAILED |
| Stored LinkedIn discovery postings | Zero |
| LinkedIn last scan | Blocked, six checks, zero imports/queues |

The eight APPLIED records are database status counts, not a fresh receipt audit
of all eight employers. Similarly, failed-run counts include historical attempts
and are not a diagnosis of current engine quality. Application-browser health
has a separate heartbeat; the main health endpoint alone does not certify it.

Saved settings checked directly:

```json
{
  "discovery:preferences": {
    "minimumSalary": 60000,
    "radiusMiles": 30,
    "includeRemote": false,
    "usCitizen": true,
    "clearance": "none"
  },
  "discovery:automation": {
    "scheduledSearch": true,
    "intervalHours": 6,
    "autoTailor": true,
    "dailyLimit": 2,
    "minimumScore": 80
  },
  "discovery:linkedin:config": {
    "enabled": true,
    "autoTailor": true,
    "dailyLimit": 10,
    "outreach": "drafts-only"
  }
}
```

General employer-board automation and LinkedIn automation currently have separate
daily limits. Do not accidentally interpret the LinkedIn ten/day answer as a
blanket increase of every other queue.

## 5. Architecture and storage

| Component | Purpose / location |
| --- | --- |
| Next.js 16 / React 19 / TypeScript | Dashboard, APIs, review, Discover, Apply; `apps/web` |
| Prisma / PostgreSQL | Durable jobs, applications, runs, settings, events, artifacts |
| Python 3.13 | Resume engine and tailoring worker; `packages/resume-engine` |
| Codex CLI | Structured tailoring and fallback form decisions using existing subscription |
| LibreOffice | DOCX-to-PDF rendering on macOS and Windows |
| PyMuPDF | Final rendered text/geometry/page validation |
| Playwright / Chrome | Local application forms and separate LinkedIn discovery browser |
| Local embedding model | BGE small English via sentence-transformers; in-memory evidence retrieval |

The database is hosted PostgreSQL, with project history documenting the shared
Supabase installation. Mac and Windows must use the same intended database to
share history. Git transfers code; it does not transfer application records,
browser sessions, OAuth credentials, or private runtime files.

Core Prisma models include `Job`, `Application`, `TailoringRun`, `KeywordDecision`,
`ResumeChange`, `Artifact`, portable artifact backup records, `ApplicationEvent`,
`DiscoveryPosting`, and `Setting`. See `apps/web/prisma/schema.prisma` for exact
schema names and relations. Application automation attempts are represented in
application automation events; do not assume a dedicated ATS attempt table.

Successful worker outputs retain local files and store hash/size-verified portable
artifact bytes in the database. Optional Supabase object storage is supported but
the current health check reports it unconfigured. Downloads can use verified
database copies across devices rather than trusting a path on another computer.

The hosted frontend cannot replace the local Python/LibreOffice/Chrome workers.
Routes that launch local scripts need a local server environment; do not assume
the Vercel deployment can open Brian's desktop Chrome.

## 6. Tailoring: behavior, policy, and internals

### Intake and pipeline

Capture accepts noisy LinkedIn, Simplify, or employer-page pastes. It extracts
company/title/location/work arrangement, real responsibilities, required and
preferred qualifications, and posting keywords while discarding navigation,
recommended jobs, applicant statistics, and irrelevant company/footer content.
Capture preview can be corrected before saving and reports fit/evidence gaps.

The engine then:

1. Loads the active protected DOCX and candidate profile.
2. Renders the base to establish real formatting and line budgets.
3. Builds evidence by semantic paragraph IDs and relevant duty/technology scope.
4. Retrieves relevant evidence; direct facts outrank embedding similarity.
5. Requests a structured rewrite plan from Codex.
6. Checks facts, contextual technology coverage, and meaningful role fit.
7. Replaces allowed OOXML text nodes while preserving template structure.
8. Renders and measures the result, shortening targeted text only as needed.
9. Rechecks final rendered coverage and protected facts after layout repair.
10. Writes DOCX/PDF and audit reports; failed final checks block acceptance.

Default tailoring model is `gpt-6-astra`, reasoning `high`. Configuration lives
in engine config/reasoner code and `AIADAPPLY_CODEX_MODEL` /
`AIADAPPLY_CODEX_REASONING_EFFORT`. The user's interactive Codex model selection
does not automatically change the engine. The configured subscription allowance
still applies; there is no authorized paid API fallback.

### Latest content rules

- Rewrite a relevant bullet when it adds meaningful supported fit. Preserve
  strong existing wording where changes would only be cosmetic.
- No minimum project-edit count, arbitrary rewrite quota, or synonym shuffling.
- Preserve real duties, named systems, employers, dates, titles, metrics, outcomes,
  education, certifications, contact details, sections, entries, and bullet counts.
- Loavenly is an actual food-bank operations project. Relevant intake, inventory,
  access, troubleshooting, and reporting can be emphasized. Do not transform it
  into an unrelated enterprise product to match a posting.
- Everyday Office/Excel/Google productivity tools and common AI assistants are
  confirmed knowledge. Tableau is authorized for ordinary reporting assistance.
- Brian explicitly confirmed ordinary common development use, including Python,
  Go/Rust, APIs/REST APIs, webhooks, databases, Git, Linux, routine AWS and CI/CD.
  This is saved candidate confirmation, not an inference from having a CS degree.
- For a requested established tool, weave it naturally into a matching documented
  duty when one exists; Skills-only placement is insufficient in that situation.
- The policy is open-ended. New common languages, frameworks, databases, testing,
  command-line, and routine build/deployment tools are assessed by category and
  requested depth rather than rejected because they are absent from a whitelist.
- Version-specific `technology_assessments` identify relevant duty IDs and usage
  boundaries. Validate them; do not promote generated assessments into historical
  candidate facts.
- Explicit rejected experience wins. Specialized systems such as Salesforce,
  advanced infrastructure implementations, CAD, migrations, particular AWS
  services, new metrics, or wholesale project stack changes still need evidence.

Examples of appropriate action alignment: API/webhook troubleshooting in support,
Python scripting in an existing automation duty, CI/CD in a real build/test/deploy
duty, and routine AWS support/deployment wording where the existing duty fits.
Permission to use AWS does not establish a specific service or a hosting migration.

### Layout and review

- Exactly one page; preserve template fonts, sizes, indentation, numbering,
  protected headings, dates, hyperlinks, and section geometry.
- Bullet continuation alignment is measured, with a 0.75-point maximum deviation.
- Every Skills category must remain on one line.
- No clipped/overlapping text, orphaned tools, silent font shrinking, or loss of
  real evidence to make room for keywords.
- Coverage must survive shorter variants and final render, not merely appear in
  the model's proposed draft.
- Final optimized DOCX/PDF is revalidated after embedded-font optimization.
- Review shows original/final paragraphs and new literal job keywords in purple.
- Technology coverage includes a quick plain-language explanation through
  version-specific `technology_summaries`. Definitions are UI metadata, not extra
  exported resume text or evidence of candidate experience.
- Stretch Lab contains version-specific, clearly proposed gap-closing ideas and
  questions. It is not exported as completed work.

Typical outputs are the clean candidate/company/role DOCX and PDF,
`transformation_report.json`, `transformation_report.md`, `character_audit.json`,
and the job description. Downloads verify bytes against artifact hashes.

### Tailoring code map and recent fixes

Under `packages/resume-engine/src/aiadapply_v2/`:

- `pipeline.py`: orchestration, correction passes, output acceptance.
- `reasoning/codex.py`: structured model invocation and instructions.
- `evidence/established_technologies.py`: confirmed/common technology scope.
- `planning/coverage.py`, `quality.py`, `priorities.py`: placement, meaningful
  tailoring, and keyword priority checks.
- `validation/resume.py`: protected facts and document constraints.
- `layout/renderer.py`: rendering and measurement.
- `tracking.py`: worker claims, progress/results, and discovery scheduling.

Recent edits bound structured-plan attempts, pass rejected drafts back as editing
context rather than evidence, recognize administration/provisioning as technical
actions, normalize excluded technology terms, preserve monitoring coverage, and
allow R in matching ordinary ETL/data-investigation contexts. Historical output
is not silently regenerated. See associated Python tests and earlier verification
documents for exact cases.

## 7. Discover: realistic local roles

Brian's objective is to land a job soon, not maximize the number of high-paying
engineering titles in a list. Favor documented application support, IT operations,
help desk/desktop support, systems support, technical/product support, integrations,
and appropriate business-application/operations roles.

The current strict constraints are confirmed starting base pay of at least
**$60,000/year**, full-time, and an identifiable worksite **within 30 miles of
Seal Beach**. Remote is currently disabled. Salary conversion is explicit when
hourly pay is supplied. Distances are approximate city-center straight-line
distances, not verified driving distances.

Unknown pay, pay starting below the floor, unknown location, ambiguous multi-office
location, and unconfirmed full-time status are excluded from recommendations.
This supersedes the previous looser treatment under “Needs closer look.” The
previous 15-mile shortcut was removed; old `near=1` links must not change the
saved 30-mile preference.

Rank primary responsibilities and required experience above shared tool names.
Exclude unsupported people-management and major profession changes, including
specialized software, CAD, embedded, factory-test, and similar roles despite
overlapping keywords. L3 ownership and specialist-domain/tool gaps lower ranking.
Do not read a background-check reference as a security-clearance requirement.
Required and preferred qualifications must be parsed separately.

An important exception added during LinkedIn work: **Platform Engineer II is not
automatically unsuitable** if the actual role is junior digital-workplace support,
access administration, guided scripting/API work, and end-user service automation.
Pacific Life's supplied 0–4-year description fits that narrower interpretation.
Advanced infrastructure/platform engineering remains outside the exception.

### Sources and scheduling

- Public structured employer feeds: Greenhouse, Lever, Ashby, SmartRecruiters,
  and selected Workday boards.
- Latest recorded full employer scan: all 35 registered sources responded.
- Recently added: Ware Malcomb, Trace3, Sony Interactive Entertainment, USC,
  and Motorola Solutions.
- Six role-family LinkedIn/Indeed search links provide broader manual coverage.
- CSULB CareerLINK, MemorialCare, Hoag IT, City of Seal Beach and other directories
  are manual sources, not silently claimed as scraped feeds.
- Laserfiche returned 403 and remains manual.
- Adzuna and USAJOBS integrations exist but credentials were not connected at the
  previous verified checkpoint. Do not claim those searches are running.
- The local worker checks schedules every 15 minutes; general discovery's saved
  refresh interval is six hours. The computer and services must stay awake.
- General automatic tailoring is currently enabled, two/day, minimum score 80.
  Its safeguards include freshness and a bounded pending queue.
- Failed/partial feed checks retain existing records and disclose source failure.
- Save/tailor routes re-evaluate current constraints server-side.

Main files: `apps/web/src/lib/discovery/{service,matching,requirements,types,
sources,providers,workday,external-providers,search-plan,freshness,
automation-policy,normalization,view-state}.ts`, `candidate-evidence.json`, and
`apps/web/src/components/discovery-board.tsx`. The compact evidence file is tied
to the protected base inspection and must be refreshed when the base changes.

## 8. LinkedIn Premium: exact current objective

Brian supplied his own Premium search screenshots and descriptions. He wants the
system to use that account's actual visible results, not just generate search
links or depend exclusively on a limited employer registry.

The intended LinkedIn feature should:

1. Open the dedicated signed-in browser and inspect search results every day.
2. Cover both past 24 hours and past seven days across relevant role families,
   rather than only one exact “Application Support Engineer” query.
3. Inspect individual job details and collect the full description, identity,
   selected worksite, pay, posted date, workplace/type, and employer apply link.
4. Record observed Premium “top applicant” and high/medium/low signals and
   prioritize suitable jobs using them. Do not confuse Simplify keyword scores
   with LinkedIn Premium assessments.
5. Independently screen actual requirements against Brian's background, salary,
   and commute. A “top applicant” badge does not override a hard mismatch.
6. Retain new jobs in a dedicated LinkedIn Discover tab and show progress/results.
7. Automatically tailor up to ten qualifying new jobs per Pacific day, preserving
   eligible deferred jobs and never tailoring the same known job twice.
8. Put resumes into the usual review/approval workflow; never silently submit
   newly discovered jobs.
9. Identify relevant visible recruiters/alumni and draft concise job-specific
   outreach. Brian explicitly chose drafts only.

### Supplied priority examples

| Role | User-supplied details | Correct treatment |
| --- | --- | --- |
| Radiometer — Application Support Consultant | LinkedIn `4458415638`; Brea onsite, full-time; $85–95K; 1+ years IT/application/service-desk support; incidents, access, monitoring, documentation; travel up to 10%; Dynamics/Rillion optional | First candidate to inspect; use the actual description and employer link; do not turn optional enterprise tools into invented experience |
| The Mortgage Office — Support Engineer | LinkedIn `4475174359`; Huntington Beach hybrid; visible top-applicant signal | First candidate to inspect, but full duties and confirmed salary still need extraction; a badge alone cannot qualify it |
| Pacific Life — Platform Engineer II | Newport Beach; $113,490–138,710; 0–4 years; digital workplace/access/guided automation rather than advanced platform ownership | Existing application/requisition `R17313`; link to it instead of generating a duplicate |

Pacific Life existing application ID is
`fc0f0e63-b817-4605-8dc9-0efd5d78b9c3`; the earlier handoff records accepted run
`1bea3758-8b09-4b28-9d61-df64b3d3e60b`. Verify the current database before acting;
the prior application was blocked on Workday account access.

Other pasted examples included JPMorganChase Technology Support II, Kahana Feld
Enterprise Applications Specialist, Convergint, MemorialCare, SchoolsFirst and
City of Anaheim. The list also contained remote/out-of-radius/senior roles. Do
not import every supplied result as a qualified match or treat a LinkedIn 35-mile
search envelope as permission to exceed the app's 30-mile maximum.

### Implemented LinkedIn components

| File | Responsibility |
| --- | --- |
| `apps/web/scripts/linkedin-discovery.mjs` | CDP browser collection; search/detail extraction; Premium/contact signals; access-block detection |
| `apps/web/src/lib/discovery/linkedin-normalization.ts` | Canonical LinkedIn identity, selected location/pay normalization, safe employer URL, cross-source identity |
| `apps/web/src/lib/discovery/linkedin.ts` | Scan lease, cadence, ingestion, metadata, eligibility, deduplication, daily queue, cooldown |
| `apps/web/src/lib/discovery/service.ts` | Discovery snapshots, final save/tailor checks, duplicate linking, transaction-protected LinkedIn cap |
| `apps/web/src/app/api/discovery/linkedin/route.ts` | Manual browser-open and day/week/both scan actions |
| `apps/web/src/app/api/worker/linkedin/route.ts` | Secret-authorized scheduled scans |
| `apps/web/src/components/linkedin-discovery-panel.tsx` | Controls, counts, status, cooldown behavior |
| `apps/web/src/components/discovery-board.tsx` | LinkedIn tab, signals, filtered jobs and outreach drafts |
| `packages/resume-engine/src/aiadapply_v2/tracking.py` | Calls the scheduled LinkedIn endpoint |
| `scripts/start-linkedin-review.sh` / `.ps1` | Starts isolated Chrome with CDP port 9222 |

Runtime browser profile: `.runtime/chrome-linkedin-profile`. It is separate from
the application browser profile. Collector does not send messages, fill employer
forms, or submit applications; it may open the external Apply destination to
identify its URL. Easy Apply is not handled as an external employer application.

Current bounds after hardening: six grouped support queries, first-page results,
service limit 12 detail candidates per period, 16 navigation calls per collector
invocation, 110 seconds, and 2.5-second spacing. Hardcoded production job seeds
were removed. See the latest checkpoint for full tested behavior and limitations.

Persistence uses existing `DiscoveryPosting` plus `Setting` records, without a
new LinkedIn schema migration:

- `discovery:linkedin:config`: enabled/autoTailor/dailyLimit/outreach.
- `discovery:linkedin:state`: lease identity, status, timestamps, counters,
  diagnostics, optional queue errors and retry time.
- `discovery:linkedin:job:<posting-id>`: employer URL, Premium signals, visible
  contacts, observed timestamp, and content hash.
- Normalized source is `linkedin:premium`; raw collector labels are normalized.

The service serializes scan claims with PostgreSQL advisory lock `9074032`;
approval/creation uses the existing `9074031` lock. Scan leases expire after 15
minutes. Scheduled cycles are at least 24 hours apart; manual scans normally
have a one-minute cooldown and respect rate-limit retry times.

Queueing considers all stored eligible fresh LinkedIn postings, not only rows
collected in the current scan. It requires an employer destination, posting age
within seven days, observation within 48 hours, no dismissal/existing application,
no hard exclusion, and score at least 65. Ordinary work-schedule notices can
remain visible; substantive qualification gaps prevent automatic queueing.

Top-applicant/high signals sort eligible candidates ahead of score ordering.
Daily counting uses Pacific midnight and the LinkedIn `discovery_approved` events
that created tailoring applications. The ten-job ceiling is also checked within
the application-creation transaction. A duplicate is linked and does not consume
a new-tailor count. Individual queue errors are retained rather than stopping
all remaining candidates.

Deduplication checks LinkedIn IDs, normalized company/title/location, and canonical
employer URLs while removing tracking parameters and preserving requisition
identity. It runs at ingestion and again before application creation. The current
cross-source comparison is bounded to 2,000 job records; replace with indexed
canonical identities if the dataset grows.

### Current blocker and evidence

Last live scan started `2026-10-13T01:20:39.301Z` and ended
`2026-10-13T01:25:59.664Z` (October 12 evening Pacific). The browser's actual
document was `chrome-error://chromewebdata` with HTTP 429, even though the CDP tab
list still displayed the requested LinkedIn URL. The original collector treated
that as missing content. It now detects error documents/429 and stops immediately.

The persisted cooldown expires `2026-10-14T01:26:39.081Z`, approximately
**October 13 at 6:26 p.m. Pacific**. Cooldown expiry is not proof access recovered.
Do not clear it to hammer LinkedIn. The currently verified result is six checks,
zero imported jobs, zero queued resumes, and zero applications submitted by this
scan. The error condition was reproduced; successful live extraction was not.

Recorded verification from the implementation session: 61 focused tests passed,
TypeScript and targeted ESLint passed, and the local browser showed the LinkedIn
tab and honest blocked status. These tests verify logic/fixtures, not a successful
authenticated production scrape or completed LinkedIn-to-application pipeline.

### Next LinkedIn work, in order

1. After the cooldown, inspect the actual dedicated browser document once. Confirm
   login and normal content before attempting another bounded collection.
2. Test a single requested job first; verify title/company, full description,
   selected worksite, pay, dates, employer URL, and any Premium signal against UI.
3. Capture an anonymized/appropriate fixture for actual layout extraction bugs;
   improve selectors rather than repeatedly running six searches blind.
4. Verify real ingestion and queued tailoring end to end. Radiometer is a useful
   first candidate; Mortgage Office needs confirmed salary. Confirm Pacific Life
   links to its existing application and is not re-tailored.
5. Exercise daily-cap/concurrent creation and deferred-queue behavior against an
   isolated database. Unit/type checks alone do not prove all transaction races.
6. Verify day/week runs, stale dates, duplicate aliases, missing salary, session
   expiry, 429, and partial results with explicit expected outcomes.
7. Improve user-visible diagnostics: `queueErrors` are stored but not fully surfaced
   by the panel; completion copy currently implies queueing even if autoTailor is
   disabled. Generic catches can still obscure non-browser failures.
8. Reconcile UI “qualified” with auto-queue treatment of schedule-only notices.
   Ensure old LinkedIn rows cannot look fresh in alternative date views.
9. Review queue capacity across the general two/day and LinkedIn ten/day paths.
   LinkedIn currently uses the save/tailor path rather than the general automatic
   path with its four-pending-run guard.
10. Test the new collector and scheduler on Windows. Existing Windows launchers
    are not proof this newly added feature has passed a Windows live test.
11. Verify contact extraction and drafts with real accessible contacts. The first
    version uses visible contacts and a generic draft; it is not a recruiter
    search agent or automatic personalized outreach campaign.

Do not mark the feature fully verified until a real permitted scan imports the
correct job and produces a correctly bound tailored review artifact.

## 9. Auto apply: authorization and execution

Brian's exact-resume approval authorizes filling and submitting one employer
application. Approval binds application ID, run ID, PDF artifact ID/hash, and
destination URL. A new resume or destination requires new approval.

The worker uses a dedicated persistent Chrome profile and local Playwright. It
prefers native “autofill with resume” where useful, then verifies imported fields
and fills supported gaps. Simplify remains an optional helper; its default PDF
must never substitute for the approved attachment.

The application reasoner defaults to `gpt-6-astra`, high reasoning, with
`AIADAPPLY_APPLICATION_MODEL` as the model override. It uses ephemeral structured
`codex exec` decisions and deliberately ignores arbitrary user config/rules.
Deterministic contact filling and validated batches reduce routine model calls.

### Attempt states

| State | Meaning |
| --- | --- |
| QUEUED | Exact approval saved, waiting for worker; not submitted |
| RUNNING | Claimed and working on the form |
| SUBMITTING | Durable boundary recorded before the final submit action |
| SUBMITTED | New explicit employer receipt observed and recorded |
| BLOCKED | Unresolved issue before verified completion |
| UNKNOWN | Submit may have happened, but no reliable receipt; do not auto-retry |
| CANCELED | Authorization withdrawn before submission |

Upload verification and final attachment verification are distinct. The worker
downloads the approved artifact, hashes it, uploads under the clean resume name,
and verifies browser file bytes. Before submission it requires the corresponding
fresh widget/attachment evidence; filename alone is insufficient. It never uses
another job's PDF or a base resume fallback.

The server rechecks authorization and restrictions before browser work and final
submission. A durable local journal/outbox preserves the submit boundary and
result. Recovery republishes results without replaying employer submission.
An uncertain prior attempt is checked for a late receipt; uncertainty is not
permission to click Submit again. There is a separate explicit user-authorized
unconfirmed retry flow with preserved prior evidence.

### Implemented reliability improvements

- OS-held worker lock, durable installation identity and recoverable claim token.
- Structured decision failure categories and bounded output/telemetry handling.
- Exact-label routine contact filling from saved profile.
- Batched dropdown choices with fresh context/ref resolution and readback.
- React open-dropdown handling and searchable exact-option selection.
- Dismiss unrelated open dropdowns before handling the next question.
- Greenhouse grouped checkbox validation without weakening standalone consent.
- Scoped resume upload widgets, actual File-byte capture even after React replaces
  an input, and final attachment checks.
- Transient navigation/detached-frame snapshot retries without replaying clicks.
- Progress monitoring and bounded recovery for unchanged form states.
- Technical dropdown failures classified as automation issues, not candidate facts.
- Receipt detection before another model call and late-receipt observation.
- Final result normalization clears stale blockers only after confirmed success.
- Public Greenhouse requisition preflight detects an unavailable exact job before
  browser/model work; network failures are not falsely treated as closed jobs.
- Source-aware discovery answers and prior-application history normalization.
- RTX/Collins server-side hold even for previously approved attempts.

Main code: `apps/web/scripts/application-browser/{worker,driver,reasoner,form-plan,
posting-check,progress-watch,journal,verification,final-result}.mjs`,
`apps/web/src/lib/application-{automation,automation-store,restrictions,handoff,
profile}.ts`, and application/worker API routes.

Runtime data: `.runtime/application-attempts/<attempt-id>`,
`.runtime/application-worker.log`, and `.runtime/application-browser-profile`.
Keep these private. Reports contain answered questions and unresolved issues;
receipt screenshots and approved PDF identity are the evidence for success.

### Efficiency evidence and limits

An earlier real Product Operations Specialist, Air Defense C2 attempt was recorded
as using 26 model decisions, many for single clicks. A later isolated batched form
test used two model decisions, 41,947 input tokens and 335 output tokens. Those
are different scenarios, not a controlled savings percentage.

Per-attempt `efficiency.json` and per-step `decisions/N.usage.json` retain model,
numeric input/cached/output token counts, duration, and outcome when available.
Missing usage is null, not invented zero. Broader ATS adapters and compact model
context remain future optimization work. No universal-ATS guarantee is justified.

## 10. Email verification and connected tools

Brian authorizes reading application-related verification emails and receipts
from his connected application mailbox. His intention is to retrieve the fresh
code for the current application, enter it in the matching form, and finish the
approved application without repeatedly asking him to copy it.

The local worker's implemented email route is separate read-only Gmail OAuth:

1. Use the existing approved attempt, employer, recipient, and prompt timestamp.
2. Search Gmail and locally validate exact recipient/employer/fresh receive time.
3. Select the newest unambiguous matching message and preserve code capitalization.
4. Prefer message text. If needed, render matched content/safe inline images into
   a temporary local tab and use an in-memory screenshot with local OCR.
5. Use macOS Vision OCR, with local Tesseract fallback; no paid OCR/model service.
6. Enter an unambiguous code into the identified current field/action.
7. Observe a new employer receipt before reporting success.

The current implementation is bounded: ambiguous/missing/rejected/expired codes
remain unresolved; it does not guess old codes or automatically restart an
uncertain application. Verification codes are not reusable candidate answers.
They stay out of persistent profile, answer history, journals and logs.

**Current device check:** the default credential file
`.runtime/application-gmail-oauth.json` is absent. The presence of Gmail plugins
or an ordinary signed-in Gmail tab does not establish worker OAuth access. No
mailbox-access test was performed while writing this handoff. This is a concrete
setup item before claiming unattended email handling works here.

Setup command, after obtaining an authorized Desktop OAuth client:

```sh
cd apps/web
GOOGLE_OAUTH_CLIENT_FILE=/private/path/desktop-oauth-client.json npm run gmail:connect
```

OAuth uses `gmail.readonly`; secrets stay in owner-only private runtime storage.
Read `docs/application-automation.md` for setup and token-expiry details. Never
paste client secrets, refresh tokens, passwords, codes, or browser cookies into
this handoff or Git.

Installed ChatGPT/Codex plugins are not automatically exposed to a noninteractive
worker. The worker's reasoner uses `--ignore-user-config`; previous capability
inspection did not find Gmail available there. The optional locally installed
Playwright browser-inspector MCP is read-only diagnostic tooling, not a replacement
for the guarded application worker. Do not assume a new device has either tool.

## 11. Candidate memory and unresolved facts

Authoritative detailed sources are the saved `application-profile` setting,
`data/profile/Brian_Aiad_PROFILE.json`, the protected base, and ignored
`.runtime/application-onboarding.json`. The onboarding file exists on this Mac.
This shareable handoff deliberately does not reproduce full address, birth date,
demographic answers, account credentials, or private email contents.

Confirmed reusable policy facts include U.S. citizenship and U.S. work
authorization, no sponsorship need, immediate availability, no current or past
security clearance, stated eligibility to obtain one, no military service, and
no criminal record. No prior interviews was confirmed as of October 9, 2026;
update interview history after actual interviews rather than treating it as an
eternal default. Citizenship eligibility and holding a clearance are different.

Brian authorized sign-in using credentials he supplies; no account passwords
were supplied in this conversation. Do not make up credentials or put them in
model prompts. A credential storage/login workflow remains incomplete.

Previous applications, previous employment, previous interviews, military service,
civilian government employment, criminal background and references are distinct
questions. Do not answer all of them “No” based on “new to the market.” Actual
application history now exists and overrides older first-application answers.
Reference availability and civilian government employment were unresolved at the
prior batch checkpoint. Compensation should use the actual job/pay period and
saved facts; required numeric answers without a basis need clarification.

Employer-specific consents or confirmed answers stay scoped to their application
unless explicitly reusable. Match questions to saved facts, preserve valid existing
answers, and stop on meaningful conflicts instead of silently replacing them.

## 12. Application history checkpoint — not a fresh receipt audit

The private `.runtime/review-batch-summary.json` exists. Its October 8 checkpoint
records 12 Review records / 11 unique jobs: two submitted, seven blocked, two
unavailable, and one duplicate. Consult that report and current database/attempt
evidence before any action.

| Employer / role | Last documented outcome / next care |
| --- | --- |
| Relativity Space — Business Systems Analyst | Confirmed submitted with employer receipt and approved-PDF evidence; do not resubmit |
| Relativity Space — Factory Test Technical Specialist II | Confirmed submitted with receipt, screenshot and approved-PDF evidence; do not resubmit |
| Anduril — Product Operations Specialist, Air Defense C2 | Earlier automation docs record successful attempt `f6b37a41-f328-4012-83c3-efdbb8ea686f`; do not infer a new submission from discussion |
| Anduril — Counter Intrusion | Not confirmed at batch checkpoint; later clearance answer exists, but inspect current attempt and export-control selection |
| Anduril — original Product Support Engineer | Saved requisition `5238763007` unavailable; no substitute was chosen by the user |
| Vast — IS Support Specialist II | Approved version 6 PDF verified in attempts; email-code stage reached; no fresh receipt established by this handoff |
| Rocket Lab — Supervisor, IT Support | Blocked in batch; some later facts answered, reference/civilian-government facts remained separate; also review suitability under newer role filters |
| TravisMathew / Pacific Life / Techaxis | Last documented blockers involved account access; inspect latest status, do not retry blindly |
| RTX / Collins | Referral-only hold supersedes old approvals |
| Mendix | Original posting unavailable |

The conversation contains repeated questions about whether Anduril/Vast went
through. Screenshots of a filled form, attached PDF, or received code do not
settle that question. Use attempt-bound receipt evidence, not conversational
assumptions or the presence of an Applied badge alone.

## 13. Research and tooling decisions already made

The system deliberately keeps deterministic collection/filtering/form handling
in code and reserves Codex for meaningful tailoring and ambiguous decisions.
Repeated full-page AI reasoning for every click is slower and expensive in usage.

Prior research references, preserved for continuation rather than newly rechecked
in this documentation task:

- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp): browser
  inspection/automation tooling; CLI plus skills can reduce agent overhead.
- [Playwright authentication](https://playwright.dev/docs/auth),
  [actionability](https://playwright.dev/docs/actionability), and
  [uploads](https://playwright.dev/docs/input#upload-files): reusable session state,
  scoped control interaction, and file upload foundations.
- [Browser Use](https://github.com/browser-use/browser-use) and
  [Stagehand](https://github.com/browserbase/stagehand): useful open-source patterns;
  hosted browsers/model API examples can add costs. Neither replaces exact resume
  identity, approval, or receipt checks.
- [agent-browser](https://github.com/vercel-labs/agent-browser): compact/scoped
  observations worth benchmarking; not installed as a proven replacement here.
- [JobSpy](https://github.com/speedyapply/JobSpy): possible discovery supplement,
  not a submitter or a guarantee against rate limits.
- [Simplify Copilot](https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications):
  optional autofill helper. Its default resume needs checking.
- [Simplify Autopilot](https://help.simplify.jobs/help/articles/1784339-getting-started-with-autopilot):
  previous research identified a paid Simplify+ dependency; not selected.
- [O*NET support duties](https://www.onetonline.org/link/summary/15-1232.00) and
  [BLS support specialists](https://www.bls.gov/ooh/computer-and-information-technology/computer-support-specialists.htm):
  title/duty vocabulary, not individual interview probabilities.
- [LinkedIn top-applicant feature](https://www.linkedin.com/help/linkedin/answer/a548337/using-the-top-applicant-feature-to-apply-for-jobs?lang=en)
  and [automation restrictions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software?intendedLocale=en&lang=en-us):
  Premium signals do not guarantee fit or unrestricted automated access.

Some auto-apply repositories were inspected for patterns but had no detected
license at the time. No code was vendored from them. Recheck licenses before
copying third-party implementations. Do not add tools merely because they exist;
first identify the concrete capability missing from this project.

## 14. Running locally and moving to another device

Prerequisites: Node.js 22, Python 3.13, `uv`, LibreOffice, Chrome, and an installed
signed-in Codex CLI. Use the existing lockfiles. macOS and Windows launchers are
present; individual new features still need platform-specific verification.

```sh
# macOS: dashboard, tailoring worker, application worker
bash scripts/start-local.sh

# Application worker separately
bash scripts/application-worker.sh start
bash scripts/application-worker.sh stop

# Isolated LinkedIn browser
bash scripts/start-linkedin-review.sh

# Stop local services
bash scripts/stop-local.sh
```

Windows equivalents include `scripts/start-local.ps1`, `stop-local.ps1`, and
`start-linkedin-review.ps1`. Root Start/Stop double-click launchers also exist.
Starting only `npm run dev` does not by itself establish every local worker.

macOS login startup was prepared but **not enabled successfully**: the LaunchAgent
was denied access to this Desktop repository. A pending plist exists at
`.runtime/com.brianaiad.aiadapply.plist.pending`. See `docs/local-autostart.md`.
Running detached services now is not proof they will survive logout/reboot or
sleep. Resolve the repository-location/macOS-permission issue before promising
always-on operation. No paid hosting service was authorized as a substitute.

### Transfer checklist

1. Commit/push the intended code and untracked source files after reviewing the
   combined worktree; this task only writes documentation.
2. Clone the canonical repository on the new device.
3. Transfer required private configuration through a secure channel, outside Git.
4. Use the same intended hosted database; do not restore a backup over populated
   shared data or accidentally create an independent local history.
5. Install dependencies and renderer, authenticate Codex, and configure local paths.
6. Supply the protected base/profile and private onboarding needed for that device.
7. Re-establish browser sessions and Gmail OAuth there; do not assume plugins or
   Chrome cookies transferred with the repository.
8. Check database/base/worker health and download hash-verified existing artifacts.
9. Run a disposable/local fixture before submitting any real employer application.

Configuration names are in `apps/web/.env.example`: `DATABASE_URL`, `DIRECT_URL`,
`WORKER_SECRET`, dashboard authentication, model settings, and resume/output paths.
Supabase URL/service-role settings are needed for relevant optional storage
operations; service-role keys must remain server-only. Do not copy placeholder
example values into a live shared installation or expose real values in this file.

Workspace backup/export includes application data and portable artifacts, not
all local secrets, browser profiles, base files, or dependencies. Restore is for
an empty destination and is not a merge tool. Private `.runtime/checkpoints/`
snapshots mentioned in earlier handoffs are local recovery aids, not evidence of
a pushed cross-device backup.

## 15. Verification record and commands

Historical test results should stay attached to their scope:

- Prior application/tailoring checkpoint: 176 passed, three optional live-model
  tests skipped; not a certification of all later edits.
- October 12 broader employer discovery: 52 focused tests plus type/lint/browser
  checks; recorded 35/35 source scan success.
- Latest LinkedIn implementation checkpoint: 61 focused tests, TypeScript and
  targeted lint passed; UI inspected. Live LinkedIn import remained blocked.
- This handoff task: read-only health/settings/count/file/Git checks. No real
  application submission, browser scan, or full code test rerun was performed.

Useful checks from `apps/web`:

```sh
npm run typecheck
npm run test:unit
npx tsx --test tests/unit/linkedin-*.test.* tests/unit/discovery*.test.ts
```

From the repository root:

```sh
uv run aiadapply doctor
uv run pytest packages/resume-engine/tests
git diff --check
curl --fail http://127.0.0.1:3000/api/health
```

Use an isolated disposable database for tests that mutate application records;
`AIADAPPLY_E2E_DATABASE_URL` exists for this purpose. Do not run reset, unsafe push,
restore, seed, or live submission benchmarks against the shared production data.
No real job should be resubmitted merely to measure performance.

## 16. Outstanding priorities beyond LinkedIn

1. Establish and verify worker Gmail OAuth on this installation; default credential
   file is absent. Test scoped fresh-message handling without claiming success
   from the mere existence of a plugin or OCR code.
2. Finish secure supplied-credential sign-in/account recovery for blocked portals.
3. Audit actual pending application attempts and employer receipts before retries.
4. Expand ATS adapters with representative isolated fixtures; retain exact-PDF
   and submit-boundary checks through all changes.
5. Finish reliable local login startup and document awake/sleep limitations.
6. Reconcile older README/architecture statements with current runtime behavior.
7. Validate new code on Windows and hosted/local boundaries separately.
8. Review and commit the accumulated multi-terminal work before switching devices.
9. Improve reporting so “browser issue,” “missing fact,” “email unavailable,”
   “queue limit,” and “uncertain submission” remain distinct actionable outcomes.

## 17. Ready-to-use continuation prompt

> Continue AiadApply from `docs/FULL_PROJECT_HANDOFF.md`, `AGENTS.md`, and
> `docs/resume-export-rules.md`. Preserve the dirty worktree and other-terminal
> Gmail/OCR changes. Current priority is verifying LinkedIn Premium discovery:
> daily and weekly local support-role searches, strict $60k starting pay / 30-mile
> Seal Beach / full-time filters, Premium prioritization, full description and
> employer-link extraction, deduplication, up to ten automatic tailors/day, exact
> resume approval before Auto apply, and contact drafts only. The last live scan
> returned HTTP 429 and imported zero jobs; inspect the saved cooldown/session
> before another bounded test. Do not claim this feature is live-verified yet.
> Radiometer and Mortgage Office are initial candidates; Pacific Life already
> has an application and must not be duplicated. Check actual health and current
> evidence, reuse saved facts, keep services free, never submit RTX/Collins, and
> report only employer-confirmed submissions as successful.
