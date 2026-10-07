# Resume and workspace verification — September 21, 2026

This pass continued the uncommitted resume-engine and application-workspace
upgrade. It verified the fresh Pacific Life and McCarthy posting fixtures,
rechecked the strengthened export rules, and fixed a command-line JSON output
issue found during that verification.

## Fixture verification

- Pacific Life `Platform Engineer II` parsed as Newport Beach, CA-700 with
  compensation of `$113,490.00 - $138,710.00`, six responsibilities, and 32
  extracted keywords.
- McCarthy Holdings `Product Analyst II - Foundry Applications` parsed as
  Newport Beach, CA with compensation of `$77,000 - $99,000`, 15
  responsibilities, and 29 extracted keywords.
- The `parse` command now writes JSON through `typer.echo`; Rich terminal
  wrapping no longer inserts line breaks into long string values. A regression
  test covers the Pacific Life fixture.

The Foundry fixture remains an evidence-gap case for the named platform. No
tailoring run or application submission was performed from these fixtures.

## Verification

| Check | Result |
| --- | --- |
| `uv run pytest -q` | 181 passed; 1 platform-specific test skipped on macOS |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | 94 files formatted correctly |
| `uv run mypy packages/resume-engine/src` | Passed; 41 source files |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:unit` | 66 passed |
| `npm run test:integration` | 13 passed |
| `npm run build` | Passed; 16 static pages and 24 application/API routes built |
| `npm run test:e2e` | 13 passed against the production build |
| `git diff --check` | Passed |

The base resume rendered through the configured LibreOffice renderer as one
page and passed the strengthened layout inspection with no overflow issues.
The environment doctor resolved Python 3.13.15, Codex, LibreOffice, and the
protected base resume.

Changes remain local and uncommitted. No deployment was performed.
