"""Candidate-authorized routine tool use; never a general technology whitelist.

The profile opts in by name. A relevant existing duty allows ordinary assistance,
not an implementation, advanced proficiency, or a new accomplishment.
"""

import re

from aiadapply_v2.text import contains_term

_CONTEXTS = {
    "spreadsheets": r"\b(reconcil\w*|report\w*|inventory|tracking|tracked|records|logs?|monthly close)\b",
    "documents": r"\b(document\w*|notes?|runbooks?|reports?|knowledge.base|instructions?)\b",
    "presentations": r"\b(train\w*|present\w*|onboarding|workshops?)\b",
    "collaboration": r"\b(coordinat\w*|collaborat\w*|communicat\w*|schedul\w*|files?|documents?)\b",
    "assistants": r"\b(document\w*|troubleshoot\w*|debug\w*|scripts?|coding|develop\w*)\b",
    "visualization": r"\b(report\w*|reconcil\w*|analytics|data analysis|inventory|monthly close)\b",
    "office": r"\b(document\w*|notes?|reports?|reconcil\w*|records|train\w*|present\w*|coordinat\w*)\b",
}
_TOOLS = {
    "spreadsheets": ["Excel", "Microsoft Excel", "Google Sheets"],
    "documents": ["Word", "Microsoft Word", "Google Docs"],
    "presentations": ["PowerPoint", "Microsoft PowerPoint", "Google Slides"],
    "collaboration": ["Google Drive", "Google Workspace", "G Suite", "Gmail", "Google Calendar", "Google Meet", "Google Chat", "Outlook", "Microsoft Outlook", "Microsoft Teams"],
    "assistants": ["ChatGPT", "Claude", "Codex", "Gemini", "Copilot", "Microsoft Copilot", "GitHub Copilot"],
    "visualization": ["Tableau"],
    "office": ["Microsoft Office", "Microsoft 365", "Office 365"],
}


def routine_tool_fits(term: str, duty: str) -> bool:
    return any(
        term.casefold() in {tool.casefold() for tool in tools}
        and re.search(_CONTEXTS[group], duty, re.I) is not None
        for group, tools in _TOOLS.items()
    )


def routine_usage_in_context(term: str, text: str) -> bool:
    """A Skills list, qualification, or detached tool sentence is not work coverage."""
    for sentence in re.split(r"[.!?;](?:\s+|$)", text):
        if not contains_term(sentence, term):
            continue
        if re.search(r"\b(classroom (?:use|knowledge|experience)|coursework|familiar(?:ity)? with|knowledge of|exposure to)\b", sentence, re.I):
            continue
        if re.search(r"\b(?:tools|skills|technologies)\s*:", sentence, re.I):
            continue
        if routine_tool_fits(term, sentence):
            return True
    return False
