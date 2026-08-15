from __future__ import annotations

from collections.abc import Iterable

from aiadapply_v2.schemas import ClaimRisk, RewritePlan


def collect_claim_risks(plan: RewritePlan) -> list[ClaimRisk]:
    risks: list[ClaimRisk] = [*plan.claim_risks]
    for bullet in plan.bullets:
        risks.extend(bullet.claim_risks)
    seen: set[tuple[str, str]] = set()
    result: list[ClaimRisk] = []
    for risk in risks:
        key = (risk.target_requirement.casefold(), risk.strength.value)
        if key not in seen:
            seen.add(key)
            result.append(risk)
    return result


def all_proposed_text(plan: RewritePlan) -> Iterable[str]:
    yield plan.summary.text
    for line in plan.skills.lines:
        yield f"{line.category}: {', '.join(line.skills)}"
    for bullet in plan.bullets:
        yield bullet.text
