# Windows continuation — October 13, 2026

Read this first when continuing AiadApply on Windows. Brian explicitly requested
committing and pushing the current work to `main` for this device handoff.
Earlier dated “do not commit/push” notes describe prior instructions and are
superseded for this checkpoint. No deployment was requested.

## Read order and current intent

1. `AGENTS.md`
2. This file
3. `docs/linkedin-verification-2026-10-13.md`, especially its final checkpoint
4. `docs/FULL_PROJECT_HANDOFF.md`
5. `docs/resume-export-rules.md`
6. `docs/application-automation.md` and `docs/discovery-search-improvements.md`

Brian needs realistic local jobs quickly. He wants LinkedIn Premium + employer
feeds → Discover → factual automatic tailoring → exact resume Review/approval →
Auto Apply → employer-confirmed receipt. Do not redesign or rebuild existing
features. He dislikes repeatedly providing saved facts or individual job URLs.

Latest conversation: Brian asked whether copy/paste followed by automatic
tailoring is a better approach. The recommendation was a reliable full-posting
paste path, with direct feeds and LinkedIn capture as additional sources. That
was a recommendation, not an instruction to remove LinkedIn or an implementation
of a new paste-first interface. His next instruction was this commit/handoff.

Strict discovery rules remain starting base pay >= $60K/year, confirmed full-time,
confirmed selected worksite <= 30 miles from Seal Beach, remote disabled. Unknown
salary and optimistic salary midpoints do not qualify. Actual duties outrank
LinkedIn badges. Use the saved settings; never reset them.

## What works now, with actual results

The current user-open LinkedIn search was captured locally on Mac: **25 cards
on its first page**, not all 99+ results. The actual selected full description
was Kahana Feld even though a card elsewhere said “Selected” for CGS. Always
verify the detail ID; never associate one job's description with another card.

Three real tailored applications are REVIEW with SUCCEEDED runs, one-page
validation and verified PDF hashes:

| Company / role | Application ID |
| --- | --- |
| Radiometer / Application Support Consultant | `eacdfe0e-2771-47a7-9196-d0854a1a73d5` |
| Kahana Feld / Enterprise Applications Specialist | `d984be66-e90a-4ca7-9348-920ab0a64e06` |
| Otter / Middleware Solutions Engineer I | `baca9d25-80b1-4de7-8d24-96f7ff4f2880` |

Open `/applications/<id>` in the Windows dashboard. These have not been approved
for submission or submitted in this pass. Use the existing normal review and
Auto Apply workflow. Do not create another tailoring run just to move devices.

Pacific Life R17313 / LinkedIn 4479033768 links to existing application
`fc0f0e63-b817-4605-8dc9-0efd5d78b9c3`; no duplicate was created. Preserve older
records too. Mortgage Office requires five years and remains excluded. SchoolsFirst
has an ambiguous pay period and specialist requirements; do not assume hourly
pay or manufacture matching experience. Full descriptions from verified employer
sources were used where available. Original dates were preserved; older postings
were manually tailored under Brian's specific request, not made artificially fresh.

## LinkedIn state: distinguish three capabilities

1. **Automated dedicated-browser collector:** last live result HTTP 429; no
   successful automated extraction. Persisted retry time was
   `2026-10-14T01:26:39.081Z` (October 13, 6:26 PM Pacific). Check actual current
   state and clock; do not clear cooldown or evade access restrictions. After it
   expires, confirm normal access and inspect one job before a full cycle.
2. **Mac assisted open-page capture:** live verified. Native Chrome save creates
   temporary MHTML, parsed offline with JavaScript disabled and all requests
   aborted. It does not navigate jobs or clear a block. Discover's
   “Capture my open search (Mac)” saves cards and an identity-verified selected
   full description. This helper is explicitly macOS-only.
3. **Pasted full job import:** existing cross-platform fallback. One search-results
   paste normally contains many cards but only one complete description. Do not
   report every card as a fully extracted or tailored job.

Relevant implementation already exists:

- `apps/web/scripts/linkedin-discovery.mjs`: deterministic collector/extractors.
- `apps/web/scripts/capture-open-linkedin.py`, `linkedin-open-search.mjs`: Mac
  assisted capture; do not invoke the Python helper on Windows.
- `apps/web/src/lib/discovery/linkedin*.ts` and `linkedin-search.mjs`: ingestion,
  normalization, canonical destinations, policy, shared queue/scan state.
- `apps/web/src/components/linkedin-discovery-panel.tsx`, `discovery-board.tsx`.
- `scripts/start-linkedin-review.ps1`: Windows dedicated Chrome launcher,
  profile ownership/port/launch-lock checks. Not live-tested on Windows here.

Shared Setting `discovery:linkedin:assisted-capture` holds the 25 normalized
cards. `discovery:linkedin:config` holds the preferred search; preserve it:

