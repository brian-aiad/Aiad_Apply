# AiadApply upgrade — October 2, 2026

## Delivered workflow

- Purple logo, favicon, controls and dark workspace; compact sidebar, responsive
  Capture form and batch controls suit the user's split-screen browser.
- All six main pages reviewed at 1250px, plus overflow checks at 1000, 760 and
  390px. Screenshots are under `output/playwright/upgrade-*`.
- Local discovery defaults to employer posting dates within 21 days. Undated jobs
  have an explicit filter; first-found time is not substituted for publication.
- RTX/Raytheon has a separate California referral channel, 21-day limit,
  Seal Beach radius toggle, requisition IDs and copyable referral list. Screening
  checks full descriptions, degree pathways, experience, clearance and specialist
  gaps. Citizenship is confirmed; no active clearance is recorded.
- Discovery selection saves or queues up to ten jobs with partial-failure reporting.
- `bash scripts/queue-job.sh --clipboard` captures and queues without sending the
  posting through a chat. Repeat `--paste-file` to batch saved postings. Add
  `--save-only` for zero-model capture. Exact duplicate pastes reuse applications.
- Worker-backed scheduled searches default to six hours. Optional automatic
  tailoring is disabled by default, with a two-per-day/80-score default when
  enabled. Only fresh, verified candidates with no cautions qualify. The computer,
  app and worker must be running. Nothing submits applications or sends referrals.

## Tailoring and token efficiency

Full posting text, candidate evidence scope, protected facts and final coverage
requirements remain in the prompt. Repeated responsibility excerpts, lexical
explanations and redundant priority prose were removed. The compact El Segundo
RTX run used 40,575 prompt characters / 27,343 input tokens / 7,249 output tokens,
with one model call. The preceding Fullerton run used about 72k characters and
35.5k input tokens per call, requiring two calls. These are different postings,
not a controlled token-savings benchmark. Corrections remain bounded and recorded.

Parsing now retains employer header URLs and decodes Workday office codes. Los
Angeles no longer creates a false loan-origination-system requirement. Ada is
recognized in programming context, not disability boilerplate. Verification,
validation and radar-domain terms no longer become invented software products;
concrete CI tools take precedence over redundant umbrella targets.

Default drafts put relevant proposed software implementations in Loavenly bullets,
with exact unverified placements in review/report metadata. A previously rejected
experience term can still be a hypothetical software draft assumption; it never
becomes confirmed candidate evidence. Evidence-only audits retain exclusions.
Historical artifacts are preserved. Direct draft directories now have unique IDs.
macOS LibreOffice/font registration is serialized across processes to prevent
concurrent renders from interfering with shared font state.

## Real posting checks

| Application | Result | Review limits |
| --- | --- | --- |
| FloQast Technical Support Engineer | One-page DOCX/PDF, validation passed, one model call | Salesforce/Slack/Jira project placements flagged. This preserved test predates the missing-experience policy fix and explicitly excludes Zendesk. |
| Raytheon 01867647, Software Engineer II, Fullerton | One-page DOCX/PDF, validation passed after one quality correction | C, C++, Python, Linux, Jenkins, GitLab CI in project bullets; assumptions flagged. Agile/Scrum remain disclosed gaps. |
| Raytheon 01878759, Software Engineer I, El Segundo | One-page DOCX/PDF, validation passed on the first compact-prompt call | C, C++, Ada in project bullets; assumptions flagged. Embedded/radar experience and transcripts remain employer requirements. |

Browser download buttons were exercised for all three. Saved files are checked
against the original artifacts, and downloaded DOCX files re-rendered for one-page
and visual checks. Detailed evidence is retained under `output/research/` and
`output/playwright/downloads/`. These are editable drafts, not a claim that every
posting requirement is met. No clearance, employer history or credential was added.

## RTX search and referral priorities

