# Open-Source Research

No external resume application was copied into this repository. Their useful
design patterns were evaluated and reimplemented against the stricter
existing-DOCX requirement.

## Resume Matcher

Repository: https://github.com/srbhr/Resume-Matcher

Adopted concepts:

- allowlisted structured changes
- content-hash guards
- prompt-injection isolation
- structured-output retry behavior
- deterministic post-generation checks

Deferred:

- its web UI, database, provider abstraction, and browser test stack
- template generation, because this project mutates a finalized DOCX

## resuml

Repository: https://github.com/phoinixi/resuml

Adopted concepts:

- requirement-region weighting
- positive skill taxonomy matching
- longest-first phrase matching and acronym awareness
- separate parsing, match, and recruiter concerns

Deferred:

- JSON Resume rendering and theme infrastructure

## resume-tailoring-skill

Repository: https://github.com/varunr89/resume-tailoring-skill

Adopted concepts:

- direct, transferable, adjacent, and gap classifications
- explicit semantic bridges
- impact and placement reasoning

Changed:

- unsupported terms remain exportable under this product's configured policy,
  but they receive explicit risk records

## Resume AI

Repository: https://github.com/resume-llm/resume-ai

Adopted concept:

- strict structured LLM boundary before document generation

Deferred:

- Ollama, MLflow, PostgreSQL, Kanban UI, and Pandoc because none solves the
current milestone's preservation or validation requirements

## Proficiently Claude Skills

Repository: https://github.com/proficientlyjobs/proficiently-claude-skills

Adopted concepts:

- keep the raw posting, tailored artifact, and audit report together per run
- treat a durable work-history profile as separate from generated resume text

Deferred:

- browser automation, job discovery, cover letters, and application submission
- its Claude-specific plugin runtime because V2 uses Codex and a local CLI

## Current Resume-Matching Projects

Also evaluated:

- https://github.com/mugunthank7/MatchMyJD
- https://github.com/Samitha-Edirisinghe/AI-Powered-Resume-Matching-System-CV-Embed
- https://github.com/fosetorico/resume_ATS_scanner

Their evidence-aware scoring and SBERT retrieval support V2's current
requirement/placement scoring and BGE cosine retrieval. Their Flask/Streamlit
frontends, multiple embedding-model switches, external datasets, and hosted LLM
providers do not improve exact DOCX preservation, so they were not added.

## Current LinkedIn Role Fixtures

Independently sourced, paraphrased regression fixtures cover:

- Daybreak Application Support Engineer:
  https://www.linkedin.com/jobs/view/application-support-engineer-at-daybreak-4351888992
- Jobgether Product Support Engineer:
  https://www.linkedin.com/jobs/view/product-support-engineer-at-jobgether-4424053947
- Cartesia Product Support Engineer:
  https://www.linkedin.com/jobs/view/product-support-engineer-at-cartesia-4436176399

These are parser and role-intelligence fixtures, not copied resume content.

## Runtime Technologies

### Next.js App Router and shadcn dashboard patterns

References:

- https://nextjs.org/docs/app
- https://ui.shadcn.com/blocks

Used for server-rendered route structure, responsive dashboard composition, and
accessible component patterns. No shadcn theme or generated dashboard block was
copied; the visual system and components are repository-native.

### openstatus data-table filters

Repository: https://github.com/openstatusHQ/data-table-filters

Its URL-driven filter and compact table patterns informed the application list.
The dependency was not added because the tracker needs only a small fixed set of
statuses and filters.

### Supabase platform

References:

- https://supabase.com/docs/guides/database
- https://supabase.com/docs/guides/storage
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/queues

Postgres and private object storage are used. Supabase Queues was evaluated but
not added: durable tailoring rows already provide inspectable retry history and
safe single-worker claiming without another operational abstraction.

### Prisma connection management

Reference: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections

Prisma provides the typed server-side data model. The hosted application uses
the existing Supabase pooler connection so serverless deployments do not open a
dedicated database connection per request.

### Pydantic v2

Problem solved: strict schemas at every LLM and pipeline boundary.

Milestone one: required. Low runtime and maintenance cost.

### python-docx, lxml, and lxml-stubs

Problem solved: semantic inspection, canonical format fingerprinting, and
surgical text-node mutation of existing OOXML. Stubs keep strict type checking
at the XML boundary.

Milestone one: required. Moderate maintenance because DOCX structure must remain
covered by golden tests.

### sentence-transformers with BGE

Problem solved: cross-domain evidence retrieval beyond exact strings.

Milestone one: required. Moderate install/model cost; no service maintenance.

### LibreOffice

Problem solved: reproducible Windows/macOS DOCX-to-PDF rendering.

Milestone one: required. External desktop dependency, low application
maintenance.

### PyMuPDF and NumPy

Problem solved: page, line, text, link, coordinate, and visual-baseline
inspection.

Milestone one: required. Low maintenance.

### uv

Problem solved: reproducible Python dependency resolution across Windows and
macOS through `uv.lock`.

Milestone one: required. Low maintenance.

### Codex CLI

Problem solved: mandatory contextual role interpretation and structured rewrite
reasoning using the user's existing Codex authentication.

Milestone one: required. Moderate operational cost; deterministic validation
contains its output.
