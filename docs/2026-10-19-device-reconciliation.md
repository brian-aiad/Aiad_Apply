# AiadApply device reconciliation — October 19, 2026

Reviewed the unfinished Mac `aiadapplyV2-shop` worktree at `623b846` against current
shared main `9cfca43` in an isolated worktree. The original shop checkout and its
verified device-sync backup remain intact; nothing is deleted or deployed.

## Retained

- Restored the missing reverse whole-term match for rejected candidate technology.
  An explicit rejection of ERP now blocks a posting label such as ERP systems.
  Preserved current technical-family matching and explicit historical aggressive
  draft compatibility. The original shop regression failed on main before the fix.
- Retained its regression test and added boundaries for ERP/enterprise support,
  Java/JavaScript and C/C++, preventing accidental substring exclusions.
- Preserved synchronized agent instructions, overnight workflow/template, README
  link and ignore rules. Private overnight prompts/checkpoints stay ignored.

## Already present or superseded

Current main already includes OneDrive/base-resume resolution, worker recovery,
keyword additions, protected Skills handling, evidence rejection machinery and
layout checks. Current health checks use centralized base-resume selection.
Current answer kit uses the workspace application profile; old browser-only
answers would regress cross-device continuity. Current evidence review has
source-scoped confirmation rather than the old unscoped update path.

Retained current sidebar, review and application controls instead of restoring
older presentation. Retained the newer renderer safeguards for text tabs,
bullet alignment, spacing and concurrent Mac rendering. Kept GPT-6 Astra/high
rather than the old shop GPT-5.6/low defaults. Did not import old personal profile
or evidence hashes, swap files, dependency-version experiments, runtime data,
credentials, application artifacts or outdated model tests.

## Verification

- Original ERP regression: failed on current main, passed after the one-line fix.
- Candidate profile and substring-boundary suite: 8 passed.
- Broader profile, established/everyday technology, automatic technical policy
  and historical draft suites: 73 passed.
- Web: 226 unit tests passed; TypeScript, ESLint and production build passed.
  Build retains broad file-tracing warnings in existing LinkedIn code.
- Python Ruff lint passed; mypy passed for all 46 source files.
- Full formatter check identifies 30 files needing formatting. A clean extraction
  of main identifies the same 30 files; unrelated formatting was not changed.
- Full Python suite: 344 passed, 1 skipped (Windows-only launcher test),
  5 existing PyMuPDF/SWIG deprecation warnings, 158.22 seconds.

No production/shared database was configured in the isolated review worktree.
Database-backed browser/integration tests were not run: they require a separately
configured disposable database. No live tailoring, job application submission,
email, production database migration or deployment was performed.
