# Approved resume to application

The Apply tab binds explicit submission authorization to a job, run, PDF artifact,
SHA-256 fingerprint and exact employer destination. Old review-only acknowledgments
do not become automatic-submission permission. New tailoring after approval or a
changed destination invalidates the pending approval.

The free local application worker starts with `scripts/start-local.sh`. It uses
the existing signed-in Codex CLI for structured decisions and installed Playwright
to operate a dedicated, persistent Chrome profile. There is no paid API fallback,
browser SaaS, extension import or separate MCP installation required for this path.
Codex account usage limits still apply. Login startup is a separate, still pending
macOS setup; the Desktop permission issue has not been resolved.

## States and verification

- QUEUED: explicit user approval saved; not submitted.
- RUNNING: one worker owns the attempt and is preparing the form.
- SUBMITTING: the server revalidated approval, artifact bytes and attachment proof;
  this boundary is persisted before the final click.
- SUBMITTED: the browser observed a new, explicit employer receipt and saved a
  screenshot. Only then does the application become Applied.
- BLOCKED: stopped before submission; unresolved questions are shown.
- UNKNOWN: the final click may have occurred but receipt verification failed.
  Never automatically retry; the user must check the employer site. An existing
  receipt can be recorded through the manual workflow.
- CANCELED: authorization withdrawn before the submission boundary.

An installation-wide transaction lock serializes approvals, worker claims and
result updates. Worker endpoints require the existing worker secret. The browser
checks authorization before each action and again at final submission. Interrupted
attempts are not automatically requeued. Results are written locally before their
database update; reporting is retried without repeating the employer submission.

The worker downloads only the selected verified artifact, hashes it locally,
uploads it under the original clean resume filename and reads the browser file
bytes back. Version/hash/attempt identity stays internal. On the final page it
requires matching file bytes, the upload widget bound to that verified transfer,
or the same server attachment URL observed from that widget. Filename alone is
never sufficient. It never falls back to another resume. It records entered
answers and sources. Missing required facts, conflicting answers, unverifiable
attachments, login, CAPTCHAs and unsupported controls stop the attempt.

## Local operation

```sh
bash scripts/application-worker.sh start
bash scripts/application-worker.sh stop
```

Logs: `.runtime/application-worker.log`.
Private attempt data and screenshots: `.runtime/application-attempts/<attempt-id>`.
Persistent Chrome profile: `.runtime/application-browser-profile`.
Additional candidate setup facts: `.runtime/application-onboarding.json`.
Do not commit these private files. A paused login leaves the dedicated Chrome
window available for the user. Saved login state is reused by a later attempt.

### Free Gmail verification-code access

The worker can use Gmail's free API with the read-only `gmail.readonly` OAuth
scope. It does not use a paid API, metered fallback, or Codex model call to read
mail. To connect it, enable Gmail API in a Google Cloud project, create a
Desktop-app OAuth client, and authorize it locally from `apps/web`:

```sh
GOOGLE_OAUTH_CLIENT_FILE=/absolute/path/to/desktop-oauth-client.json npm run gmail:connect
```

Open the printed Google consent URL and approve read-only Gmail access. Google
does not require a billing account for this Gmail API use. The client and
refresh token are stored under `.runtime/application-gmail-oauth.json` with
owner-only permissions; revoke access from the Google Account security page
and remove that local file to disconnect. OAuth testing-mode refresh tokens
may expire and then require reconnecting.

For an active, explicitly approved application only, the worker searches after
the verification prompt was observed. Gmail query results are rechecked locally
for the exact saved recipient, employer name, and message receive time. It uses
the newest matching message only, preserves code capitalization, and makes one
attempt in the existing application tab using a uniquely identified code field
and verification action. A missing email, ambiguous code/field/action, rejected
or expired code, or missing receipt is reported as unresolved; no older code,
resend, duplicate application, or automatic retry is used. Codes are kept only
in memory, excluded from answer capture, cleared from the field after the
verification action, and never written to the reusable profile, attempt journal,
or worker logs. The application is marked Applied only after a new explicit
employer receipt.

