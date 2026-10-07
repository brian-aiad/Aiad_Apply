# Persistent tailoring preference

Read `docs/resume-export-rules.md` before changing tailoring, prompts, validation,
review UI, or export/audit tools.

The user's latest preference supersedes the earlier aggressive project policy:
- Rewrite relevant experience bullets only when doing so adds meaningful supported
  fit; preserve real duties, systems, metrics, employers and the one-page layout.
- Tailor relevant Loavenly bullets around actual intake, inventory, access,
  troubleshooting or reporting when useful; no minimum number of project changes.
- Keep Loavenly believable and grounded in its actual food-bank operations purpose
  and supported implementations. Do not force every posting technology into it.
- Plausibility alone is not evidence of usage. Do not invent Salesforce, Zendesk,
  Qualtrics or other tool implementations simply to improve keyword coverage.
- Employer experience and Skills-only knowledge do not establish arbitrary project
  implementations. The standing automatic technical policy below authorizes ordinary
  use of common development technologies in matching duties; specialized implementations
  still require specific evidence.
- Future extensions may appear as clearly proposed Stretch Lab ideas, not completed
  claims in exported resumes. Do not change factual candidate evidence from a draft.
- Capture, Discover, retry, worker and terminal use evidence-based tailoring by default.
  The old aggressive flag exists only for explicit historical/audit compatibility.
- Preserve bullet count, one-page template and protected facts. Substantively rewrite
  relevant bullets without demanding artificial changes to unrelated project bullets.
- Historical artifacts stay intact. New versions use the current policy; older
  hypothetical project drafts need explicit review before applying.

Runtime policy lives in `packages/resume-engine/src/aiadapply_v2/`, especially
`reasoning/codex.py`, `planning/coverage.py`, `planning/quality.py` and `pipeline.py`.

# Application assistance preference

Latest application workflow (October 6, 2026; supersedes earlier submission and
resume-review preferences): tailor first, then require the user's explicit
approval of the exact job-specific resume. That approval authorizes filling and
submitting that one employer application. After the attempt, report whether the
employer confirmed submission, questions/answers encountered, and anything
unresolved. Prior review-only acknowledgements do not authorize submission.

- Bind approval to application, run, PDF artifact hash and destination URL.
  Recheck before browser work and before the final click. Never substitute the
  base resume, another job's resume or a helper's default upload. Verify uploaded
  bytes and the final attachment/unique uploaded filename.
- Mark Applied only after an explicit new employer receipt is observed. Persist
  a submission-start boundary before clicking; interrupted/uncertain submission
  must not auto-retry. Surface missing facts, login/CAPTCHA and unsupported forms.
- Fill known eligibility and demographic answers only from explicit saved facts;
  draft writing from the approved resume and posting. Do not invent missing facts,
  citizenship, consent, credentials or years of experience. Preserve existing
  answers and stop on conflicts. Use job-specific compensation judgment with
  correct pay period/currency; ask when a required numeric answer lacks a basis.
- Candidate is immediately available, flexible on work arrangements/location,
  and has no clearance. Contact/eligibility profile is saved in the app; additional
  private onboarding facts are in ignored `.runtime/application-onboarding.json`.
- Use local Playwright and the existing Codex subscription. No paid API fallback.
  The browser has a dedicated persistent Chrome profile. The legacy Simplify and
  AiadApply Assistant manual paths remain optional; they never imply submission.

# Meaningful tailoring preference (October 5, 2026)

- Use GPT-6 Astra for tailoring. No edit quotas or mandatory project rewrites.
- Preserve strong existing bullets; change wording only for supported posting
  coverage or concrete role-relevant clarity. Do not shuffle Skills or synonyms
  merely to show changes.
- Infer ordinary transferable skills from actual documented duties without
  repetitive questions. Preserve rejected experience and technical source scope.
- Newly added keywords should appear in purple inside final review paragraphs,
  matching keyword chips. Stretch Lab is version-specific; saved profile decisions
  inform future runs on this installation and never rewrite historical artifacts.

## Everyday technology knowledge (October 5, 2026, latest instruction)

