# Techaxis technology placement — September 24, 2026

Recovered the interrupted terminal session and verified its completed final draft.
Application: <http://127.0.0.1:3000/applications/ba5c327f-f0fb-4e0d-89ec-37157eb84800>.
Accepted run 3: `81517548-a157-4797-8264-eead68abac79`.

The final Astra medium draft completed in approximately five minutes with one
model call, one document candidate, one page, and 87.11% internal keyword coverage.
This coverage is not an external ATS score. Relevant technologies appear across
the three Loavenly bullets: AWS ECR, Kubernetes, Harness CI/CD, and AWS S3 in
deployment/storage; AWS SNS in notifications; Alteryx, Python, R, Airflow, and
PL/SQL in reporting and validation. Original Insurance retains its supported SQL,
Python, Postman, Microsoft identity, integration, and SaaS context.

The permanent rules require project placement, collapse overlapping umbrella
terms, distribute larger stacks across project bullets, and exclude unrelated
physical systems. Regression coverage includes MATLAB versus CNC/electrical
schematics. Posting-derived project implementations remain unverified draft
assumptions, separate from saved candidate evidence.

## Download and layout verification

Playwright clicked the application's actual DOCX and PDF links. Both saved files
match the final engine artifacts by SHA-256:

| File | SHA-256 |
| --- | --- |
| DOCX | `997893635945cc01869552efcf7fb24009af116c813c51b7eef08f2202a379b2` |
| PDF | `f760827e685b9297926351a59fafd5dff108f17bfd5f77db5b9ab39638e6ef41` |

The downloaded DOCX was rendered with LibreOffice using the current base's fonts.
Both the downloaded PDF and the DOCX re-render passed measurement against the
current base: one page, all 13 bullet starts aligned, aligned continuation lines,
five single-line Skills rows, no overlap/boundary issues. Both were visually
inspected. Local evidence is under `output/playwright/techaxis-downloads/`,
including `verification.json`. The original output remains under
`output/techaxis-final/2026-09-24_Techaxis_Inc_L3_Production_Support_Engineer/`.

## Follow-up fixes

- The web parser mistook the generic “About us” heading for the employer, showing
  company `us` and title `Techaxis, Inc.`. Exclude generic company/about headings;
  add a regression using the actual Techaxis fixture. Corrected only that saved
  record's company/title and confirmed them in the browser.
- Automatic project draft flags incorrectly relabeled supported employer Python
  and SQL placements as unsupported. Scope draft permission and generated flags
  to each target's allowed project paragraphs. A regression confirms employer
  evidence stays intact while the new project usage remains flagged.
- Historical run 3 retains its original audit with 14 flags, including those
  overly broad employer flags. The fix applies to future runs; accepted artifacts
  and historical audit data were not silently rewritten.

## Checks

The recovered suite passed 217 Python tests with one platform skip. After the
follow-up fix, all nine automatic-draft tests passed, including the new regression.
All 71 web unit tests passed. Ruff lint/format, mypy, web lint/typecheck, production
build (isolated `.next-verification` directory), and Git whitespace checks passed.
Local services were restarted with the updated engine;
health reports the database, base resume, and worker ready, with zero active runs.