The application profile supports extra confirmed question/answer text for facts
missing from a paused application. A confirmation or explicit consent specific to
one employer must not be generalized to other employers.

## Verification and limits

Tests cover identity-bound approval, concurrent claims, wrong files, missing
fields, preserving existing answers, changed links, cancellation, the submission
boundary, idempotent result recording and uncertainty without automatic retry.
A real Codex subscription decision loop has filled and submitted a local fixture,
uploaded the correct file, and verified its receipt. No mock receipt is written
to a real application.

This is a general form worker, not a guarantee that every ATS can be completed.
Custom controls, ambiguous labels, unsupported attachments or multi-page portals
that hide all attachment evidence pause conservatively. Final confirmation checks
support explicit English receipts; an unrecognized receipt remains uncertain.
The local browser runs while this Mac is awake and the services are running.

## Recovery and question handling (October 6 audit)

The worker now uses an OS-held exclusive lock and a durable installation identity.
A persisted claim token recovers a lost claim response only before browser work
starts. The private outbox records the submission boundary and terminal results;
restart recovery republishes results without repeating form actions. A bound
result copy can recover a receipt only when attempt, run, PDF hash and destination
all match. Unknown outcomes still require checking the employer site.

The Apply tab accepts question/answer pairs for a blocked attempt. These stay with
that employer and approval; they do not become consent for other employers.
Resuming revalidates the exact approved artifact. Preparation-only rechecks are
blocked from final submission in both the browser and server, even with a verified
attachment. Missing facts no longer prevent filling other supported fields or
uploading the approved resume.

The optional `aiadapply-browser-inspector` MCP is installed locally using pinned
Microsoft Playwright MCP 0.0.83. Its Codex tool allowlist enables read-only browser
inspection (navigation, snapshots, screenshots, console/network observations),
not application clicks or uploads. The application worker remains responsible for
approval, identity, resume and receipt guards. No paid browser service was added.

Script diagnostics distinguish executable, authentication, timeout, usage-limit
and structured-output failures. Oversized model decisions stop before actions.
Unsupported question lengths stop explicitly instead of silently shortening
answers. React-style dropdowns, accessible labels, scoped attachment receipts and
negative/conditional confirmation text have browser regression coverage.

Greenhouse-specific verification now distinguishes identically named Attach
controls using their scoped file input identifiers. The browser captures the File
on the change event and hashes its actual bytes even when React immediately
replaces the input with an upload receipt. Upload verification is reported
separately from final attachment verification and employer submission. Telephone
formatting is accepted only when all digits match; dropdown answer reports retain
the associated question instead of storing a context-free Yes/No.

## Free tooling decision and current workflow

Brian's latest instruction retains manual approval of every tailored resume.
Discover already schedules searches and drafts qualified strong matches within
saved filters and daily limits. The Auto apply button authorizes one exact resume
and job; it does not authorize automatic submission of future unreviewed resumes.

Research on October 6: Simplify Copilot's free autofill is a useful optional helper,
but it can select a default resume and still expects the user to submit. Simplify
Autopilot is a Simplify+ beta, so it does not meet the free requirement. The plugin
directory search did not return a usable Simplify integration. Browser Use offers
local browser automation, but introducing another agent/model-provider layer does
not supply the existing exact-resume approval and receipt guards. Keep the local
Playwright worker and signed-in Codex subscription as the primary path; retain
Simplify as an optional manually invoked helper. No paid service was enabled.

Sources:
- https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications
- https://help.simplify.jobs/help/articles/1784339-getting-started-with-autopilot
- https://simplify.jobs/copilot
- https://github.com/browser-use/browser-use

No provider guarantees every ATS. The supported goal is to complete accessible
forms using confirmed facts and exact resume verification, detect unsupported
controls/login/CAPTCHA and genuinely unknown facts, and expose an actionable
blocker without inventing success or repeatedly submitting.

The worker prefers a portal's native Autofill with resume flow where available,
then verifies the imported answers and fills supported gaps. Tests include native
resume parsing, preserving existing answers and confirming the mock submission.
Recorded employer submissions override older saved No answers. Canonical Greenhouse
job IDs and normalized destination URLs prevent another application record from
submitting the same known job through a tracking-link alias.

