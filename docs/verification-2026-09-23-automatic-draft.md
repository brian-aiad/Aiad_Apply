# Automatic technology drafting — September 23, 2026

All future dashboard, Discover, and terminal tailoring uses aggressive editable draft
mode by default. A posting's accepted technologies are selected automatically;
the eight strongest additions lacking project evidence are required in existing
project bullets. Additional technologies may be added where the one-page layout
allows. The engine keeps these posting-derived adaptations separate from saved
candidate evidence and marks them for review in the app and report. No individual
technology confirmation is required to generate a draft. The user edits the
downloaded DOCX before applying.

## Fresh Mendix verification

Application: <http://localhost:3000/applications/c6c8db7e-abc5-41f4-b79d-ef3d6fafe051>
Run: `aa5154c4-843c-45e2-bee7-4b9d7ddfaebe`. Source base SHA-256:
`d47bc9300f046c3df1026b44556adb3692e2fe5246c98483159efef3db027189`.

The run used a fresh Codex rewrite with explicit feedback from an earlier measured
draft that overflowed a one-line Loavenly bullet. The accepted version put
Mendix, low-code, and JavaScript in Loavenly bullet 1; Java and APIs in bullet
2; and AWS, Azure, and Kubernetes in bullet 3. All eight required project terms
survived the final render. The unsupported insurance reproduction wording was
removed. The existing source details, dates, metrics, bullet count, and template
formatting passed validation. The profile was not updated with draft assumptions.

Playwright clicked the actual application DOCX and PDF links and saved both
downloads. Their hashes match the final engine output. The downloaded DOCX was
rendered again with the configured LibreOffice renderer. The DOCX render and
downloaded PDF both pass the measured baseline layout: one page, all 13 bullet
starts and continuations aligned, five single-line Skills rows, and Postman
preserved. Both rendered pages were visually inspected. Paragraph/run formatting,
numbering XML, and original base geometry match the edited source.

| File | SHA-256 |
| --- | --- |
| DOCX | `af3a6e4f63a4984896c4e725bfe54cced0337fb390e704657c658275c71e2b6c` |
| PDF | `514f2896c5a90d161bc6e41ee7c86cc08890df96a913c10cbb6800af42c4bf6c` |

209 Python tests passed, one platform test skipped. 70 web unit tests and 14
integration tests passed. Ruff, mypy, web lint/typecheck, production build, and
Git whitespace checks passed. The local worker was reloaded with the final code
and its health endpoint reports ready.

These technology additions are editable drafting assumptions. The application
shows them before download and in each paragraph's review. They should be checked
against completed work before the résumé is submitted.
