# Project memory and handoff

**Current cross-device checkpoint:** [Windows continuation, October 13](WINDOWS_CONTINUATION.md).
Brian now explicitly requested commit/push to main. The no-commit note below is
historical. Assisted capture saved 25 cards; three tailored resumes are in Review.

Latest October 13 implementation: [LinkedIn verification checkpoint](linkedin-verification-2026-10-13.md).
Local code, fixture/database concurrency tests, and full browser regression pass.
Real LinkedIn extraction remains blocked by the existing 429/cooldown; use the
assisted paste path until normal permitted access returns. No commit/push/deploy.

For the consolidated October 13 continuation document, start with
[Full project handoff](FULL_PROJECT_HANDOFF.md). It includes the current LinkedIn
objective, implementation, live blocker, subsystem details, and device setup.
The entries below remain historical checkpoints.

Saved October 12, 2026. This records prior work, not a fresh live application audit.
Read AGENTS.md for standing policy and docs/resume-export-rules.md before tailoring changes.

## Confirmed workflow

Use free services and the existing Codex subscription only. Tailor, obtain approval of the exact job-specific PDF, then Auto apply. Bind approval to job, run, PDF hash and destination; verify uploaded bytes and attachment before submitting. Only mark Applied after a new employer receipt. Check uncertain attempts before retrying. Employer-facing PDF filenames must not include internal version/hash prefixes.

RTX and Collins are referral-only, including previously approved attempts. The application-policy setting and server-side application-restrictions.ts enforce this hold. AGENTS.md and the saved application profile contain October 9 candidate corrections. Private onboarding is in ignored .runtime/application-onboarding.json. Never infer civilian government employment from no military service, or reference availability from a clean criminal record.

## Completed implementation

- Browser dropdown dismissal, Greenhouse checkbox validation and bounded navigation snapshot retries.
- Final result normalization clears stale blockers only for confirmed submissions.
- Discovery-source information passed through worker material and reasoning.
- Tailoring generation bounded to three attempts with rejected-draft feedback.
- Technology exclusion normalization and improved established-technology/context checks.
- RTX/Collins server-side restriction integrated into approvedMaterial, with unit coverage.
- Gmail verification and screenshot OCR changes are present from another terminal; preserve them. Do not equate installed email plugins with verified mailbox access.

Prior recorded verification: 176 tests passed, three optional live-model tests skipped; ESLint passed. October 9 restriction unit test and web TypeScript checking passed. These results do not certify later edits.

## Application batch checkpoint

The October 8 private report .runtime/review-batch-summary.json records 12 Review records / 11 unique jobs: two submitted, seven blocked, two unavailable, one duplicate.

Confirmed submitted: Relativity Space Business Systems Analyst and Factory Test Technical Specialist II. Both have employer confirmation URLs, screenshots and approved PDF hash evidence in the private report. Do not submit them again.

Anduril Counter Intrusion: not confirmed submitted. Clearance-history question was answered October 9; inspect current attempt and export-control selection before resuming.
Rocket Lab Supervisor, IT Support: not submitted. Interview and military/background questions were answered October 9. Civilian U.S. government employment and reference availability remain unanswered.
TravisMathew, Pacific Life and Techaxis: last blocked on account access. Autonomous sign-in is authorized with supplied credentials, but no passwords have been supplied and a secure credential/login implementation is not complete.
RTX/Collins: now excluded regardless of old approval or login status.
Mendix: original posting unavailable. Pacific Life duplicate record must not cause a second application.

## Next-session procedure

Read this file, AGENTS.md and the private batch report. Check current database/attempt status and service health; old PIDs and browser tabs are not current evidence. Reuse saved answers. Do not claim all applications succeeded. Preserve other-terminal edits. The last known pushed commit was c77c03712fbc4055c2a963ddcb56ea32ab040935; subsequent work remains in the working tree unless separately committed.

A private checkpoint under .runtime/checkpoints/ preserves modified/untracked source files, a Git diff, and local onboarding/report data. It is local, ignored by Git, and is not a cross-device backup. No push or new application submission was performed by this save operation.

## October 12 discovery improvement

Added scope-first ranking: major career changes and unsupported required people management are excluded; L3 and required specialty/tool gaps cap ranking below ordinary supported matches. Expanded supported title recognition and optional Adzuna queries for desktop/help desk/IT support. No credentials or paid services enabled. Discovery snapshots reassess stored postings immediately; application history is unchanged. UI clarifies fit is not hiring probability.

Research: O*NET Computer User Support Specialists (https://www.onetonline.org/link/summary/15-1232.00) and BLS Computer Support Specialists (https://www.bls.gov/ooh/computer-and-information-technology/computer-support-specialists.htm). These establish duty/title families, not individual hiring odds.

Validation: 48 discovery/RTX/Workday tests passed, web typecheck and targeted ESLint passed. Live API checked 139 stored postings; specialist CAD/AV/defense titles exposed and corrected. Adzuna/USAJOBS are not connected. Current source inventory remains a coverage limitation; expanded Adzuna queries only run after credentials are configured. Sparse adjacent roles are excluded rather than presented as realistic matches.

## Expanded search delivery (October 12)

See docs/discovery-search-improvements.md. Five verified free employer boards added (35 total), six focused role-family search links, default recently verified active listings (including older/unknown original dates), and live-result corrections for film post-production, programmer roles and background-check wording. Full scan finished successfully for all 35 boards. No applications submitted. 52 focused tests, TypeScript and lint passed; browser checked. No paid services enabled; broader aggregator credentials still absent.

## Local-first follow-up

Added a shareable `near=1` Discover view for worksites within min(15 miles, saved radius), nearest first. It excludes unknown distances and does not alter saved search preferences. Added verified manual career sources for CSULB alumni CareerLINK, MemorialCare, Hoag IT and City of Seal Beach. Do not present the temporary/part-time Seal Beach IT posting as a full-time match. These four links are manual channels, not newly automated feeds. Six view/search tests passed; browser exercised the near-home route.

## Latest correction: strict pay and 30-mile constraints

Supersedes the previous near-home feature: removed the 15-mile shortcut and legacy near=1 links no longer narrow results. Confirmed saved preferences are $60k/year minimum, 30 miles, full-time, remote disabled. Unknown pay/location, ranges starting below the minimum, unconfirmed full-time and multi-office ambiguity are excluded from recommendations, including RTX. Discover save/tailor rechecks current assessment server-side. Unscreened directories are collapsed and explicitly not recommendations. Indeed searches include salary text and full-time; external sites remain outside enforceable filtering. Live API assertions checked all eligible records against salary/worksite/type constraints.