After an uncertain result, the updated worker can observe the still-open browser
for a late receipt without clicking Submit again. Completing email verification
may need the user. A Gmail plugin connection grants this assistant its approved
email access; it does not automatically configure Gmail for the local worker.
Local unattended email access requires its own authorized Google OAuth connection.

### Explicit retry of an unconfirmed attempt

Automatic approval/resume continues to reject UNKNOWN submissions. When the user
explicitly instructs a retry after being told the prior result is unconfirmed,
the retry_unconfirmed action requires the current attempt ID, an explicit
acknowledgment, and fresh exact run/PDF hash/destination approval. It preserves
the prior UNKNOWN record and records application_retry_authorized with both
attempt IDs. Known submitted destinations remain blocked by approvedMaterial.
This is a deliberate user-authorized retry; it cannot establish that the earlier
attempt failed or guarantee no duplicate at the employer. Receipt verification
is still required before recording Applied.

### Follow-up research: local automation reliability

Primary-source review of https://github.com/browser-use/browser-use and
https://github.com/browserbase/stagehand supports retaining local Playwright with
the existing Codex subscription. Both libraries are MIT, but cloud browsers and
API-backed model examples can add charges. They are not replacements for exact
resume approval, scoped candidate facts, or receipt verification.

https://github.com/dyyfk/auto-apply demonstrates submission fencing and a manual
Greenhouse email-code checkpoint. https://github.com/w4seemdev/Auto-Fill-Forms
describes scoped answer memory and resume-parser reconciliation. Neither repo
had a detected license at review; no code was copied. Do not copy default-No
answers or use form disappearance as evidence of submission.

Use the direct employer form when its fields and resume attachment are visible;
optional MyGreenhouse sign-in/autofill must not block a usable direct application.
Native parsing remains useful when it does not introduce an unnecessary login.
Playwright actionability and upload references: https://playwright.dev/docs/actionability
and https://playwright.dev/docs/input#upload-files . Email verification should be
a resumable checkpoint bound to the current attempt; it must not restart a submit
POST. Gmail installation does not prove usable mailbox access in a worker/session.

### Token-efficiency research and proposed next implementation (October 7, 2026)

Measured local baseline: the successful Product Operations Specialist, Air Defense
C2 attempt f6b37a41-f328-4012-83c3-efdbb8ea686f contains 26 model decisions,
22 single-click decisions, 9 fill actions, one upload, one submit and one wait.
The reasoner runs an ephemeral high-reasoning model per decision and resends the
posting, approved resume, profile, setup, history and fresh full snapshot. It
discards JSON stdout, so exact input/output/cached token usage was NOT measured.
Decision counts are not token counts and do not establish a savings percentage.

Recommendation: retain existing verified Playwright upload/receipt machinery and
add deterministic ATS adapters first (Greenhouse, then Lever/Ashby). Discover job
feeds and deduplicate in code; reserve model reasoning for tailored writing,
novel question mapping, ambiguous controls and bounded recovery. Batch supported
answers in a validated page plan; execute dropdown open/select/readback in code.
Keep employer history, consent, answer source and job-specific scope in the plan.
Use compact form-only observations and changed-state updates for AI fallback.
Do not reuse final submit actions or receipts from a cache. Always verify current
job identity, exact approved bytes, accepted attachment and a new employer receipt.

Implement privacy-preserving token counters before optimization: retain model,
input/cached/output counts when available, call count, duration, fallback reason
and outcome; discard conversational output. Compare the same isolated form
fixtures before/after, including custom dropdowns, changed labels, dependent
fields, wrong attachments, email verification and ambiguous outcomes. A design
target is 2-5 model decisions on familiar Greenhouse forms versus the observed
26, not a measured guarantee. Never benchmark by resubmitting actual jobs.

Current primary sources reviewed:
- https://github.com/vercel-labs/agent-browser (Apache-2.0): interactive/scoped/compact
  snapshots and delta output. Useful candidate to benchmark, not a proven drop-in
  replacement for our artifact or submission guarantees.
