# Broader tailoring and Discover verification October 2 2026

This pass implements Brian’s clarification: rewrite more existing bullets for each job, rather than adding bullets or pages. It continues the neutral charcoal workspace with purple accents and tests actual employer postings, exported documents and browser workflows.

## Tailoring behavior

The engine counts substantive sentence rewrites separately from raw edits. Relevant opportunities include terminology already present in the base; punctuation, reordered words and tiny synonym changes do not count. For broadly relevant postings, it requires meaningful adaptation of most eligible bullets while preserving the original bullet count, employer facts and one-page template. Sparse or unrelated postings have fewer defensible opportunities.

Loavenly technology changes remain explicitly unverified draft assumptions. Exact placements appear in review and reports and never become factual candidate evidence. Final rendered text is checked again after layout repair. Source restoration now explains the exact lost context to the correction model, and a genuine reframe of an existing keyword does not depend on model-supplied target annotations. Source preservation also recognizes APIs as preserving generic API evidence, without weakening exact keyword coverage or treating a generic API as Microsoft Graph API. This fixes an actual Anduril draft that had been reverted unnecessarily.

The model returns only corrections to the locally computed evidence map. Batched local embedding queries preserve score ordering and differ from individual queries by less than 0.000001 in the measured test. Warm matching of 25 queries against 19 passages took 0.036 seconds batched versus 0.282 seconds individually on this Mac; this is a narrow local benchmark, not overall tailoring latency. The first uncached batch took 1.071 seconds, including first-inference and passage-cache work. Sentence Transformers documents batched encoding in its [official API reference](https://sbert.net/docs/package_reference/sentence_transformer/model.html).

Future failed terminal and worker runs retain their own measured model usage in failure-report.json and the application snapshot. Errors are bounded to the API’s accepted length. No failed report is labeled validated or given accepted resume downloads.

## Real job results

| Posting | Final document result | Model use |
| --- | --- | --- |
| FloQast Technical Support Engineer, September 30 | Seven experience bullets and all three project bullets rewritten; seven of eight relevant bullets meet the substantive check. One page; protected facts and coverage pass. | First run: one call, 30,615 input and 7,915 output tokens. Leaner prompt repeat: one call, 30,783 input and 5,928 output tokens. |
| TravisMathew Business Strategy and Consumer Insights Analyst, September 21 | Two experience bullets and all three project bullets rewritten; four of four relevant bullets substantively adapted. All 11 targeted project technologies survive. One page; a correction recovered terms lost during layout repair. | Two calls, 58,992 total input and 13,864 output tokens. |

FloQast is the closer support match. TravisMathew requires analytics/consumer-insights experience and remains an adjacent stretch. Their editable project implementations must be reviewed before submission.

The same-job FloQast repeat used about 25% fewer output tokens and 241 seconds of model time versus 323 seconds. Input usage was slightly higher. This is one observed pair, not a guaranteed reduction for every posting or model session. The first version is preserved.

Actual DOCX and PDF download buttons were used for both jobs and the FloQast repeat. Saved files match original artifact hashes; downloaded DOCX files re-render to one page and their text matches the downloaded PDFs. The rendered resumes were visually inspected. Evidence is in output/research/hour-download-verification.json and hour-download-verification-sparse.json, with renders under output/playwright/hour-*.png.

## Difficult posting limitation

Anduril IT Systems Engineer, posted September 16, was used as a stress test rather than an entry-level recommendation. Its model plans failed the broader rewrite/technology coverage checks, so no accepted resume was published. The diagnostic exposed the API/API plural preservation bug described above; the saved real model plan now retains REST APIs and Webhooks in both variants with zero further inference calls (output/research/hour-recorded-plan-check.json). Other insufficient rewrites remained in the attempted plans. This is a known limit of the current generation reliability, not a successful end-to-end result.

The failed verification application is closed with explanatory notes; its runs and local evidence remain intact. The final failed run’s token usage was successfully saved and synchronized. A posting can still exhaust its bounded correction attempts; the app must report that failure rather than silently export incomplete tailoring.

## Discovery and interface

Discover now remembers channel, filters, scope, sort and search in its URL. Search includes posting descriptions and skills. Compact qualification excerpts expose required conditions without opening the full description. Work arrangement is visible beside pay. Saved RTX shortlist selections show referral controls without irrelevant Save selected or Tailor selected actions; copy and clear were exercised in the browser.

Required and preferred qualifications are assessed separately. Independent experience requirements use the stricter threshold; a shorter tool requirement or graduate-degree pathway does not cancel a longer bachelor-level requirement. Existing clearance, specialist experience and work schedules remain separate cautions. Full-state location headers and Workday competency/education headings are parsed correctly in both terminal and Capture flows.

Added fixed-host HNTB and TravisMathew Workday collectors with bounded requests, local facets, actual dates and full descriptions. A filtered local scan cannot close older saved worksites. All 30 registered sources responded successfully in the 5:56 AM Pacific refresh: HNTB checked 40 local listings with no relevant opening, TravisMathew checked 11 and found the analyst role. These are dated observations, not promises of current availability.

RTX remains limited to actual California posting dates within 21 days, prioritizing the Seal Beach commute and reflecting confirmed citizenship and no active clearance. The eligible nearby pool remains small. Collins Fabrication Operator I is an alternative outside IT; its malformed employer salary is shown as needing verification. The remote Program Cost Controls Analyst remains a stretch. Referral copying was verified with requisition 01875929 and its official link; nothing was sent to a contact. Applicant counts are unavailable.

At 1100 by 860 pixels with the sidebar expanded, the first opening begins around 498 pixels and its actions fit within the viewport. The neutral background and compact structure were visually reviewed. The final screenshot is output/playwright/hour-discover-final.png.

## Verification evidence

- Python engine tests: 248 passed, one existing skip.
- Web unit tests: 128 passed.
- Isolated integration tests: 17 passed, including failed-run usage retention and application-state preservation.
- Isolated browser tests: 13 passed, including seven major routes at six widths and accepted-resume fallback after a failed rerun.
- TypeScript, ESLint, Ruff, mypy and production build passed.

Historical artifacts, unsuccessful verification attempts and earlier reports remain intact. The active support draft is available in the FloQast application; no applications were submitted automatically.

Verification window began at 12:14:56 UTC and finished after 13:15 UTC, exceeding the requested hour. Final health reported the database, base resume and worker ready, with zero active tailoring runs. Git diff whitespace checks passed. The worker was reloaded with the final code.
