# Draft technology review — September 24, 2026

Application review now summarizes required project technology placements and
explicitly names missing project or supported-context placements. Skills and
employer mentions cannot satisfy project coverage. Optional umbrella omissions
and rejected terms do not inflate the required gap count.

An expandable section groups unverified usages by project paragraph and displays
the saved final wording. It never substitutes the model's proposed wording.
Older reports omit totals when their coverage metadata is incomplete and explain
when final text was not saved. Saved database change records can supply that final
text when the report snapshot lacks it. Historical reports and resumes remain intact.

Implementation:

- `apps/web/src/lib/technology-review.ts`
- `apps/web/src/components/draft-technology-review.tsx`
- `apps/web/src/app/applications/[id]/page.tsx`

Verification:

- All 78 web unit tests passed; the seven new review cases also passed after the
  final rejected-term counting correction.
- ESLint, TypeScript, production build, and Git whitespace checks passed.
- Playwright CLI exercised synthetic partial, complete, and legacy reports in the
  configured isolated database on port 3101. Version selection changed the summary
  from 1/2 to 2/2; the legacy version omitted unknown totals and showed its missing
  final-text fallback.
- Checked exact final wording, exclusion of proposed text, 390-pixel mobile
  overflow, and keyboard expansion/collapse. Inspected desktop and mobile captures
  and increased text spacing. Final captures are under
  `output/playwright/draft-review/`.
- Removed the exact synthetic job (including its three runs), stopped its isolated
  server, and closed the verification browser. No worker was started for test data.
- Read-only verification of the existing Techaxis application on port 3000 confirmed
  the new review and final-wording disclosure are rendered. Health reports the
  database, base resume, and worker ready, with zero active runs.

No engine prompts, candidate evidence, historical resume artifacts, or application
statuses were changed by this UI work.
