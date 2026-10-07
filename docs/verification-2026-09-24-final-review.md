# Final export and review placement verification — September 24, 2026

Continued the technology-placement work recorded in
`verification-2026-09-24-technology-rule.md`.

## Corrections

- Final claim-risk flags now check their selected paragraph. A Python assumption
  removed from Loavenly during layout repair no longer survives merely because
  Python remains in an employer bullet or Skills. Document-wide legacy flags
  retain their document-wide scope. Non-keyword semantic risks remain conservative.
- Specific service names take precedence over umbrella keywords when matching
  review flags: an AWS mention cannot preserve a removed AWS S3 assumption.
- Keyword-decision explanations use final project placements. They identify the
  exact project paragraph for an unverified adaptation, or disclose that the
  required adaptation is absent even if another section still contains the term.
- After font optimization, the final DOCX's paragraph identifiers and text must
  exactly match the candidate that passed content and coverage review. Any change
  fails export before an accepted report is written. Existing final rendering and
  one-page geometry checks remain in place.
- ESLint and Git ignore the isolated `.next-verification` build directory.

## Verification

- Full Python suite: 230 passed, one platform skip. Includes actual DOCX/PDF
  pipeline rendering, successful export, and an injected optimizer text mutation
  that must fail without writing an accepted report.
- New review regressions cover removed project Python with retained employer/Skills
  mentions, surviving exact project assumptions, and AWS versus AWS S3.
- Web unit tests, ESLint, and TypeScript checks passed.
- Ruff lint/format checks over `packages` and `scripts`, mypy (43 source files),
  and Git whitespace checks passed. Repository-wide Ruff also discovers an older
  unformatted scratch script under `output/technology-rule-verification`; historical
  verification artifacts were left intact.

These changes apply to future transformations through the shared pipeline.
Historical accepted resumes and reports were not regenerated. No new real
application or paid model generation was needed for these regression checks.
