# Approved product improvements — October 20, 2026

Brian approved implementing the audit findings and the nine product decisions
recorded in AGENTS.md. This is the current plan; the earlier brief below is historical.

- P0: request-bound email verification, confirmation-only Applied transitions,
  complete backups and safe interrupted-attempt restoration, field-level profile recovery.
- P1: shared confirmed candidate facts/evidence/onboarding/base; immutable per-run
  sources; explicit reusable-answer promotion; urgent commitments and bounded
  follow-ups; paste-first intake; cross-device edit conflicts.
- P2: native Windows exclusive worker, shared queue with Windows browser ownership,
  on-demand startup, login dashboard/tailoring, preferred plus supplemental searches,
  consistent exact-fit/Premium ordering, relevant model context only.
- P3: truthful source/device/health labels, accessibility, current documentation,
  actual isolated integration/browser/restore and Windows runtime verification.
- P4: optional new automation frameworks and paid infrastructure remain outside scope.

Research informed implementation, rather than adding new dependencies:

- Python native Windows locking and subprocess handle inheritance:
  https://docs.python.org/3.13/library/msvcrt.html and
  https://docs.python.org/3.13/library/subprocess.html . The Windows Python parent
  retains the native lock; Node verifies its launcher and stops if the parent pipe closes.
- PostgreSQL transaction locks serialize claims, shared evidence edits and answer
  promotion: https://www.postgresql.org/docs/current/explicit-locking.html .
- Persistent browser authentication stays device-local; it is sensitive account
  material: https://playwright.dev/docs/auth . Reuse dedicated sign-ins, not passwords.
- Gmail uses exact recipients, employer scope, request-action timestamps and internal
  receive timestamps: https://developers.google.com/workspace/gmail/api/guides/filtering
  and https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages .
- Free-tier recovery needs explicit portable exports; database backups do not restore
  deleted Storage objects: https://supabase.com/docs/guides/database/backups .
  Keep hash-verified artifact bytes in the workspace backup. No paid recovery upgrade.
- Logon tasks use an interactive limited user: https://learn.microsoft.com/en-us/windows/win32/taskschd/starting-an-executable-when-a-user-logs-on .
- Dialog keyboard focus includes textareas/selects, not only inputs/buttons:
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ .

Verification/checkpoint details live in CURRENT_HANDOFF.md. Private source backups,
restore evidence and runtime diagnostics remain ignored and device-local.

---

# Daily job search workspace

## Agreed brief

Brian lives in Seal Beach, CA 90740. Discover full-time roles within a 30-mile
radius, targeting at least $60,000/year ($28.85/hour at 2,080 hours/year). Staffing
companies are welcome. Brian approves a posting before tailoring. Keep the
existing factual, layout-preserving resume engine and make daily applications
the purpose of the dashboard. Remote-only roles are off by default because that
preference was not confirmed; it can be changed in Discover.

## Implementation

- Today: actual submissions, remaining daily goal, local-calendar weekly activity,
  consistent-day streak, due follow-ups, and ready applications before new captures.
- Discover: public Greenhouse, Lever, Ashby, and SmartRecruiters employer feeds;
  explicit source coverage and failures; daily refresh on opening the dashboard;
  daily/weekly first-seen filters; durable dismissal and approval; source links.
- Match against evidence from the protected resume: application/production support,
  Microsoft 365/Entra, SQL, API debugging, integrations, and IT operations. Explain
  overlap and qualification concerns. Never treat a match score as an ATS guarantee.
- Strict matches need confirmed full-time status, a salary floor meeting the target,
  and a known local city. Missing information goes to a separate review list.
  City-centre distance is an estimate of radius, not a driving-distance guarantee.
- Connect approval to the existing capture and tailoring data model; never submit
  applications. Keep previous run files and make run selection available.
- Add database-backed artifact copies and explicit storage health. This Mac's
  current database is local PostgreSQL, not Supabase; automatic cross-device sync
  requires configuring both computers with the same shared database.
- Use additive database setup only. Preserve existing records and base files.

## Design direction

A personal work desk for an application-support professional. Today answers
“what should I finish next?”; Discover is the incoming tray, Applications the
working record. A seven-day application ledger is the signature element.

Palette: slate canvas #101820, raised slate #18232e, separators #30404e,
clear text #edf2f5, muted text #a5b4c0, restrained blue #7aa9d5.
Type: Avenir Next / Segoe UI Variable Display for headings, Segoe UI / system
sans for body, Cascadia Code / system monospace for counts. Flat surfaces,
comfortable spacing, no ornamental gradients, short feedback transitions,
visible focus, and reduced-motion support.

## Verification

Baseline: 129 Python tests and 26 web unit tests pass. Run the engine regression
suite again after integration, new discovery/accountability unit tests, web lint,
typecheck, production build, isolated-database browser regression tests, live
public feed checks, mobile overflow and keyboard checks. Do not run fixture
cleanup against the normal database. Do not queue real tailoring during tests.