Brian's latest clarification: treat basic school and everyday tools such as
Excel, Microsoft Office, Google productivity apps and common AI assistants as
known without repeated confirmation. Use the profile's `everyday_tools` in
relevant bullets as needed when the pasted posting requests them and doing so
improves fit. Permission is not a requirement that every mentioned tool appear;
there are no mandatory placements or unrelated-bullet edit quotas. Use natural
professional wording, without unnecessary classroom/familiarity qualifiers.
Tableau remains authorized for ordinary reporting/reconciliation assistance.
Preserve actual duties, systems, outcomes, metrics, and the one-page layout.
Do not invent advanced features, integrations, deployments or tool-caused results.
Complex systems such as Salesforce still require evidence. CS/school knowledge
is not blanket evidence for every specialized technology: preserve source scope
and explicit rejections; Google productivity knowledge is not Google Cloud.
Apply this policy to future Capture, Discover, retry, worker, terminal and
application-preparation runs. Historical artifacts remain unchanged.


## Established technical use (latest correction; supersedes Skills-only restrictions)

Brian confirms common coding languages and development tools, including Go and
Rust, APIs/REST APIs, webhooks, databases, Git, Linux, routine AWS and CI/CD.
When the pasted posting requests an established technology, automatically weave
it into one matching existing work or project bullet. Skills-only coverage is
insufficient when a matching duty exists. Do not ask again or qualify it as
classroom/familiarity knowledge. The profile's established_technologies records
this standing permission; it is candidate confirmation, not a degree-based guess.
Preserve that coverage in primary, shorter and final rendered text; boundedly
repair lost coverage or fail explicitly. No unrelated edits or per-project quota.
Match actions to duties: API/webhook troubleshooting, Python scripting, CI/CD
build/test/deployment, AWS deployment/support. Preserve actual systems, outcomes,
metrics and one-page layout. Do not invent specific AWS services, hosting changes,
migrations, new results, or a wholesale project stack/language change. Use Go/Rust
for matching ordinary coding duties when requested; no repeated confirmation.
CAD, specialized enterprise systems, and advanced infrastructure products
still need evidence. Explicit rejections override this permission.
Apply to Capture, Discover, retry, worker, terminal and application preparation.
Review should label established technologies automatic, not ask for confirmation.
Historical artifacts retain their original text and placement reports.

The final clarification is OPEN-ENDED: this is a standing automatic policy for
every future paste, not a whitelist of named technologies. With the profile's
automatic_technical_policy enabled, assess each previously unassessed posting
technology and requested depth as common development, specialized/advanced, or
unrelated. Common languages, libraries/frameworks, databases, source control,
CLI tools, testing and routine cloud/build/deployment methods receive natural
matching-duty placement automatically, ranked by ATS/posting importance.
The model returns version-specific technology_assessments with relevant duty IDs
and a usage boundary. Validate them before using their contexts; require one
meaningful placement for common tools. Novel names must be judged, not rejected
merely for being absent from a catalog. Named tools are examples/fast paths.
Do not promote generated assessments into historical profile facts. Explicit
rejections, protected facts, one-page layout and specialized/advanced boundaries
remain. No repeated basic-tool questions in review or Stretch Lab.

## Application workflow clarification (latest October 6 instruction)

Discover may search and tailor automatically, but Brian manually approves each
job-specific tailored resume, then presses Auto apply to authorize filling and
submitting that one application. Do not enable standing automatic submission of
unreviewed future resumes. Employer-visible uploaded PDF names use the original
resume name with no version or hash prefix. Keep run/hash/attempt identity internal;
verify actual uploaded bytes and a fresh attachment proof, never filename alone.
Reusable personal application answers live in the saved application profile and
private ignored onboarding file. Use confirmed employer-specific history and
update it after actual submissions; do not confuse prior employment with prior
applications. Ask only for material missing facts, conflicts or unusual commitments.

## Free-only services and reusable application answers (latest instruction)

Use only free service tiers and the existing Codex subscription unless Brian
explicitly authorizes additional charges. Do not enable paid upgrades, metered
API fallbacks, paid trials, or new subscriptions automatically.
Reuse saved confirmed application answers without asking again. Brian authorizes
reading application-related verification messages and receipts from his connected
application email when access is available; installation alone is not verified
mailbox access. Preserve manual approval of each tailored resume followed by
Auto apply. Verify exact approved PDF bytes and attachment before submission,
and an employer receipt before reporting Applied. Check uncertain prior attempts
for receipts before retrying; never infer submission from email connection.
