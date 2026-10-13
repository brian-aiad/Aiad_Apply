# LinkedIn workflow hardening — October 13, 2026

## Follow-up: Brian's specific search

Discover now supports a saved preferred LinkedIn search. Brian's previously
supplied Application Support Engineer search has been saved with `geoId=104234982`,
`distance=35`, `f_TPR=r604800` and `f_SAL=f_SA_id_226001:272015`. This is based on
the earlier full URL; the later screenshot alone cannot establish changed filters.
The LinkedIn panel has **Your preferred LinkedIn search** with an editable URL
and **Open saved search** link.

When configured, the collector uses that search instead of the generic role
queries. Keywords, geographic ID, salary/other `f_*` filters and explicit sorting
are preserved. Only the day/week date window changes; selected-job IDs,
pagination offsets and tracking parameters are removed. Results and ordering
can change on LinkedIn; saving a search does not freeze the screenshot's list.
The server's $60K / 30-mile / full-time constraints still apply independently.

Saving this URL did not start collection, reset the cooldown, approve a resume,
or submit an application. First-job inspection is still required before full
cycles. Existing LinkedIn access limitations remain. New tests cover URL safety,
filter retention, a complete offline saved-search collection, configuration
persistence without changing queue/access settings, and browser form behavior.

This checkpoint supersedes the implementation gaps in the earlier October 13
handoff. It does **not** supersede candidate facts, exact-resume approval,
referral holds, or the free-only policy. No commit, push, deployment, paid tool,
real employer submission, or historical application status change was performed.
Existing dirty work, including other-terminal Gmail/OCR changes, was preserved.

## Live status: externally blocked

**No successful live LinkedIn extraction has been established.** The saved scan
remains HTTP 429, zero imports, zero queued LinkedIn resumes, zero submissions.
Its cooldown remains `2026-10-14T01:26:39.081Z`, or October 13 at 6:26 PM Pacific.
The cooldown was not cleared or shortened.

At `2026-10-13T11:11:26.219Z`, the actual local Open browser action verified the
dedicated profile on port 9222 and inspected its existing document. It returned
`blocked / rate_limited`, one error document, **zero navigations**, and a 155ms
read-only session check. This proves local browser connection and detection,
not authenticated normal-page access. The selected collector installation is
now recorded by a non-secret hash of hostname and repository location.

The actual dashboard was inspected at 900px: it showed the saved 429, zero
imports, no successful scan, and the correct cooldown. A screenshot was visually
reviewed, then removed. No LinkedIn refresh/navigation was attempted this session.

## What changed

- Kept the existing Playwright/CDP collector, database models, resume engine,
  approval flow, and employer application worker. No extra browser/model daemon.
- Added zero-navigation session inspection, one-job mode, bounded request/time
  budgets, distinct access errors, collector locks and stale-process recovery.
- Both browser launchers open `about:blank`, validate that an existing port 9222
  belongs to the dedicated profile, and refuse port/profile conflicts. Windows
  searches Program Files, Program Files (x86), and LocalAppData Chrome locations.
- Removed hardcoded Radiometer/Mortgage Office seeds from production service
  scans. One-job validation remains explicit; test IDs remain in fixtures.
- Full daily cycles require a successful explicit one-job check first. Without
  that recorded extraction, scheduled collection makes no navigation requests.
  The one-job control and full scans both respect the existing cooldown.
- Strengthened selected-card extraction, bounded selector fallbacks, relative
  posting dates, scoped salary chips, external destination canonicalization,
  and exclusion of Simplify/recommended-job text from Premium signals.
- Added strict annual/hourly/monthly salary normalization, conflicting-period
  rejection, correct lower-bound flooring, provider requisition identity, and
  safe external URL handling. Unknown/ambiguous facts stay unresolved.
- Senior titles are assessed by actual duties and requirements; unsupported
  ownership, people management and specialist domains still block qualification.
- LinkedIn is excluded from the general employer-feed automatic tailoring path.
  Both paths share pending capacity while retaining distinct daily allowances.
- Deferred LinkedIn jobs are reconsidered from saved data on worker schedule
  checks and after tailoring completion; neither requires a LinkedIn reread.
- Cross-source duplicate protection works in both directions: a direct feed
  arriving after LinkedIn links the existing application as well.
