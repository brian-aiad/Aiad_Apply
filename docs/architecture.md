# aiadapplyV2 Architecture

## Boundaries

Codex interprets the role, explains transferability, and generates coherent
section rewrites. Python owns all enforcement and document operations.

Codex receives an untrusted job description as JSON data in an isolated,
ephemeral, read-only workspace. It must return a strict Pydantic-generated JSON
Schema. It never edits the DOCX.

Python enforces:

- protected text and hyperlink equality
- numerical metric equality by semantic section
- section, skill-line, entry, project, and bullet counts
- byte equality for every immutable OOXML package part
- canonical paragraph, run, hyperlink, numbering, and section-format skeletons
- important accepted keyword coverage
- exact semantic paragraph IDs
- one-page PDF output
- per-paragraph rendered line and width budgets
- rendered font inventory, line count, and section-anchor drift
- retry and rollback behavior

## Semantic Document Model

The finalized DOCX is the source of truth. The parser discovers structure from
section headings, organization/project headings, bullet formatting, and skill
labels. Stable IDs such as `skills.apis_identity` and
`experience.original_insurance.bullet.2` are independent of permanent paragraph
numbers.

The writer opens the DOCX as an OPC ZIP package and changes only existing
`word/document.xml` text nodes. Every other part is copied byte-for-byte from
the source. Existing paragraph and run nodes remain in place, so font size,
bold/italic state, margins, styles, spacing, indentation, tabs, hyperlinks,
numbering, embedded fonts, and section geometry cannot drift silently.

`Brian_Aiad_BASE.format.json` is the committed source fingerprint. It records
the package inventory and hashes, semantic paragraph IDs, paragraph/run format
hashes, protected hyperlinks and metrics, and the measured PDF baseline.

## Job Intelligence

The intake parser:

1. normalizes pasted Unicode and line endings
2. identifies the real job-description region
3. separates responsibilities, required qualifications, and preferred
   qualifications
4. extracts the last Simplify high/low keyword panels
5. rejects navigation, recommendations, applicant statistics, legal text, and
   company/footer regions

Keyword grading keeps hiring importance separate from placement utility.
Required/responsibility/title occurrence, repetition, Simplify priority, and
tool specificity add weight. Malformed, generic, legal, and company-marketing
terms receive explainable penalties. Simplify panels are advisory: a panel term
cannot become mandatory without sufficient evidence in the title,
responsibilities, qualifications, or repeated hiring language.
The employer description is always graded independently; an empty or inaccurate
Simplify panel does not prevent the system from extracting role terms.
Sentence-scoped context rules also distinguish positive requirements from
explicit exclusions such as `not a traditional help desk role`, `without`, and
`not required`. Excluded phrases remain visible in the audit but never become
resume targets.

## Evidence Retrieval

Evidence is rebuilt from the base DOCX and the validated candidate profile for
every run. Candidate-confirmed tools may be used in Skills without requiring
them to already appear in the DOCX. Direct terms are tested against source text
and extracted systems/actions. Transfer bridges remain separate from direct
evidence.

Milestone one uses `BAAI/bge-small-en-v1.5` through sentence-transformers and an
in-memory cosine index. Exact direct evidence outranks embedding similarity.
There is no vector database or service dependency.

## Stretch Lab

The strict rewrite plan and review-only development ideas are separate schema
branches. Only `RewritePlan` can reach the DOCX writer. `StretchLab` may contain
transferability questions, unsupported gaps, and proposed personal projects, but
every item is marked non-exportable and the project status is always
`proposed_not_completed`. The pipeline normalizes Codex suggestions against the
accepted job vocabulary and deterministically supplies a small cross-role project
outline when useful. This preserves an aggressive ideation surface without turning
an uncompleted idea into candidate evidence.

## Layout

LibreOffice is invoked headlessly with an isolated user profile and an argument
list, not shell-composed input. The untouched base is rendered before Codex is
called, so the model receives real line and width budgets instead of character
guesses. PyMuPDF measures:

- page count
- selectable rendered lines
- the line count, width, and vertical bounds of every semantic paragraph
- the rendered font names and point sizes
- the Y position of all five section anchors
- the left and right coordinates of every protected, non-editable paragraph
- candidate drift relative to a fresh render of the untouched base

The candidate is rejected when any paragraph exceeds its source line budget or
when any section anchor shifts more than two points. When a candidate wraps,
the engine shortens one paragraph at a time, rerenders, and stops as soon as the
baseline is restored. It never shrinks the entire resume at once.