`https://www.linkedin.com/jobs/search-results/?distance=35&f_SAL=f_SA_id_226001%3A272015&f_TPR=r604800&geoId=104234982&keywords=Application+Support+Engineer`

LinkedIn's 35-mile search envelope never overrides the app's 30-mile limit.
Exact next job IDs are known: CGS **4478149382**, JPMorgan **4446316594**. Full
descriptions/employer destinations remain unresolved. Do not ask Brian to find
these URLs again. Other captured IDs are available in the shared card data.

## Windows setup and private items

Pull `main` from `https://github.com/brian-aiad/Aiad_Apply.git`. In an existing
checkout inspect `git status` before pulling; preserve any local Windows edits.

Install/use Node 22, uv/Python 3.13, Chrome, LibreOffice, and Codex CLI. Sign into
Codex locally using the existing subscription. No model API key or new paid
service is required. From the repository:

```powershell
uv sync --extra dev
cd apps/web
npm ci
cd ../..
uv run aiadapplyv2 doctor
```

Use `Start AiadApply.cmd` for dashboard/tailoring startup. Resolve actual doctor
errors before starting work; do not assume Mac processes/PIDs exist on Windows.

These intentionally do not travel through Git:

- `apps/web/.env`: use the existing Windows configuration if correct, otherwise
  privately transfer the actual shared DATABASE_URL, DIRECT_URL, WORKER_SECRET
  and other required settings. Do not print values or put them into this file.
- `.runtime/application-onboarding.json`: private supplemental saved answers.
  Most profile/settings/history are already shared database records.
- Any custom base resume selected by `AIADAPPLY_BASE_RESUME`. The repository's
  canonical base is `data/resumes/Brian_Aiad_BASE.docx`; preserve the actual
  configured source. Replace Mac-specific output/base paths with Windows paths.
- Gmail worker OAuth credentials: default `.runtime/application-gmail-oauth.json`
  was **absent on this Mac**. Connected ChatGPT Gmail is not proof of worker OAuth
  access. Configure through the documented `npm run gmail:connect` flow only if
  authorized OAuth client configuration is available. Never claim it is working
  without testing. No missing credential has been fabricated or committed.

Database jobs, profile/settings, imported postings and successful artifact bytes
are shared when Windows uses the same database. Browser cookies/sessions, local
files, Codex login, worker identity and OS permissions are device-local. Test a
PDF download from an existing review on Windows before trying any new tailoring.
Never reset, seed, or restore over the shared database.

Do not copy `.venv`, `node_modules`, `.next`, the whole `.runtime`, browser
profiles, pending worker claims/outboxes, or PID/lock files. Sign into the
dedicated Windows browser separately. Keep only one configured collector and one
application browser worker active for the workspace; do not race the Mac.

**Native Windows Auto Apply remains an implementation/verification limitation:**
`scripts/run-application-worker.py` imports Unix `fcntl`, and its launcher is a
shell script. Dashboard/tailoring portability does not prove application-worker
portability. Do not claim native Windows Auto Apply or WSL is verified. Fix and
test OS locking/startup deliberately if Brian prioritizes it. The Mac-only email
OCR uses Swift/Vision; the fallback requires locally installed Tesseract and has
not been live-verified on Windows.

## Guarantees and work to preserve

- Existing Codex subscription, GPT-6 Astra/high for tailoring; no new API bill.
- LinkedIn automatic tailoring max ten new jobs/Pacific day, shared pending
  capacity four. Existing transaction/deduplication logic remains authoritative.
- Filter deterministically before model calls. Do not treat Top Applicant or
  Simplify keyword scores as hiring probability or hard-constraint overrides.
- Review exact job-specific PDF before Auto Apply; bind application/run/artifact/
  hash/destination and verify attachment bytes. New employer receipt alone marks
  automated submission successful. UNKNOWN attempts must not auto-retry.
- RTX/Collins referral-only, including retries. Contacts/outreach drafts only.
- Preserve the other-terminal Gmail/OCR, navigation-recovery, final-result and
  tailoring-plan repair work included in this checkpoint; do not remove it just
  because this thread focused on LinkedIn.

## Verification and next work

Fresh Mac checks before this handoff: 226 web unit tests; typecheck; full ESLint;
production build (one broad file-tracing warning); Ruff for new capture helper;
900px live dashboard checks; actual saved PDFs/hash/page validation; native
open-page capture and local API HTTP 200. Full earlier isolated DB/browser/Python
suite results are recorded with dates in the verification document. No fresh
Windows execution was performed. Do not relabel fixtures as live LinkedIn tests.

Next session: confirm checkout/config/doctor, view the three existing Review
applications, and verify PDF download. Then continue Brian's chosen capture/paste
and discovery workflow. Keep the existing collector cooldown and actual job
constraints. Remaining full-description extraction for the captured list is not
complete; do not call this an autonomous all-jobs pipeline yet.
