# aiadapplyV2

Reasoning-based resume transformation for Brian Aiad.

The engine accepts a noisy LinkedIn/Simplify paste, interprets the target role,
maps requirements to the finalized base resume, asks Codex for a structured
rewrite, and exports a validated one-page DOCX and PDF.

## Product Policy

- There is one transformation system, not selectable safety modes.
- Important accepted job terms may be inserted even when direct evidence is
  absent.
- Unsupported and stretched claims are labeled in the transformation report but
  do not block export.
- Name, contact information, organizations, approved titles, dates, locations,
  education, certifications, numerical metrics, sections, entries, and bullet
  counts remain protected.
- The final output basename is always `Brian_Aiad_resume`.

## Pipeline

```text
Raw LinkedIn/Simplify paste
-> source-region parsing and keyword grading
-> target-role profile
-> DOCX-derived evidence graph
-> BGE in-memory semantic retrieval
-> structured Codex review and rewrite
-> protected-content and metric validation
-> byte-preserving OOXML text-node replacement
-> LibreOffice PDF render
-> PyMuPDF paragraph, font, line, width, and anchor validation
-> targeted paragraph compression if needed
-> DOCX, PDF, JSON report, and Markdown report
```

## Setup

Python 3.12+ and [uv](https://docs.astral.sh/uv/) are required. Codex must be
installed and logged in. LibreOffice is the supported renderer on both Windows
and macOS.

```powershell
uv sync --extra dev
uv run aiadapplyv2 doctor
```

Windows renderer path:

```text
C:\Program Files\LibreOffice\program\soffice.com
```

macOS renderer path:

```text
/Applications/LibreOffice.app/Contents/MacOS/soffice
```

The same locked environment is tested on `windows-latest` and `macos-latest`.
On macOS, use forward slashes in the command examples, for example:

```bash
uv run aiadapplyv2 transform \
  --paste-file data/fixtures/floqast_full.txt \
  --output-dir outputs/floqast
```

## Commands

```powershell
uv run aiadapplyv2 inspect-base
uv run aiadapplyv2 inspect-format --output data\resumes\Brian_Aiad_BASE.format.json
uv run aiadapplyv2 parse --paste-file data\fixtures\floqast_full.txt
uv run aiadapplyv2 profile --paste-file data\fixtures\anduril_full.txt
uv run aiadapplyv2 transform `
  --paste-file data\fixtures\floqast_full.txt `
  --output-dir outputs\floqast
```

Successful transformation produces:

```text
Brian_Aiad_resume.docx
Brian_Aiad_resume.pdf
transformation_report.json
transformation_report.md
character_audit.json
```

## Verification

```powershell
uv run ruff format --check .
uv run ruff check .
uv run mypy packages\resume-engine\src
uv run pytest
```