- Discover returns compact descriptions plus requirements extracted from the
  full source. Server assessment and tailoring continue using full descriptions.
- Added a pasted-job fallback using the standard parser and screening rules,
  without contacting LinkedIn. Unknown identity is rejected rather than guessed.
- Fixed stale review E2E selectors after the existing full-paragraph UI change.
  Fixed four small Python lint findings without reformatting unrelated code.

## Search and efficiency

The collector has six grouped support-role queries, covering application/software,
production/systems, technical/product, desktop/IT/help desk, integration/
implementation, and business applications/digital workplace/platform support.
See `SUPPORT_QUERIES` in `apps/web/scripts/linkedin-discovery.mjs` for exact terms.

One scheduled cycle is due at most once per 24 hours. It contains past-day and
past-week windows, each using LinkedIn's 35-mile envelope and full-time filter.
The server still enforces the real 30-mile selected-worksite rule. Only the
selected collector device runs scheduled collection; all devices share a scan
lease. Manual scans respect active scans and cooldowns too.

Service calls cap each period at 12 detail candidates; collector calls default
to 16 navigations, a 110-second time budget, and 2.5-second navigation spacing.
Search identities are unioned before details. Known/dismissed/approved records
are skipped; even incomplete detail attempts are skipped in the overlapping
second window. Visible Top Applicant cards precede High cards at inspection.
These are ceilings, not measured live throughput.

Metrics now include search pages, distinct result IDs per collector window,
detail pages, skipped duplicate reads, navigation count, duration, imports,
linked duplicates, exclusions, queue outcomes and diagnostic stages. The service
unions observed numeric job IDs across both windows before reporting the cycle's
unique result count; it sums actual page attempts separately.

Discovery uses **zero model calls**. Normal tailoring still defaults to
`gpt-6-astra` with high reasoning. No paid fallback was added. No fresh live-model
tailor was run here, so there is no measured new token-saving claim.

## Eligibility, Premium and queue semantics

Hard constraints remain starting annual base >= $60,000, confirmed full-time,
identified worksite <=30 miles of Seal Beach, remote disabled. Hourly pay uses
2,080 hours/year; monthly pay uses 12 months. Unknown pay/type/location and
conflicting pay bands fail closed. Required active clearance, major profession
mismatch, unsupported specialist requirements and excessive ownership remain
blocking. A Premium badge cannot override these rules.

The collector recognizes visible Top Applicant wording and explicit High,
Medium and Low Match wording within LinkedIn's selected job context. Internal
representation is TOP_APPLICANT/HIGH/MEDIUM/LOW/NONE/UNKNOWN. Missing evidence is
UNKNOWN. Simplify keyword scores are not imported as LinkedIn signals. Fixture
recognition is verified; current live DOM coverage is not yet verified.

Automatic tailoring additionally requires a full description, employer
destination, real posting date <=7 days, observation <=48 hours, sufficient
documented fit, no substantive caution, and no dismissal/existing application.
Schedule-only notices do not incorrectly disqualify otherwise supported work.
Easy Apply is distinct and remains manual; it does not enter employer Auto Apply.

`approvePosting` holds the existing PostgreSQL transaction advisory lock while
checking the Pacific-day allowance and creating Job/Application/TailoringRun plus
the event. Maximum: ten new LinkedIn tailors/day. Shared pending/running capacity:
four. Duplicates return the existing application and consume no new slot;
failed transactions cannot consume an event. Deferred jobs remain saved.
After the first capacity/day rejection, the pump marks later candidates deferred
without repeatedly attempting the same full-queue transaction.

Priority uses comparable role-fit bands first, then Premium, score and freshness.
This is an evidence ranking, not a predicted hiring probability.

## Discover and outreach

The LinkedIn panel exposes pause/resume, Open browser, Check session, scan state,
attempt/success/retry times and an assisted pasted-job form. It distinguishes
last-scan queue counts from subsequent queue-pump activity. Expandable details
show bounded per-job queue errors, including historical scan errors, plus page
metrics. Full descriptions are not shipped merely to render every card.

Cards preserve employer URL, selected location, pay, Premium signal, source
windows, main fit/gaps, queue/deferred state and existing-application links.
Excluded and dismissed jobs remain inspectable. Existing application cards link
to the normal application screen rather than creating another resume.

