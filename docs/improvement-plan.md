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
