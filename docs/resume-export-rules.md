# Rules for every tailored resume

These rules apply to dashboard, Discover, and terminal tailoring through
`transform_resume`. They are export requirements, not optional visual polish.

## Content

The user's latest correction supersedes the previous aggressive project policy.
More tailoring means better use of real experience, not more invented technologies.

- All normal Capture, Discover, retry, worker and terminal runs use evidence-based
  tailoring. Preserve Loavenly's actual food-bank SaaS purpose and supported stack.
  Do not force posting tools into the project merely to satisfy keyword coverage.
- Tailor only when a change adds supported posting coverage, clarifies a relevant
  duty, or surfaces concrete evidence that helps assess fit. Preserve already-good
  bullets. There is no minimum edit count, percentage, or mandatory project rewrite.
- Do not reorder Skills, swap synonyms, or rearrange clauses solely to claim edits.
  Keep existing Skills order unless adding/replacing a supported term is necessary.
- Loavenly can be tailored around its actual intake, inventory, access,
  troubleshooting or reporting work when that improves fit; unchanged is valid.
- Infer ordinary transferable skills from documented duties without asking for
  separate confirmation (communication, critical thinking, prioritization, case
  management from support tickets). Keep a concrete evidence source for each use.
- Use GPT-6 Astra for normal tailoring. Model choice does not replace meaningful
  change checks or evidence validation.
- Technical plausibility alone does not establish completed implementation. Salesforce
  or a similar product must not become a Loavenly integration without project evidence.
  The standing automatic technical policy below is an explicit exception for ordinary
  common-development use in matching duties. It does not authorize specific advanced
  implementations, new architectures or artificial stacks.
- Skills-only confirmation alone permits a skill in Skills. The candidate's standing
  automatic technical policy additionally permits ordinary use in matching work/project
  duties, including new tools assessed per posting. Specialized employer-specific
  implementations stay with that employer. Previously rejected experience
  stays excluded. A job posting is not candidate evidence.
- Unsupported tools remain review gaps. A useful, plausible future extension can be
  suggested separately in Stretch Lab, clearly marked proposed and not completed.
  Review permission is not permission to assert hypothetical work as actual experience.
- Prefer natural, meaningful adaptation to cosmetic swaps, keyword appendices or
  generic soft-skill filler. Do not force changes to an irrelevant bullet to meet a quota.
- Validate the actual final rendered text after layout repair. A bounded correction
  must repair lost supported coverage or inadequate substantive tailoring; otherwise
  fail explicitly rather than publishing an accepted export.

## Technology coverage for every posting

- Extract actual responsibilities and required/preferred tools from the posting.
  Exclude company boilerplate, scanner noise and unrelated physical technologies.
- Preserve accepted directly supported technologies in their evidenced context.
  Where source-specific project usage is established, Skills-only placement is not
  enough. Where usage is only established at an employer, do not also require it in
  Loavenly. Java and JavaScript remain distinct; API plural preservation does not
  turn a generic API into Microsoft Graph API.
- Preserve supported coverage in both primary and shorter variants. Disclose missing
  evidence and any permitted omissions; do not claim complete coverage of every
  employer requirement when the candidate lacks some of it.
- Historical aggressive drafts remain available with explicit unverified-placement
  warnings. `aggressive_draft=True` is retained only for explicit historical/audit
  use; normal product paths pass False. Existing files are not silently rewritten.
- New generation never converts hypothetical drafts or planned extensions into
  confirmed candidate profile evidence.

## Layout

- Export exactly one page, with the template's fonts, sizes, protected headings,
  dates, contact details, sections, and bullet counts intact.
- Use the current configured edited base. Preserve its numbering XML verbatim;
  do not tighten marker gaps, rewrite hanging indents, or accept those changes
  as formatting exceptions. Measure markers and first/continuation text against
  that base, including after final font optimization.
- Align every bullet's continuation lines with its first text line; maximum measured
  deviation is 0.75 points. Matching a defective baseline does not excuse staggering.
- Render each Skills category on exactly one line. No orphaned tool names, including
  Postman, may spill onto a separate line. Rebalance an appropriate tool into Tools
  or replace lower-priority skills, then render and measure again.
- Do not introduce text overlap, clipped text, collapsed employer/date separators,
  changed font inventory, or abnormal employer spacing.
- Validate the final optimized DOCX and its re-rendered PDF, not only an intermediate
  draft. Font-file optimization must preserve the validated output.

## Review and regression coverage

Technology coverage includes a brief plain-language definition under each tool
or method name. Future tailoring returns version-specific `technology_summaries`
for all coverage terms, including newly discovered and omitted technologies.
Explain what each is and its typical purpose; definitions are review metadata,
never candidate evidence or extra text inserted into the exported resume.

The app reports experience bullet edits, project bullet edits, Skills row edits,
and summary changes separately. Full bullet text is visible in the review.
Each paragraph also reports exact job keywords present in its final exported
text but absent from its base text. Model target annotations alone are not proof
that a keyword was added.

Download responses must hash-check the actual bytes against the saved artifact
fingerprint. A changed local file may fall back to a verified backup or cloud
object; no unchecked stream or signed redirect may bypass this check. Verify
the files saved by the actual DOCX/PDF download buttons, then render the saved
DOCX and inspect both that render and the downloaded PDF against the active base.

The automated suites cover keyword extraction, evidence placement, substantive
tailoring, model correction, protected facts, rendered hanging alignment, and
single-line Skills rows. New accepted runs retain their full audit and artifacts;
older files are historical outputs and are not silently rewritten.

Relevant implementation: `planning/quality.py`, `planning/priorities.py`,
`reasoning/codex.py`, `validation/resume.py`, `layout/renderer.py`, and `pipeline.py`
under `packages/resume-engine/src/aiadapply_v2/`.

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
