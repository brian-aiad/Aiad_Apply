# Production-confidence verification — September 14, 2026

This pass continued from the September 13 product baseline. It concentrated on
the real resume path, output quality, recoverable application state, and the
last interaction race found in a compiled-browser run.

## Real transformation

A fresh transformation used the tracked GoodLeap Application Support Engineer
fixture, the protected candidate profile, the protected base resume, the native
authenticated Codex CLI, and the normal Windows renderer.

- The accepted run completed in 332.9 seconds.
- Parsing and the Word baseline render took about 5.1 seconds.
- Retrieval and model startup reached the Codex stage at about 31.6 seconds.
- The first structured rewrite plan was accepted at about 322.4 seconds.
- The candidate render completed at about 327.2 seconds and final validation at
  about 332.2 seconds.
- The result was one page with two meaningful wording changes, no quality
  warnings, 12 supported terms represented, and seven unsupported terms kept
  out of the resume.
- Protected facts, metrics, section structure, formatting, package integrity,
  and all three hyperlinks passed validation.
- Normalized ATS text extracted from the DOCX and PDF was identical.
- All 13 bullet openings were unique and no semantic duplicate pair crossed the
  conservative warning threshold.
- One low-risk transferable-evidence note remained visible in the development
  report; it did not introduce an unsupported claim or block validation.
- The longest bullet was unchanged high-value original content. The model did
  not rewrite strong quantified content merely to create a larger diff.

The generated DOCX, PDF, report, keyword decisions, and exact change records
were then submitted through the authenticated worker completion route to a
disposable PostgreSQL database. The application page reconstructed the report
after refresh, downloaded both application-ready artifacts, and returned bytes
whose SHA-256 hashes exactly matched the generated files. Review moved to Ready,
Ready moved to Applied, the seven-day follow-up was created, and Today counted
exactly one submitted application.

## LibreOffice finding

A separate fresh Codex transformation was forced through LibreOffice and
completed all stages in 268.4 seconds. Manual PDF inspection found that the
protected employer/date tab in one heading rendered as joined words. The same
defect occurs when the protected base resume is rendered by LibreOffice, so it
was not caused by the rewrite plan or DOCX mutation.

Layout validation now compares tab-delimited source boundaries with extracted
PDF words and rejects this collapsed-tab output. The older LibreOffice artifact
therefore fails the strengthened check with
`experience.wehelp.heading` identified. On Windows the default Word renderer
produces the correct spacing and passes. The current protected template is not
yet renderer-equivalent under LibreOffice and should not be treated as a
sendable LibreOffice artifact.

## Environment and diagnostics

The default `.venv` was stale rather than blocked by an ACL. Python and package
metadata were out of sync, and VS Code isort helper processes intermittently
held the environment executable. After stopping only the verified helper
processes, `uv sync --extra dev` rebuilt the project environment with Python
3.13.15 and the repository package.

The Windows launcher now identifies processes holding `.venv` files when an
environment repair fails. `doctor` reports the Python version, selected renderer
policy, the resolved native Codex executable, the resolved LibreOffice
executable, and the operating-system-specific LibreOffice locations searched.
The Codex launcher also bypasses a local command wrapper that did not forward
the working-directory argument correctly.

## Verification

| Command | Result |
| --- | --- |
| `.venv\Scripts\python.exe -m ruff format --check .` | Passed |
| `.venv\Scripts\python.exe -m ruff check .` | Passed |
| `.venv\Scripts\python.exe -m mypy packages\resume-engine\src` | Passed; 39 source files |
| `.venv\Scripts\python.exe -m pytest -q` | 136 passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:unit` | 61 passed |
| `npm run test:integration` | 10 passed |
| `npm run build` | Passed; 15 application routes built |
| `npm run test:e2e` | 12 passed against the compiled server |
| `.venv\Scripts\aiadapplyv2.exe doctor` | Passed; Python, base resume, Codex, Word policy, and LibreOffice resolved |

Database and browser tests used disposable local PostgreSQL 17 clusters on
ports 55432 and 55434. The configured hosted test credential was stale, and the
database isolation guard correctly prevented fallback to the normal workspace
database.

The browser suite covered Today, Discover, Capture, Applications, application
review, Analytics, and Settings at 320×568, 390×844, 768×1024, 1280×800,
1440×900, and 1920×1080. The populated real review was also inspected manually
at 390×844 and 1440×900. It showed the expected summary, precise phrase diffs,
worker-offline health state, professional filenames, stable responsive layout,
and no horizontal overflow.

Changes remain local and uncommitted. No push or deployment was performed.
