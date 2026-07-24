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
- important accepted keyword coverage
- exact semantic paragraph IDs
- one-page PDF output
- rendered line count and section-anchor drift
- retry and rollback behavior

## Semantic Document Model

The finalized DOCX is the source of truth. The parser discovers structure from
section headings, organization/project headings, bullet formatting, and skill
labels. Stable IDs such as `skills.apis_identity` and
`experience.original_insurance.bullet.2` are independent of permanent paragraph
numbers.

The writer changes text inside existing paragraphs and runs. It does not rebuild
the file or globally alter font size, margins, styles, spacing, indentation,
tabs, hyperlinks, or section geometry.

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
terms receive explainable penalties.

## Evidence Retrieval

Evidence is rebuilt from the base DOCX for every run. Direct terms are tested
against source text and extracted systems/actions. Transfer bridges are
represented separately so they can never be mislabeled as direct evidence.

Milestone one uses `BAAI/bge-small-en-v1.5` through sentence-transformers and an
in-memory cosine index. Exact direct evidence outranks embedding similarity.
There is no vector database or service dependency.

## Layout

LibreOffice is invoked headlessly with an isolated user profile and an argument
list, not shell-composed input. PyMuPDF measures:

- page count
- selectable rendered lines
- the Y position of all five section anchors
- candidate drift relative to a fresh render of the untouched base

When a candidate wraps, the engine shortens one paragraph at a time. It chooses
the highest-pressure paragraph before the first shifted section, rerenders, and
stops as soon as the baseline is restored. It never shrinks the entire resume
at once.

## Deferred Infrastructure

- Qdrant and pgvector: the evidence corpus is currently a few dozen paragraphs.
- Redis: no distributed job queue exists.
- LangGraph or multiple agents: the workflow is linear and deterministic.
- FastAPI/Next.js: CLI validation precedes a review UI.
- Microsoft Word automation: it is Windows-only and PDF export was unreliable
  on the development machine.
- Pandoc/template regeneration: it cannot preserve the finalized DOCX.
