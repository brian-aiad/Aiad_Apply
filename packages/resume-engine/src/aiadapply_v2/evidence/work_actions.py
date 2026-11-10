"""Conservative work-action checks, not proof that a candidate used a tool.

These checks only validate wording after the evidence graph authorizes a duty.
Plans, negated actions and detached noun lists cannot satisfy usage coverage.
"""

import re

_ACTION = re.compile(
    r"\b(?:support(?:ed|ing)?|debug(?:ged|ging)?|investigat(?:e|ed|ing)|"
    r"test(?:ed|ing)?|validat(?:e|ed|ing)|resolv(?:e|ed|ing)|monitor(?:ed|ing)?|"
    r"check(?:ed|ing)?|deploy(?:ed|ing)?|built|build(?:ing)?|automat(?:e|ed|ing)|"
    r"script(?:ed|ing)?|maintain(?:ed|ing)?|configur(?:e|ed|ing)|administer(?:ed|ing)?|"
    r"provision(?:ed|ing)?|review(?:ed|ing)?|operat(?:e|ed|ing)|triag(?:e|ed|ing)|"
    r"run(?:ning)?|ran|develop(?:ed|ing)?|creat(?:e|ed|ing)|implement(?:ed|ing)?|"
    r"writ(?:e|ing)|wrote|us(?:e|ed|ing)|reconcil(?:e|ed|ing)|track(?:ed|ing)?|"
    r"document(?:ed|ing)?|coordinat(?:e|ed|ing)|collaborat(?:e|ed|ing)|"
    r"communicat(?:e|ed|ing)|schedul(?:e|ed|ing)|train(?:ed|ing)?|present(?:ed|ing)?|"
    r"analyz(?:e|ed|ing)|analys(?:e|ed|ing)|updat(?:e|ed|ing)|troubleshoot(?:ing)?|"
    r"troubleshot|prepar(?:e|ed|ing)|produc(?:e|ed|ing)|compil(?:e|ed|ing)|generat(?:e|ed|ing))\b",
    re.I,
)
_PROPOSED = re.compile(
    r"\b(?:plan(?:s|ned|ning)?|intend(?:s|ed|ing)?|propos(?:e|ed|ing)|"
    r"aim(?:s|ed|ing)?|hope(?:s|d)?|want(?:s|ed)?)\s+to\b|"
    r"\b(?:planned|proposed|future|potential)\s+(?:use|implementation|deployment|integration)\b",
    re.I,
)
_NEGATED = re.compile(
    r"\b(?:not(?!\s+only\b)|never|without)\s+(?:\w+\s+){0,2}$|"
    r"\b(?:didn['’]t|doesn['’]t|don['’]t|haven['’]t|hasn['’]t|cannot|can['’]t)\s+(?:\w+\s+){0,2}$",
    re.I,
)


def affirmed_work_action(clause: str, terms: tuple[str, ...]) -> bool:
    """Count an affirmed action tied to the named tool, not a nearby future/negative duty."""
    # Contrast separates an excluded tool from an otherwise genuine accomplishment.
    for segment in re.split(r"\b(?:but|however|whereas)\b", clause, flags=re.I):
        for term in terms:
            occurrences = re.finditer(r"(?<!\w)" + re.escape(term) + r"(?!\w)", segment, re.I)
            for occurrence in occurrences:
                if _PROPOSED.search(segment):
                    continue
                prefix = segment[: occurrence.start()]
                if re.search(
                    r"\b(?:without|no|never with|not with|excluding)\s+(?:\w+\s+){0,2}$",
                    prefix,
                    re.I,
                ):
                    continue
                actions = list(_ACTION.finditer(segment))
                if not actions:
                    continue
                # All action verbs share the same modal/future check.
                if any(
                    re.search(
                        r"\b(?:would|could|will|might|may)\s+(?:\w+\s+){0,3}$",
                        segment[: a.start()],
                        re.I,
                    )
                    for a in actions
                ):
                    continue
                preceding = [a for a in actions if a.end() <= occurrence.start()]
                relevant = preceding or actions[:1]
                if any(_NEGATED.search(segment[: a.start()]) for a in relevant):
                    continue
                return True
    return False
