# aiadapplyV2

Evidence-based resume transformation engine for Brian Aiad.

V2 is not a clone of the original `aiadapply` tailor. The original project is a production-safe Application Support resume tailor. This repo is the next architecture: paste a messy LinkedIn/Simplify job page, identify the target role, map the job to Brian's real evidence, generate a rewrite plan, and label every risky or unsupported claim before exporting a resume.

## Product Goal

```text
LinkedIn/Simplify paste
-> parse job and keyword panel
-> build TargetRoleProfile
-> map job requirements to ResumeEvidenceGraph
-> produce TransferabilityMap
-> generate RewritePlan
-> label unsupported/stretched claims
-> render DOCX/PDF after review
```

## Why V2 Exists

The current `aiadapply` system protects a fixed Application Support base resume. That is useful for application-ready output, but it is not the same as transforming Brian's resume around any job description. V2 adds a separate intelligence layer:

- role identity extraction
- semantic evidence matching
- cross-domain transferability mapping
- risk labels for stretched or unsupported terms
- transformation modes: `production`, `hybrid`, `transformation_draft`

## Initial Tech Choices

- Python 3.12+ for the resume engine.
- Pydantic v2 for strict schemas and structured AI outputs.
- Typer/Rich for a CLI-first workflow.
- Qdrant or PostgreSQL + pgvector planned for semantic evidence search.
- Next.js planned for the review UI after the engine stabilizes.
- DOCX/PDF rendering will reuse lessons from `aiadapply`, but without hardcoded paragraph numbers.

## Current Milestone

This repo currently contains the first CLI-testable skeleton:

```powershell
cd C:\Users\kingt\Desktop\aiadapplyV2
python -m pip install -e .[dev]
aiadapplyv2 parse --paste-file data\fixtures\floqast_sample.txt
aiadapplyv2 plan --paste-file data\fixtures\floqast_sample.txt --resume-file data\resumes\brian_application_support_base.json
pytest
```

The first milestone is not DOCX generation. It is proving that V2 can parse the job, classify the role, map evidence, and produce risk-labeled rewrite intent.