Only named, relevant, visibly associated contacts with safe LinkedIn profile URLs
are retained. Job-context reason is shown. Short factual drafts are reviewable;
there is no send action. No message, connection request, guessed email, email
enrichment, or broad people search was performed.

## Existing Auto Apply guarantees

LinkedIn ingestion creates ordinary Job/Application/TailoringRun records and
passes the full correct posting into the existing engine. Exact approval still
binds application, run, artifact, PDF hash and employer destination. No LinkedIn
discovery action approves a PDF. Existing employer worker checks, actual uploaded
bytes/attachment proof, uncertain-submission non-retry and receipt-based Applied
transition remain authoritative. RTX/Collins server-side referral holds remain.

Fixture integration proves correct source description/destination in the normal
queued run. Existing resume-rendering, review, approval and browser regression
tests pass. **A newly imported live LinkedIn job has not yet completed a fresh
real-model resume → Review → approved Auto Apply chain**, because live ingestion
is blocked. Do not claim this end-to-end live acceptance criterion is passed.

## Fresh validation

Commands run from `apps/web` unless marked repository root. Mutating DB tests
used `AIADAPPLY_E2E_DATABASE_URL` with explicit isolation checks, serially.

| Command | Fresh result |
| --- | --- |
| `npm run test:unit` | 221 passed, zero failed |
| `npx tsx --test --test-concurrency=1 tests/integration/*.test.ts` | 36 passed, zero failed |
| `node --test tests/integration/application-browser.test.mjs` | 22 passed, three optional live-model tests skipped |
| `npx playwright test` | 18 passed; includes complete app regression and LinkedIn 0/5/25/100-result fixtures |
| `npx playwright test tests/e2e/linkedin.spec.ts` | Six passed after final spacing and first-inspection gate changes |
| `npm run build` | Passed as the fresh E2E production-build prerequisite, isolated `.next-e2e` output |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| Root: `uv run pytest` | 340 passed, one skipped; five dependency deprecation warnings |
| Root: `uv run ruff check .` | Passed after small import/exception fixes |
| Root: `uv run mypy packages/resume-engine/src` | Passed, 46 source files |
| Root: `PYTHONPATH=packages/resume-engine/src uv run aiadapply doctor` | Passed |
| Root: `git diff --check` | Passed |

The initial full E2E run failed one stale selector for a retired compact-diff
class. The corrected test verifies actual inserted/deleted review text; the full
rerun passed. Browser tests exercised 800/900/1000/1100px LinkedIn views and mobile,
plus the existing six-width whole-app suite. Synthetic HTML fixtures abort all
network requests; they are sanitized examples, not captures of a live LinkedIn
page obtained this session.

Concurrency tests prove ten/day, <=4 pending/running, duplicate zero-slot use,
deferred retention and next-day refill without browser recollection. Additional
tests cover employer-feed aliases, dismissal, old-date preservation, assisted
paste, disabled auto-tailoring, CSRF rejection and unsafe URLs. Optional model
tests were not enabled merely to create a green report.
The final added test confirms that a full cycle cannot start before a one-job
check, and manually requesting a single job cannot clear or shorten a cooldown.

## Acceptance evidence and remaining boundary

| Capability | Evidence |
| --- | --- |
| Open/reuse dedicated browser safely | Actual Mac launcher and API Open action passed; zero navigation |
| Identify existing blocked state | Actual existing 429 error document recognized |
| Normal signed-in page recognition | Offline fixture verified; live normal session currently unavailable |
| One full live job extraction | **Blocked by LinkedIn 429/cooldown** |
| Premium, selected job salary, employer destination | Offline DOM/normalization fixtures passed; live pending |
| Strict hard filters / realistic fit | Unit, database and UI fixtures passed |
| Existing/cross-source duplicates | Both ordering directions verified against isolated DB |
| Persist and show LinkedIn job | Isolated DB integration and browser fixtures passed |
| Queue normal tailoring with correct full posting | Isolated DB integration passed |
| Ten/day concurrency and shared backpressure | Competing creation tests passed |
| Deferred jobs survive/refill | Isolated DB tests passed |
| One-page render / Review / exact-PDF approval | Existing regression coverage passed; fresh live LinkedIn chain pending |
| Draft-only contacts | Browser fixtures passed, no send action |

