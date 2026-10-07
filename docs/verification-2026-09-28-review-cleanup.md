# Review state and source-check cleanup — September 28, 2026

Continued from the draft technology review work.

- Added shared review-state helpers in `apps/web/src/lib/application-review.ts`.
  Selected queued/running versions show their own progress; saved versions retain
  their audit even while a different run is active. A separate link opens that run.
  Application-level controls and refresh continue to reflect the active run.
- Missing technology placements and unverified draft assumptions use warning
  guidance. A successful export with zero claim-risk flags no longer creates a
  green completion icon for an incomplete draft. Validation failures also override
  a Ready label. Current application progress does not label historical versions
  as submitted or ready.
- Consolidated the repeated successful-run, validation, and resume-file checks.
  Consolidated the omission-state check shared by the headline and draft panel.
- Git ignores generated output and alternate Next build directories. Ruff excludes
  output archives, and ESLint handles alternate build directories consistently.
  Existing output files remain on disk; no saved resumes or reports were deleted.

Verification: all 86 web unit tests passed, including eight new review-state cases.
ESLint, TypeScript, production build, Git whitespace checks, repository-wide Ruff
lint/format (107 files), and mypy (43 source files) passed.

Playwright CLI checked a synthetic saved version with missing AWS S3 placement
alongside a queued version in the configured isolated database. The saved audit
stayed visible, the warning headline appeared, controls remained locked, the active
run link switched to the queued state, and the mobile page had no horizontal
overflow. Screenshot evidence is under
`output/playwright/version-review-cleanup/`. The fixture, its two runs, the isolated
server, and the verification browser were cleaned up afterward.

The live Techaxis application renders the updated review guidance. Normal system
health reports the database, base resume, and worker ready, with zero active runs.
Engine tailoring behavior and historical application records were preserved.
