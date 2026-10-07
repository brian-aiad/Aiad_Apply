# Capture draft plan — September 28, 2026

Capture now previews potential Loavenly software additions before the user saves
or tailors a posting. The guidance follows the automatic editable-draft policy:
unconfirmed software use can be drafted for review, while employer history,
credentials, and eligibility remain evidence-based.

Replaced contradictory gap advice that required confirmation before any resume
claim. Expanded the preliminary tool catalog to recognize Java, Mendix, MATLAB,
DuckDB, FastAPI, Apache Spark, dbt, relevant AWS services, and other software tools.
Preferred terms are labeled as preferred. Exact final placement and omissions
remain the responsibility of the full engine and exported-text review; the capture
catalog is a preliminary preview, not an exhaustive extraction guarantee.

Credential-only requests do not become project implementation targets. A platform
requested for both hands-on use and certification can appear as a project draft
target while its certification remains a separate evidence check. Confirmed Skills
knowledge can also appear as a project drafting opportunity without being relabeled
as an evidence gap or asserted as completed project work.

Verification:

- All 90 web unit tests passed, including software versus credential handling,
  preferred technology placement, negated requests, Java versus JavaScript, and
  preservation of candidate evidence.
- ESLint, TypeScript, production build, and Git whitespace checks passed. The first
  standalone type check encountered duplicate generated files in the old isolated
  build directory; rebuilding regenerated that directory and the subsequent check
  passed.
- Playwright filled an unsaved synthetic posting in the live Capture screen.
  The preview listed the expected software additions, excluded the credential-only
  ServiceNow request, and kept Save and tailor enabled. Mobile overflow checks and
  desktop/mobile screenshot inspection passed.
- Cleared the test paste and closed the verification browser. No application was
  saved, no tailoring run was queued, and candidate profiles were not changed.

Screenshots: `output/playwright/capture-draft-plan/`.