The public Workday California facets returned 301 listings across 41 locations;
168 met the recent-date screening window before career-level and fit filtering.
The implemented channel showed 17 nearby and 51 statewide reviewable candidates
before linking the verification applications. Counts change as jobs expire or are
saved. No source supplies verified applicant totals; low competition is unknown.

Start a referral conversation with these roles, checking the live description:

- **01867647**, Software Engineer II, Fullerton, posted September 30: nearby CS/STEM
  pathway and two-year experience requirement; C/C++, embedded/system experience
  and ability to obtain clearance make this a stretch, not a confirmed match.
- **01878759**, Software Engineer I, El Segundo, posted October 1: early title and
  STEM degree, but embedded C/C++/Ada requirements and transcript/GPA instructions.
- **01858503**, Software Engineer II — Space and RF Sensors, El Segundo, posted
  September 22: software route; specialist RF/embedded requirements need review.
- **01875929**, Program Cost Controls Analyst, California remote, posted October 1:
  alternative entry route (degree and less than two years), Excel/financial
  communication requirements. Available when considering statewide/remote work.

The tab also retains existing-clearance roles with explicit barriers rather than
implying that citizenship alone satisfies them. Ask the referral contact about
program-specific eligibility and the exact business unit.

## Integrations chosen

- [RTX careers](https://careers.rtx.com/global/en/search-results?keywords=it): public
  Workday listings and full descriptions, no user account or paid API needed.
- [Lever postings API](https://github.com/lever/postings-api),
  [Greenhouse job board API](https://developers.greenhouse.io/job-board.html),
  [Ashby public postings](https://developers.ashbyhq.com/docs/public-job-posting-api),
  and [SmartRecruiters](https://developers.smartrecruiters.com/docs/posting-api):
  employer-direct feeds already supported. Restaurant365 and Twilio added.
- [Laserfiche careers](https://jobs.jobvite.com/laserfiche/): useful Long Beach
  employer, retained as a manual source rather than claiming unsupported automation.
- [Adzuna](https://developer.adzuna.com/docs/terms_of_service) and
  [USAJOBS](https://developer.usajobs.gov/): optional configured connectors, requiring
  their credentials. They are not active integrations without those credentials.
- [Jobicy feed](https://jobicy.com/jobs-rss-feed): additional source when remote
  discovery is enabled. O*NET provides local occupation vocabulary without a key.
- [Codex noninteractive CLI](https://learn.chatgpt.com/docs/non-interactive-mode):
  retained for structured tailoring. Deterministic parsing, ranking, deduplication
  and capture use no model. An additional agent/MCP layer would add complexity
  without improving access to these public feeds, so none was installed.

This is a curated multi-source search, not an exhaustive view of every employer.

## Final verification

- Python: **237 passed, 1 skipped** (optional live-model schema smoke test).
- Web unit: **102 passed**; isolated-database integration: **17 passed**.
- TypeScript, ESLint, Ruff, mypy and `git diff --check`: passed.
- Production build: passed using `.next-verification`, preserving the running dev app.
- Final browser pass: Today, Discover, Applications, Capture, Analytics and Settings
  at 1250px and 1000px: no horizontal overflow or page errors.
- All three actual DOCX/PDF download pairs match their saved artifact bytes.
  RTX DOCX re-renders match the downloaded PDFs' text; both are one page.
  FloQast download and re-render are also one page. Visually inspected spacing,
  continuation alignment, Skills rows, protected headings and final project text.
- Local health endpoint: ready; database, base resume and one current worker healthy;
  zero active runs after verification. Latest policy is loaded in the restarted worker.

Scope audit: purple/split-screen UI, all-page review, fresh employer discovery,
separate 21-day RTX referrals with candidate-specific eligibility, efficient terminal
and batch capture, scheduled discovery, bounded optional tailoring, hypothetical
project placement policy, real discovered-job exports and direct-download verification
are implemented and checked. Applicant counts remain unavailable; specialist gaps
and unknown business units are disclosed. Optional credentialed feeds are documented,
not represented as connected. No deployment, automatic application submission or
outbound referral message was performed.
