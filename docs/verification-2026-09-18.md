# Application workspace continuation — September 18, 2026

Continued from the existing uncommitted application review and resume-engine
changes. This pass focused on navigation and Answer kit reliability, then
verified the combined working tree.

## Changes in this pass

- Workspace tabs derive their selection from the current URL, including browser
  history and changes to the selected resume version. A version without the
  requested Stretch Lab falls back to an available tab.
- Selecting a resume version preserves the tab and fragment. Re-selecting the
  active tab does not add another browser-history entry.
- Review tabs identify both their changes and keyword panels for assistive
  technology; visible panels can receive keyboard focus.
- Answer kit keeps keyboard focus inside the dialog, makes the background inert,
  locks background scrolling, and restores focus and background state on close.
- Saved answers are checked for valid string values. Unavailable browser storage
  and denied clipboard access produce visible, announced feedback; answers
  remain editable. Copy timers are cleaned up.
- The existing workspace browser fixture now includes the keyword decision
  required by its combined Review/Keywords assertions.

## Verification

| Check | Result |
| --- | --- |
| `uv run pytest -q` | 166 passed; 1 Windows-only launcher test skipped on macOS |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | 89 files formatted correctly |
| `uv run mypy packages/resume-engine/src` | Passed; 40 source files |
| `npm run lint` | Passed after changes |
| `npm run typecheck` | Passed after changes |
| `npm run test:unit` | 64 passed |
| `npm run test:integration` | 13 passed |
| `npm run test:e2e` | 13 passed against a fresh production build |
| `git diff --check` | Passed |

Database and browser checks used a newly created disposable local PostgreSQL
database, `aiadapply_verify_20260918`, with both test connection variables set
explicitly. The ordinary workspace database was not used for fixture mutations.

The browser suite exercised Today, Discover, Capture, Applications, application
review, Analytics, and Settings at 320, 390, 768, 1280, 1440, and 1920 pixels wide.
No page-level horizontal overflow was detected. Screenshots are under
`output/playwright/workspace-*.png` (ignored by Git).

Additional Playwright CLI checks against the compiled application verified:

- Posting remains selected and visible after switching resume versions.
- Browser Back restores the previous version and tab.
- Switching from Stretch Lab to a failed version with no Stretch Lab shows
  Posting instead of leaving every panel hidden.
- Reverse Tab wraps from the first dialog control to its last control.
- Injected clipboard denial shows manual-copy guidance.
- Injected browser-storage failure preserves the typed answer and explains
  that it cannot be persisted.
- Escape restores focus to Answer kit and removes background inert state.

No new model-generated tailoring run was queued during this pass. Python tests
verify the existing engine changes, but this pass does not claim a new live
model quality evaluation. Changes remain local and uncommitted; no deployment
was performed.