## Tools, account safety and research

No tool was installed or vendor code imported. Existing Playwright handled the
demonstrated local inspection and fixture needs. Playwright MCP / agent-browser
were not added to runtime; there was no extraction blocker they could solve
while LinkedIn itself was rate-limiting. No performance comparison is claimed.

LinkedIn explicitly prohibits third-party scraping/automation:
[official restriction documentation](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software?lang=en).
Its Premium badge is a profile/job comparison signal, not a hiring guarantee:
[Top Applicant documentation](https://www.linkedin.com/help/linkedin/answer/a554236).
No stealth, proxy, alternate account, CAPTCHA solver, or access-control bypass
was added. A cooldown expiration is not proof that automated access is permitted.
If access remains restricted, retain the assisted paste/employer-feed workflow.

## Runtime, device portability and genuine limitations

Actual dashboard health was ready with hosted DB, base resume present, one
tailoring worker and zero active runs. The dedicated Chrome browser is running.
Normalized jobs, queue events and artifact records live in the shared database;
browser authentication, profile locks, credentials and local files do not.
Another device can review imported jobs without sharing Mac cookies.

Windows launcher paths/quoting/ownership checks were audited, not live-tested on
Windows. No PowerShell runtime was available here. macOS autostart remains
blocked by the existing Desktop privacy denial: both `getcwd` and loading the
repository script were denied to the LaunchAgent. A launcher outside Desktop
alone would not grant access to the repository it then executes. The repository
was not moved and OS permissions were not bypassed. Existing services run while
the Mac is awake; do not promise operation during sleep or after reboot.

The default worker Gmail OAuth file `.runtime/application-gmail-oauth.json`
remains absent. Email-code automation is not verified on this device. Existing
Gmail/OCR implementation was preserved; installed plugins are not proof of
worker mailbox access. Account-login and actual employer-specific portal limits
remain separate from LinkedIn discovery.

Current resource budgets can produce partial scans; incomplete pages retain
specific diagnostics. No fresh live throughput or per-tailor model usage was measured.
Some ATS links remain unavailable until the employer page is accessible. No
system can truthfully guarantee every external application always completes.

## Next safe continuation

1. Leave the current cooldown intact. Brian can use **Paste a LinkedIn job
   manually** now with content he can access normally, or use employer feeds.
2. After the cooldown, inspect normal access in the dedicated browser. Do not
   repeatedly refresh an error/restriction page. If required, Brian signs in there.
3. Only when permitted, use the service's explicit one-job option for a still-live
   known candidate. Compare full fields and destination against visible content;
   then confirm persisted Discover row and the normal queued run. Do not start a
   full cycle first and do not create another Pacific Life R17313 application.
4. Let that genuine qualifying run render, verify the actual one-page PDF and
   Review link. Brian approves that exact resume before any real Auto Apply.
5. If LinkedIn remains blocked, stop live attempts and report the access boundary.

An attempted new durable goal was rejected because this thread already contains
an unfinished older blocked Product Support Engineer goal. That unrelated goal
was not falsely marked complete; this file preserves the implementation state.

## Afternoon follow-up: visible jobs processed through employer sources

The regular Chrome Apple Events read continued to return “JavaScript from Apple
Events is turned off.” No automated LinkedIn scan succeeded, and the saved 429
cooldown was not modified. Do not describe this follow-up as live LinkedIn
collector verification.

Using Brian's supplied job identities/screenshots and the public official
employer postings, three LinkedIn Discover records were persisted with extraction
method `user-screenshot-plus-official-employer-posting` and `origin: paste`:

- Radiometer, Application Support Consultant, LinkedIn 4458415638, employer
  requisition R1316037: Brea, full-time, onsite, $85K–$95K, approximately 16.9 miles.
  Employer feed confirmed active (`canApply: true`). Its original employer date
  is August 28; it was not changed to a fresh date based on a LinkedIn repost.
  Brian's explicit request to tailor the displayed jobs used the normal manual
  tailoring action, retaining the LinkedIn daily cap and shared worker capacity.
  Application: `eacdfe0e-2771-47a7-9196-d0854a1a73d5`.
- Kahana Feld, Enterprise Applications Specialist, LinkedIn 4477463840, official
  Paylocity requisition 4569370: Irvine, full-time, hybrid, $80K–$100K,
  approximately 16.5 miles. LinkedIn's visible Easy Apply classification remains;
  a separately verified official employer destination is saved. Manual tailoring
  was requested; no LinkedIn Easy Apply automation was enabled.
  Application: `d984be66-e90a-4ca7-9348-920ab0a64e06`.
- The Mortgage Office, Support Engineer, LinkedIn 4475174359, Rippling
  704f5117-a7c2-4706-bcca-380b059df153: Huntington Beach, hybrid, full-time,
  $80K–$90K. Excluded under the existing requirement for 5+ years versus the
  profile's documented 3+ years. No application or tailoring run created.

Premium Top Applicant was observed in Brian's screenshots; it was not inferred
from Simplify. Full descriptions and compensation came from the official
employer pages. No application was submitted or exact-PDF approval created.
Pacific Life already exists and was left intact. JPMorgan's live Irvine search
returned 21 roles without Technology Support II. The exact CGS role could not be
verified from its employer careers pages. Brian was asked for those two exact
job URLs; do not substitute unrelated roles or fabricate their requisition IDs.

A narrow salary normalization repair handles an employer template retaining
“annual salary range OR the hourly range” with K-denominated amounts, while
keeping small ambiguous rates and explicitly conflicting periods unresolved.
Full original posting text remains intact. Seven salary/normalization tests,
all 225 web unit tests, typecheck, and targeted ESLint passed. Discover browser
QA at 900px confirmed both saved applications and their tailoring states.

The LinkedIn panel now separates “Imported in last scan” from the total saved
LinkedIn job count and links directly to the saved applications view. This avoids
an old zero-import scan hiding the existence of assisted imports. The default
All openings list excludes jobs already moved into Applications; use the saved
applications link or Approved filter to see these jobs.

## Current checkpoint: open-search capture and three completed resumes

This checkpoint supersedes the afternoon follow-up's pending-tailoring and
individual-URL request. Brian supplied the whole preferred search and requested
processing that list. Do not ask him for CGS/JPMorgan job URLs again: their IDs
were recovered from the actual open page.

### What was actually read

The user's current Chrome search was saved locally using Chrome's native
Apple Events `save` command (`single file` MHTML). This does not execute
JavaScript in LinkedIn, navigate, refresh, or start another collection cycle.
The existing “JavaScript from Apple Events” restriction remains unchanged.
An offline Chrome context with JavaScript disabled and all network requests
aborted parses the snapshot. Temporary raw page data is deleted by the capture
helper. Only normalized job-card data and a verified selected description are
persisted.

**25 cards on the current first page were captured and stored.** This is not all
99+ search results and is not 25 full descriptions. The selected Kahana Feld
description was also extracted from the actual current component-based LinkedIn
layout and linked to its existing application. The detail's job ID must match
the actual tab's selected ID; a search-card “Selected” label is insufficient.

Confirmed previously missing identities:

- CGS Business Solutions, Technology Support & Operations Engineer —
  LinkedIn **4478149382**. Card shows Irvine, onsite, $80K–$105K, Easy Apply.
- JPMorganChase, Technology Support II — LinkedIn **4446316594**. Card shows
  Irvine, onsite, $85.5K–$130K.
- Otter, Middleware Solutions Engineer I — LinkedIn **4457162940**.
- Pacific Life, Platform Engineer II — LinkedIn **4479033768**, existing R17313.
- SchoolsFirst, IT Application Support Representative III — **4468285969**.

CGS and JPMorgan still need their exact full descriptions and verified employer
destinations. Card pay/title alone does not authorize a tailored application.
No automated traversal of the remaining LinkedIn jobs occurred.

### Repeatable assisted action

Discover → LinkedIn Premium now has **Capture my open search (Mac)** and an
expandable captured-card list. It reads an already-open Chrome search and requires
macOS Automation access. The saved preferred search must match. It does not
restart the blocked collector or change its cooldown, session state, last scan,
or first-extraction gate. Repeated captures within 60 seconds reuse saved cards.
This is a Mac-only assisted action; Windows retains pasted-job import.

Implementation:

- `apps/web/scripts/capture-open-linkedin.py`: bounded native save, private
  temporary directory, MHTML decode, automatic cleanup.
- `apps/web/scripts/linkedin-open-search.mjs`: offline parsing, bounded card
  output, selected-job identity check, no authenticated browser profile copying.
- Existing collector extractors now recognize component-key search cards and
  the selected lazy-column detail layout. Synthetic sanitized fixtures cover
  these layouts and keep Simplify scores separate from LinkedIn Premium.
- Existing LinkedIn ingestion handles a selected full posting, duplicate linking,
  normal deterministic eligibility and the normal tailoring queue. Card-only
  records remain separate from verified DiscoveryPosting/application records.

No new dependency, paid service, proxy, or browser provider was added.

### Real tailoring completed

Each following application is **REVIEW**, with a **SUCCEEDED** run,
`validationPassed: true`, `pageCount: 1`, and an actual PDF whose bytes match its
stored SHA-256. No exact-PDF approval was created and no application submitted.

| Employer / role | Application ID | Employer requisition |
| --- | --- | --- |
| Radiometer / Application Support Consultant | `eacdfe0e-2771-47a7-9196-d0854a1a73d5` | R1316037 |
| Kahana Feld / Enterprise Applications Specialist | `d984be66-e90a-4ca7-9348-920ab0a64e06` | Paylocity 4569370 |
| Otter / Middleware Solutions Engineer I | `baca9d25-80b1-4de7-8d24-96f7ff4f2880` | Greenhouse 8716964002 |

Radiometer and Otter retain original employer posting dates (August 28 and
August 24 respectively). Brian's explicit request used normal manual tailoring;
these older jobs were not falsely marked fresh to enter unattended discovery.
Kahana and Otter each required two bounded structured-plan attempts before
validation succeeded. The configured existing-subscription tailoring model was
unchanged. Discovery/capture did not call a model.

Otter's actual duties fit technical support, API/integration troubleshooting and
production incidents despite its unfamiliar Solutions Engineer title. A narrow
duty-based matching repair now recognizes that combination, with negative tests
for pre-sales-only scope, architecture, management and hard eligibility failures.
“2 to 5 years” correctly uses the lower required bound of two. This does not
permit unsupported specialist experience or blanket Solutions Engineer matches.

Pacific Life was linked to existing application
`fc0f0e63-b817-4605-8dc9-0efd5d78b9c3`; no new application or tailoring run.
The Mortgage Office remains excluded for its required five years. SchoolsFirst
was imported but remains excluded: its pay period is not explicit and its
specialist qualifications require review. A separately verified Anaheim HRIS
posting was retained as excluded for insufficient documented role fit.

### Fresh follow-up verification

- Native capture CLI: 25 actual cards; correct selected Kahana ID/full description.
- Live local `POST /api/discovery/linkedin`, `capture-open-search`: HTTP 200;
  cards persisted, selected posting linked to existing work, cooldown unchanged.
- Real local browser at 900px: capture button and CGS/JPMorgan cards visible,
  no horizontal overflow. Otter's normal Review page shows the correct role and
  PDF preview links. Actual three PDFs checked against stored hashes.
- `npm run test:unit`: 226 passed, zero failed (includes current-layout fixtures).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `AIADAPPLY_BUILD_DIR=.next-linkedin-verify npm run build`: passed. Existing
  Turbopack broad file-tracing warning remains; no build failure. Temporary
  generated tsconfig include entries were removed after verification.
- Root `.venv/bin/ruff check apps/web/scripts/capture-open-linkedin.py`: passed.
- `git diff --check`: passed before final documentation/cleanup pass.

Earlier isolated DB, full browser E2E and Python-suite results above remain
historical results, not newly rerun results for this follow-up.

### Remaining external boundary

The automated collector's last live result is still **HTTP 429**. Its next allowed
attempt remains **October 13, 6:26 PM Pacific**. Native reading of user-open
content is assisted capture, not proof that automated LinkedIn browsing works.
After cooldown, normal dedicated-session access and a single-job inspection
still precede any full cycle. Do not clear the block or switch profiles to force
an automated scan. Three review-ready resumes are usable now, but the remaining
captured cards are not all extracted, qualified or tailored.

Nothing was committed, pushed or deployed. Existing other-terminal Gmail/OCR
changes and application history were preserved.
