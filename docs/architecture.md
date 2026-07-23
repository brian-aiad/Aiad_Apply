# aiadapplyV2 Architecture

## Mission

V2 is a role-transformation resume engine. It should decide what Brian's resume should become for a job, not merely whether a keyword can fit into the current resume.

## Operating Modes

`production`
: Conservative, application-ready, blocks unsupported hard skills and credentials.

`hybrid`
: Aggressive narrative rewrite while still blocking fake hard tools/certs.

`transformation_draft`
: Maximum role-specific transformation. May include unsupported terms, but must label them as `unsupported` or `human_confirm`.

## Core Data Flow

```text
RawPaste
  -> ParsedJob
  -> TargetRoleProfile
  -> ResumeEvidenceGraph
  -> TransferabilityMap
  -> RewritePlan
  -> RiskReport
  -> ReviewedResume
  -> DOCX/PDF
```

## Technology Direction

### Pydantic

The engine is schema-first. Every AI-facing object must be strict enough to validate before the next stage runs. Pydantic is used for runtime validation and future structured-output contracts.

### Semantic Search

V2 will add vector search after the deterministic baseline works. Candidate technologies:

- Qdrant for a dedicated open-source vector database.
- PostgreSQL + pgvector if the project wants fewer services.

The evidence search task is:

```text
"technical writing" -> incident documentation / KB articles / escalation notes
"failure analysis" -> root cause analysis / production incident diagnostics
"systems integration" -> API integration / carrier feeds / webhooks
"access governance" -> RBAC / SSO / Entra ID / permissions
```

### LLM Structured Outputs

The model should not directly edit a DOCX. It should emit JSON:

- `TargetRoleProfile`
- `EvidenceMatch`
- `RewriteCandidate`
- `RiskFlag`

The renderer consumes approved structured content later.

## Reused Lessons From aiadapply

Keep:

- messy LinkedIn/Simplify paste parsing
- coverage scoring
- DOCX/PDF generation discipline
- one-page guard
- changelog/audit model
- protected facts

Change:

- no hardcoded paragraph numbers as the core abstraction
- no single Application Support identity guard
- no silent keyword insertion without risk label
- no LLM pass-through masquerading as reasoning

