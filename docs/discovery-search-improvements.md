# Support-focused discovery — October 12, 2026

Current October 13 behavior and fresh tests: [LinkedIn hardening checkpoint](linkedin-verification-2026-10-13.md).
The earlier implementation descriptions below are historical. In particular,
the current collector has not succeeded live; 429 remains the external blocker.

## Objective
Find jobs Brian can credibly perform using documented application support and IT operations experience. A keyword match is not a hiring probability. Preserve the $60k minimum, 30-mile maximum, current remote preference, manual resume approval and RTX/Collins referral-only rules.

## Research and implementation

Prefer direct public employer feeds: structured descriptions, employer links and active-list checks without paid search/model calls. SmartRecruiters documents its public posting list and detail endpoints at https://developers.smartrecruiters.com/docs/endpoints and https://developers.smartrecruiters.com/reference/v1listpostings. O*NET's support occupation provides title/duty vocabulary: https://www.onetonline.org/link/summary/15-1232.00.

Verified and connected five additional boards: Ware Malcomb (Lever), Trace3 and Sony Interactive Entertainment (Greenhouse), USC and Motorola Solutions (Workday). Official public list requests succeeded for all five. The full application scan checked all 35 registered boards successfully. New feeds yielded support listings beyond the previous aerospace-heavy selection. A list result is not a promise that every posting fits.

Laserfiche is relevant (https://jobs.jobvite.com/laserfiche/), but automated requests returned 403. Keep it as a manual source. Do not bypass the restriction or represent it as an automated feed. Several speculative Lever slugs returned 404 and were not registered. Adzuna/USAJOBS remain disabled without credentials. No paid scraper, API, subscription or model-based search loop was introduced.

## Finding more jobs in the UI

Discover now includes six role-family searches with Indeed and LinkedIn links, current commute radius and a seven-day posting filter. These are explicitly manual discovery links; check the employer page and capture promising postings. External sites may interpret search syntax/filters differently; salary and employment terms still require employer verification.

The default view shows recently verified active listings, including unknown or older posting dates. A fresh check does not reset the original posting date or claim the job was newly posted. Explicit 3/7/21-day filters remain available. Existing approved applications and history are preserved.

## Matching fixes from live results

Exclude film post-production and programmer roles despite shared support/SQL keywords. Do not confuse clearance of a background check with a security-clearance requirement. Continue ranking primary duties and required experience above language/tool familiarity. Keep L3 and specialty gaps visible, and avoid sparse adjacent-role recommendations.

## Validation and limitations

52 discovery, provider, preference, ranking and referral tests passed; TypeScript and targeted ESLint passed. Browser checks verified the default filter, source controls and live result cards. Full scan source health: 35/35 successful. Tests cover recently verified undated/older postings, stale observations, invalid/future dates, query encoding/radius and registered source identities.

Coverage is still finite. Public feeds do not cover every employer; some require manual searching or credentials. Local scanning runs while the worker/computer is awake. No applications were submitted by this task. User-facing source health distinguishes failures from empty results.

## LinkedIn Premium discovery — October 12, 2026

Brian confirmed automatic tailoring of up to 10 qualifying new LinkedIn jobs per
Pacific calendar day, exact-resume approval before applying, and contacts/messages
as drafts only. No outreach is sent by this feature.

Discover's LinkedIn tab reads the dedicated signed-in Chrome session. The local
worker checks daily; each cycle searches past-day and past-week support role
queries. Full descriptions and employer destinations are retained with observed
Premium signals. Explicit pay, local radius, employment type, documented duties,
and freshness govern eligibility; Premium badges never override those checks.
Unknown pay remains excluded. Routine schedule conditions remain visible for review.

Deduplication uses LinkedIn job IDs, normalized employer/role/location, and canonical
employer URLs. Existing applications are linked rather than re-tailored. Pending
fresh eligible results survive daily-cap deferral. The ten-job cap is checked
inside the same database transaction as creating the application and queued run.
Browser state and credentials remain local; no paid scraping or model service added.

Live test: LinkedIn returned HTTP 429 in Chrome's error document. No jobs were
imported or submitted in that attempt. Collector now recognizes that condition,
stops immediately, and the service sets a 24-hour cooldown. This is NOT evidence
of successful live extraction. Re-test after access recovers. Computer and worker
must remain awake; logged-out sessions and access restrictions pause collection.
