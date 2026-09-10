# Workspace upgrade verification — September 10, 2026

## Result

Implemented the agreed daily-workspace and approval-first discovery plan without
modifying the protected resume, candidate data, or Python tailoring engine.
Changes are local; no commit, push, hosted deployment, or cloud database migration
was performed as part of this upgrade.

## Automated checks

| Check | Result |
| --- | --- |
| Python engine regression suite, `uv run pytest -q` | 129 passed |
| Web unit suite, `npm run test:unit` | 43 passed |
| Isolated PostgreSQL integration suite, `npm run test:integration` | 7 passed |
| Chromium regression suite, `npm run test:e2e -- --max-failures=1 --retries=0` | 9 passed |
| ESLint and TypeScript | Passed |
| Next.js production build | Passed |
| `git diff --check` | Passed |

The Python suite reports five pre-existing SWIG deprecation warnings. Browser
tests use the dedicated E2E database, separate build output, and disabled automatic
live discovery. Updated stale capture-label and ambiguous review-label assertions
to target the actual controls; retained the behavior checks.

New tests cover salary/currency normalization, benefits-versus-pay confusion,
location exclusions, aerospace false positives, clearance and specialist flags,
resume evidence fingerprint, daylight-saving boundaries, midnight-safe streaks,
six simultaneous approval requests producing only one application/run, stale
posting refusal, expired refresh lease recovery, concurrent refresh ownership,
partial source retention, portable download fallback, corrupt-file rejection,
worker-result idempotency, and backup export/transactional restore. Restore was
tested against an empty schema and refused a second import into the populated one.

## Live and visual checks

The final public-source scan completed at 1:01 PM Pacific. All 15 boards responded
successfully; 22 locally relevant openings remained after screening. One cleared
the configured screening criteria; 21 disclosed missing information or qualification
concerns. This is a dated observation, not a guarantee of current availability or
eligibility. No live discovery was approved, tailored, or submitted during testing.

Live data exposed issues fixed before handoff: an annual salary next to hourly
benefits text; specialized aerospace integration jobs mistaken for software work;
clearance wording containing `U.S.`; and interrupted searches stuck as running.

Browser checks included desktop at 1200 × 818 and phone at 390 × 844; Settings
also checked at 820 × 1000. Today, Discover, historical application review,
Settings, and Analytics had no horizontal page overflow after fixing long Settings
paths. The keyboard skip link receives focus. Discovery filters and empty search
states work. Reviewed pages reported no browser-console errors. Screenshots are
local, ignored artifacts under `output/playwright/`.

The original application's six versions remain selectable with their own six
download links. The normal database still contains one job/application, six
successful runs, 36 artifacts, and zero approved discoveries. All 36 artifacts now
have database-backed bytes; no original output files were removed. The final health
check reports database, protected base resume, and one local worker ready, with no
active tailoring runs.

## Explicit limits and operating notes

- Matching is explainable heuristic screening, not comprehensive qualification
  analysis. User approval and employer verification remain necessary.
- Discovery covers a curated source registry, not all jobs on the web. Additional
  government/university/staffing directory entries are manual searches.
- Daily checks run when Today or Discover opens, not unattended while closed.
- Radius uses approximate city centres, not driving distance or exact worksites.
- The Mac database remains local. Git pull will not bring its records to Windows.
  Use a backup transfer or deliberately configure a shared, secured database.
- Database artifact copies are not an off-device disaster-recovery backup by
  themselves. Download the private workspace backup and store it securely.
- No paid model call or new real resume generation was made. Engine regressions,
  authenticated worker completion tests, existing artifacts, and live worker health
  were verified; a fresh real-world tailoring run still requires Brian's approval.
- Windows execution and the hosted release were not tested on this Mac. Follow
  the README migration/setup steps before running the new code elsewhere.

## Design choice

Frontend-design guidance shaped a quieter slate/blue workspace, clear navigation,
and a seven-day submission ledger rather than decorative dashboard widgets.
The existing capture/review surfaces retain their workflow and validation policy.
