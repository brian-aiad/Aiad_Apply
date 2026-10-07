# Bullet alignment and Postman overflow — September 22, 2026

The requested fix is consistent formatting after tailoring: bullet continuation
lines align with the first text line, and Postman does not spill onto an indented
Skills continuation line.

## Changes

- The saved DOCX numbering now explicitly places the primary bullet text tab at
  the wrap indent. Previously that tab was added only to the temporary
  LibreOffice rendering copy. The existing compact marker gap is retained.
- Skills overflow repair attempts a valid relocation before removing content.
  Postman can move from APIs & Identity into Tools even when it is a high-priority
  keyword and other skills have lower priority.
- Relocation excludes destinations already measured as overflowing. Removal
  updates shorter variants by skill value instead of assuming both lists use
  the same order.
- The regression check expands Entra ID to Microsoft Entra ID, renders the
  resulting wrapped row, repairs it, and validates the optimized final export.

## Rendered evidence

Local artifacts are in `output/formatting-review-2026-09-22/` (ignored by Git).
These are formatting review copies, not newly model-generated tailoring runs.

- The configured base wording exports on one page with every Skills row on one
  line and a maximum measured bullet continuation offset of 0.0 points.
- A replay of the final accepted Pacific Life document wording passes the same
  checks. Replaying the older report's draft rewrite plan instead exposed an
  expanded project bullet and failed validation; the accepted document was used
  to isolate formatting from those historical plan differences.
- The crowded Skills reproduction initially fails with APIs & Identity on two
  lines. One repair moves Postman into Tools, preserving every skill. The final
  optimized DOCX/PDF passes layout validation. The PDF was visually inspected.

The Python suite passed with 182 tests and one platform skip; Ruff and mypy
passed. Rendering was verified on macOS with LibreOffice. Native Microsoft Word
rendering was not exercised. Existing application artifacts were preserved;
these changes apply to subsequent exports from this local code.

## Retry-path follow-up

Further inspection found that a row restored from the base or selected from a
shorter variant could bypass edits made to the full rewrite plan. The repair
loop now starts with the Skills values actually present in the rendered DOCX
and clears obsolete Skills compression/reversion selectors before writing the
next candidate. Bullet selectors remain independent.

The loop also tracks relocated skill values across render attempts. If a
destination unexpectedly wraps, it cannot send Postman straight back to the
original row. Regression checks cover optimistic width estimates, compressed
rows, and restored rows. The updated full suite passes with 184 tests and one
platform skip; Ruff, formatting, mypy, and whitespace checks pass.

Formatting review artifacts now have an explicit Git ignore rule.

A separate direct render of the saved optimized DOCX bypassed
`_libreoffice_safe_source` entirely. It retained all 13 measured bullet starts,
aligned continuations, single-line Skills categories, and one page. This
confirms that saved numbering carries the alignment fix independently of the
temporary rendering workaround.

## Fresh model-run limitation

A fresh Pacific Life transformation used the normal configured Codex reasoner,
semantic encoder, protected base, and candidate profile. Its first draft failed
because a fallback bullet equaled its primary bullet in length. The automatic
correction then failed the required-keyword check for `configuration`. The
pipeline stopped before exporting an accepted resume. This run is not a
successful live end-to-end evaluation; the source uses `checking configurations`,
while the keyword check requires a literal match. The rejected draft was not
retained, so the source wording alone does not establish what the model omitted.

## Captured draft diagnosis and repair

A second fresh model run retained its raw structured response locally. It
reproduced the first rejection: the primary bullet ended with `and service
performance`, while the fallback used `for service performance`. Both were 192
characters; the source bullet was 168 characters. The pipeline now replaces an
equal-length fallback with the shorter original source bullet when available.
The primary is unchanged, and strict validation and final tailoring review
still run. Equal-length variants without a shorter source still require correction.

Replaying that fresh captured draft through the corrected pipeline produced an
accepted one-page export after six measured document candidates. Review found
that Skills ranking had dropped Postman before overflow repair. Placement now
retains the established tool in Tools when the alternate row has room. This
addresses content removal before rendering as well as wrapping during rendering.

The recorded runner's redundant model correction was terminated once the first
captured draft exported successfully. Its termination log is not another model
quality failure. The successful replay artifacts and audit are separate from
that runner and existing application records.

The final replay under `output/tailoring-review/pacific-life-2026-09-22-final/`
passes both content and layout validation, with six measured document candidates.
All five Skills categories occupy one line, Postman is present in Tools, and the
maximum measured bullet continuation offset is 0.0 points. The final PDF was
visually inspected. The final suite passes with 186 tests and one platform skip;
lint, formatting, mypy, and whitespace checks pass.
