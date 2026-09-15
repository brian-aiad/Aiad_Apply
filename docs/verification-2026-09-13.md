# Product improvement verification — September 11–13, 2026

> A fresh environment, real model transformation, artifact persistence, and
> final browser verification were completed on September 14. See
> `docs/verification-2026-09-14.md` for the current result.

Resumed the uncommitted capture-preview, phrase-comparison, application-state,
and tailoring-priority changes found in the Windows workspace.

## Fixes completed during continuation

- Preserve the browser's requested host when checking mutation origins. Next.js
  normalizes some local request URLs to localhost; that previously rejected valid
  saves from 127.0.0.1.
- Return validation failures for malformed job URLs instead of throwing. An empty
  optional URL now reaches the allowed empty-string branch and saves normally.
- Use the shared database-isolation guard for integration tests. Preserve original
  workspace database identities across Playwright worker configuration reloads.
- Run browser suites sequentially because they inspect shared database counts.
- Run Playwright against the compiled production server and authenticate with
  isolated test credentials. This avoids development-router compilation races
  while still exercising the release authentication boundary.
- Wait for saved application navigation and hydrated search controls in browser
  tests. Normalize Windows fixture line endings before calculating posting hashes.
- Stack application search/filter controls at tablet widths and keep wide tables
  scrollable within their panel. This fixes page overflow at 768 pixels.
- Preview ten deterministic fit dimensions before capture, with explicit
  supported evidence, unsupported tools, protected facts, hard-requirement
  checks, and recommendation reasons instead of a hiring-probability score.
- Let reviewed company, role, location, workplace, and employment corrections
  flow into the saved job while preserving the exact paste and fingerprint.
- Persist the capture recommendation and its factors on the application
  workspace so the decision remains inspectable after saving.
- Prioritize Today actions by due follow-up, ready-to-apply work, review, failed
  runs, saved jobs, active work, and strong discoveries. Labels, links, and
  buttons now come from the same deterministic decision.
- Keep mobile Capture at the top of the page instead of scrolling the title
  beneath the header, and stop the desktop editor from stretching beside a long
  fit analysis.

## Validation

| Check | Result |
| --- | --- |
| Python tests | 132 passed |
| Ruff lint and format | Passed; 84 files formatted |
| Python type checks | Passed; 39 source files |
| Web unit tests | 58 passed |
| Isolated PostgreSQL integration tests | 10 passed |
| Full compiled-server browser suite | 12 passed |
| Post-polish responsive browser suite | 3 passed |
| Web lint and TypeScript | Passed |
| Production build | Passed |
| Whitespace checks | Passed |

The product browser suite checks seven pages at 320×568, 390×844, 768×1024,
1280×800, 1440×900, and 1920×1080, including the populated capture preview.
Screenshots are ignored local artifacts in `output/playwright/`. Today, Capture,
Discover, Applications, application review, Analytics, and Settings were visually
inspected on desktop and mobile. Capture and review were inspected again after
the final responsive polish.

Database and browser tests used a fresh local PostgreSQL cluster on port 55433
and the `resume_qa` schema. No real tailoring worker ran against that database.
The configured normal workspace database was not used for fixture cleanup.

Python checks used the existing `.runtime/audit-venv` environment through
`UV_PROJECT_ENVIRONMENT` and `uv run --no-sync`. The default `.venv` could not be
recreated because access to its Scripts directory was denied; normal launcher
startup remains unverified. No fresh model-based resume generation was performed.

Changes remain local and uncommitted. No push or deployment was performed.