Before layout selection, overly aggressive model fallbacks are replaced with the
original evidence-rich paragraph. A fallback cannot remove named systems,
protected operating context, or more than 10% of the source paragraph. Rewrites
that add no actual target term are reverted. After a candidate passes, embedded
font binaries are removed from the DOCX and the optimized package is revalidated
against both the protected base and the selected render. On macOS, the renderer
temporarily activates the source document's editable embedded fonts for that final
validation and unregisters them immediately afterward; this prevents LibreOffice
font substitution from invalidating an otherwise equivalent optimized file. This
keeps the final file below the 2.5 MB ATS parse limit without changing its visible
layout.

## Application Tracker

The interface is a Next.js App Router application. It uses the existing Python
tailoring engine through authenticated worker routes. Infrastructure is configurable;
the September 2026 Mac installation uses local PostgreSQL, not shared cloud storage:

- PostgreSQL (local or hosted, including Supabase) stores jobs, applications, daily goals, tailoring runs,
  keyword decisions, paragraph changes, events, and artifact metadata.
- An optional private Supabase Storage bucket stores generated files when configured.
  Every successful worker upload also stores hash/size-verified bytes in
  `artifact_backups`; downloads fall back to those portable bytes when the original
  machine's path and optional object storage are unavailable.
- A local Python worker claims durable database-backed tailoring runs through
  secret-protected server routes and runs the same validated resume engine used
  by the terminal.
- While a run is active, a lightweight authenticated heartbeat keeps both the
  worker status and run lease fresh without adding noisy timeline events.
- During a run, the worker writes best-effort stage events to the application
  timeline; the detail page refreshes automatically until the run completes.
- The browser reads `/api/health` to verify database access, the active base
  resume, and a fresh heartbeat from the local tailoring worker. The UI does not
  claim the system is ready until all three checks pass.
- Product settings persist the daily application target and IANA timezone. Daily
  boundaries are calculated from those settings rather than a hard-coded value.
- Application notes and follow-up reminders share the existing application
  record; search, status filters, and coverage sorting remain client-side because
  this is a bounded single-user dataset.
- Review-only Stretch Lab content is visually and structurally separated from
  downloadable DOCX/PDF artifacts. Only validated artifacts receive the primary
  download treatment.
- Analytics separates tools and domain skills that can be learned from legal,
  clearance, and degree constraints that no keyword rewrite or practice project
  can satisfy.
- The review and tracking interface can run locally or on Vercel. The Python/LibreOffice worker
  stays local because a resume run is longer and more stateful than a Vercel
  function.

The web application never exposes the database password or Supabase service
role to the browser. Production pages and non-worker APIs are protected with
HTTP Basic authentication, while worker APIs use a separate bearer secret.
Robots are instructed not to index the site.

## Discovery and portability

Discovery uses fixed public board endpoints, no login scraping, arbitrary URL
fetches, or Codex calls. Collection is bounded by per-request/overall timeouts,
response size, source concurrency, and description limits. PostgreSQL advisory
locks serialize refresh claims and approvals across processes. An expired refresh
lease can be reclaimed; failed/partial sources never close previously seen jobs.
Only explicit approval creates a normal application, optionally with one queued
tailoring run. Existing resume policy, generation, and validation are unchanged.

Matching uses a compact evidence extract with a tested fingerprint of the base
resume inspection. It screens title family, approximate location, employment,
pay, and evidence overlap. Unknown constraints and specialist requirements remain
review flags. Provider status and limited source coverage are visible in Discover.
The daily refresh is app-open triggered, not an unattended cron service.

Workspace export uses a repeatable-read database snapshot and includes portable
artifact bytes. Restore verifies file integrity and imports in one transaction
only into an empty destination. Git does not carry application data. Two computers
must share the same database for automatic history sync; a backup import is an
alternative one-time transfer, not conflict-resolving synchronization.

## Deferred Infrastructure

- Qdrant and pgvector: the evidence corpus is currently a few dozen paragraphs.
- Redis, pg-boss, and Supabase Queues: one local worker and locked run rows are
  sufficient for the current single-user workload.
- LangGraph or multiple agents: the workflow is linear and deterministic.
- Microsoft Word automation: it is Windows-only and PDF export was unreliable
  on the development machine.
- Pandoc/template regeneration: it cannot preserve the finalized DOCX.