- https://github.com/browser-use/browser-use (MIT): CLI can use existing Codex and
  local browser; Python quickstart uses model API keys and hosted services cost
  extra. Not selected as a paid/default replacement.
- https://raw.githubusercontent.com/browserbase/stagehand/main/packages/docs/v3/best-practices/caching.mdx :
  local action replay avoids repeated model calls; borrow the pattern with current
  field-value and page-state validation.
- https://github.com/dyyfk/auto-apply : ATS-specific Playwright adapters and local
  workflow; source inspection only, no vendoring without license verification.
- https://github.com/speedyapply/JobSpy : optional discovery supplement, not an
  application submitter; documents rate limits and unavailable Google Jobs.
- https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications :
  Copilot autofills and expects manual submission.
- https://help.simplify.jobs/help/articles/1784339-getting-started-with-autopilot :
  Autopilot requires Simplify+, incompatible with the no-new-paid-services rule.

No production automation/model change, new dependency, paid service or real
submission was made for this research. Existing manual resume approval remains.

### Implemented: lower-call form plans and usage measurement

Routine exact-label contact fields now fill directly from the saved profile
through the existing guarded driver. The model can return a batch of `choose`
actions for custom dropdowns: each opens its own listbox, selects one exact
option, verifies the committed value in that same question, and refreshes refs.
The plan re-resolves each later question by frame, URL, label, context, role and
control type. Changed/ambiguous questions stop the batch and return to reasoning.
No dropdown answer is guessed by a deterministic keyword default.

The worker detects explicit receipts before another model call, while preserving
byte-verified uploads, final attachment checks and the durable submission fence.
Per-attempt efficiency.json counts model decisions and routine fields. Per-step
decisions/N.usage.json stores only numeric input/cached/output tokens, model,
elapsed time and success. Missing usage is null, never an invented zero. JSONL
parsing is bounded and does not persist prompts, tool messages or personal data.

Tests cover identical option labels in different dropdowns, existing-answer
conflicts, missing exact options, dependent questions changing mid-plan, bounded
telemetry and actual subscription-model execution on an isolated form. A live
mock completed guarded submission with batch choices in at most four decisions.
Broader platform adapters and context compaction remain future optimizations;
this change optimizes common form interactions without claiming universal ATS
compatibility or a measured percentage of token savings.

Greenhouse public posting preflight now checks the exact approved job ID and title.
404/410 stops before browser launch or model invocation; network/5xx/malformed
responses fall back to browser inspection rather than falsely declaring closure.
Actual unavailable Product Support Engineer attempt stopped with zero model calls.
Live isolated batched form: two model decisions, 41947 input and335 output tokens.
This is a functional measurement, not a like-for-like token savings benchmark.

### Dropdown recovery and email-code status

The Vast form exposed an open/close loop: `choose` clicked an already-open
React dropdown, closing its options before selection. The driver now preserves
an open scoped list, searches unloaded exact options in editable comboboxes,
and verifies the committed selection separately from search text. Snapshots
prioritize questions over long option lists. Progress monitoring requests
recovery after three stalled decisions and stops after seven unchanged steps.
Technical selection failures appear as automation issues instead of requests
for the candidate to provide website option wording.

Email-code monitoring distinguishes a requested code, a rejected code with an
unknown cause, and an explicitly expired code. The worker checks these states
before another model call. Diagnostic updates are bound to the worker and the
existing attempt; they cannot approve a new application or mark it Applied.
The optional read-only Gmail connection is documented above. Code retrieval
and form handling remain separate from receipt confirmation.

Browser regression coverage includes open dropdowns, searchable options,
verification rejection, and recognition of a later receipt without repeating
submission. Local mock results do not establish successful delivery of a real
employer application. The Vast attempts verified the approved version 6 PDF
and reached email-code entry; their saved outcomes remain unconfirmed unless
a fresh employer receipt is recorded.

Greenhouse documents codes as single-use and time-limited:
https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates
