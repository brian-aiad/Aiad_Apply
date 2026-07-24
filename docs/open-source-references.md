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

## Runtime Technologies

### Pydantic v2

Problem solved: strict schemas at every LLM and pipeline boundary.

Milestone one: required. Low runtime and maintenance cost.

### python-docx and lxml

Problem solved: semantic inspection and surgical mutation of existing OOXML.

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
