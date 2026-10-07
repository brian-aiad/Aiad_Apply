# Application assistance — October 2, 2026

User preference: free Simplify in Chrome; fill forms and attach the tailored resume,
then the user reviews and submits. No actual employer applications were submitted.

## Implemented

- Apply workspace pins a selected validated, evidence-based, one-page PDF. Review
  acknowledgement and byte fingerprint are recorded together. Legacy hypothetical
  drafts require a new version. Missing, failed, active and already-submitted runs
  cannot produce a new application packet.
- Free Simplify path saves the reviewed version without requiring an extension or
  exporting contact data. Instructions explicitly replace its default attachment.
- Optional Chrome extension imports one version-specific packet, checks PDF hash,
  expiry and job URL, previews recognized contact fields, and fills empty inputs.
  Existing answers, ambiguous repeated fields, screening and consent stay untouched.
  Replacing an existing PDF requires an explicit choice. No submit action exists.
- Persistent Answer kit, explicit import of old local answers, copy-only eligibility
  and salary answers, optimistic profile updates, and profile inclusion in backups.
- Exact low-risk resume excerpts help answer application questions without an extra
  model call. They are evidence to adapt, not invented question responses.
- Candidate-confirmed receipt records reviewed version, destination and confirmation.
  Duplicate confirmations are idempotent and the ordinary follow-up is scheduled.
  A changed resume fingerprint or destination invalidates an old preparation record.
- Ready actions from Today and Applications open the Apply workspace directly.

## Research and boundaries

Reviewed official documentation:
- [Simplify Copilot autofill](https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications): default resume upload and resume selection.
- [Simplify uploaded resumes](https://help.simplify.jobs/help/articles/0041921-updating-your-uploaded-resume): multiple uploads/switching may depend on Simplify+.
- [Simplify Autopilot](https://help.simplify.jobs/help/articles/1784339-getting-started-with-autopilot): a separate submission product; not the user's chosen review-and-submit workflow.
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html): authenticated employer submission endpoint.
- [Lever Postings API](https://github.com/lever/postings-api): submission requires an API key and is rate-limited.
- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): temporary page access after a user action.

There is no claimed Simplify API synchronization, automatic confirmation detection,
unattended submission, or universal form support. Chrome installation is one local
Load unpacked step. The user's normal Chrome profile was not altered during testing.
Packets are offline snapshots; later resume edits require a fresh packet or manual
upload. Version references in the receipt describe the reviewed saved version; users
should note external edits in the confirmation note.

## Verification

- 133 web unit tests and 21 isolated database integration tests passed.
- 13 existing browser tests passed, including the six-viewport major-page sweep.
- Three extension packet/manifest tests passed: hash/expiry, wrong-job matching and
  absence of broad host permissions.
- Actual extension loaded in a separate Chromium profile: packet import, session
  retention, wrong-page rejection and clearing passed.
- Actual helper function tested on representative forms: three contact fields filled,
  PDF attached, existing answers retained, replacement opt-in respected, changed form
  rejected, reference/repeated fields skipped, and zero submits.
- FloQast Technical Support Engineer's live Lever form was inspected read-only. Five
  contact fields and the resume control were recognized. No data was filled or sent.
- Apply flow in a production build against an isolated database: explicit review,
  actual packet download, profile save/reload, receipt save/reload, and viewports
  1100/900/650/390 passed with zero page errors. The downloaded packet passed the
  extension's PDF fingerprint validation.
- TypeScript, ESLint and production build passed. Final profile error handling was
  rechecked after the last small change.

Browser/research artifacts are under `output/playwright/` and `output/research/apply-*`.
The isolated fixture and test server are cleaned up after verification; no test
application or submission receipt is added to the real workspace.