Public adapter references:

- https://docs.greenhouse.io/job-board.html
- https://github.com/lever/postings-api
- https://developers.ashbyhq.com/docs/public-job-posting-api
- https://developers.smartrecruiters.com/docs/posting-api


## October 20: broader, realistic job-search strategy

Brian explicitly requested 12-hour collection and automatic tailoring beyond
LinkedIn, using Premium perks and supported experience rather than keyword fit.
LinkedIn and employer-feed schedules are now 12 hours. Retain existing caps:
10 LinkedIn drafts per Pacific day and 2 employer-feed drafts (minimum score65 after the local realistic-fit clarification).
Submissions still require exact-resume approval. Cooldowns override schedules.

Primary targets: application/software/product support, technical customer support,
implementation/onboarding support, desktop/service desk, user access, business
application and junior systems analysts. Sales System Analyst is screened as an
adjacent IT role; actual selling, quotas, advanced CRM ownership and missing
specialized experience remain exclusions. No invented job history or integrations.

Source strategy:
- LinkedIn Premium: observed Top Applicant / High signals break comparable-fit
  ties. Capture visible alumni/recruiter contacts for drafts. Recommend scarce
  Top Choice/InMail usage only after specific user review; never send or consume
  credits automatically. Applicant clicks on external jobs are not completed
  applications. LinkedIn ranking is not endorsed by employers.
- Employer-first: existing Greenhouse, Lever, Ashby, SmartRecruiters and Workday
  feeds provide full postings and canonical requisitions. Add verified Primoris
  and SCAN boards; do not treat their screenshot jobs as automatically eligible.
- Local institutional lane: CSULB staff/alumni CareerLINK, UCI, Long Beach city,
  Orange County, MemorialCare/Hoag and local colleges. Existing manual links are
  discovery destinations, not claims of automated adapter coverage.
- Staffing lane: Robert Half / Insight Global direct-hire full-time support only.
  Exclude contract listings under the current saved full-time rule.
- Broader boards: Indeed, Built In and campus boards generate leads; verify exact
  employer posting, base pay and worksite before saving/recommending/tailoring.
- After Gmail OAuth works, existing relevant job-alert emails can provide leads;
  receiving an alert is not salary, freshness or application-receipt proof.

High-value next experiments: separate factual tailoring emphasis for user/desktop
support, SaaS incidents/API troubleshooting, and implementation/data validation;
company-specific short outreach drafts referencing real evidence; identify
repeated missing requirements from eligible jobs and use existing LinkedIn
Learning for small relevant practice tasks. Never claim coursework as job usage.
Evaluate interviews/replies by source and role family, not volume or fit scores as
hiring probabilities. Retain history, prioritize fresh credible roles, and verify
employer confirmation before counting a submission.

Research: LinkedIn official Premium overview and applicant-insight guidance:
https://www.linkedin.com/help/linkedin/answer/a7475654
https://www.linkedin.com/help/linkedin/answer/a563146
CSULB staff employment: https://www.csulb.edu/employment
Employer examples verified:
https://prim.wd108.myworkdayjobs.com/en-US/Primoris/job/Application-Support-Specialist_-2
https://scanhealthplan.wd108.myworkdayjobs.com/en-US/scancareers/job/Long-Beach-Office-3800/Sales-System-Analyst_JR2340
SCAN's published starting hourly base is below the saved annual floor; Primoris
posting lacks confirmed pay. Neither is an automatic recommendation currently.


October20 local hardening verification: scheduled employer collection is fenced to
Windows; its running supervisor and worker polls were observed, sleep was already
disabled. Public CSULB RSS and Laserfiche Jobvite adapters are live, plus Pacific
Life Workday:40 employer boards completed a native Windows cycle with no failures.
Reasonable supported adjacent roles can use65 fit; schedule cautions no longer
block draft preparation. All material gaps remain gates. Public source and identity
regressions, independent scheduler failure tests and secondary-device rejection
passed.245 web unit tests on both devices,29 integration,20 E2E/build,346 Python
with1 platform skip; typecheck/lint/Ruff/mypy passed. No new production resume or
application submission was manufactured when no new eligible posting qualified.
Remaining manual directories are explicitly manual; LinkedIn's rate-limit cooldown
remains authoritative. A due Windows cycle can start its dedicated browser after a
reboot; saved authentication is reused, never bypassed.

## October 20 preparation-blocker audit

Broad scan matches are not automatically eligible drafts. Employer cards now show
the precise blocking reasons, including existing applications, material requirements,
fit cutoff and stale observations. A known original publication date older than14
days no longer disqualifies an employer listing freshly confirmed open within12hours.
Future/unknown dates, inactive listings, missing facts and duplicate checks remain.
Campus Computer Services Consultant is a core support title; requirement sections
recognize Required Knowledge/Skills and Bonus Skills, and stop at employer/legal
boilerplate so Workday application instructions are not candidate requirements.
