from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Iterable


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\u00a0", " ").replace("\u202f", " ")
    value = value.replace("\u2010", "-").replace("\u2011", "-")
    value = value.replace("\u2012", "-").replace("\u2013", "-").replace("\u2014", "-")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in value.splitlines())


def normalized_term(value: str) -> str:
    value = normalize_text(value).strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value.strip(".,;:()[]{}\"'")


def contains_term(text: str, term: str) -> bool:
    escaped = re.escape(normalized_term(term))
    suffix = r"(?![a-z0-9+#])" if normalized_term(term) == "c" else r"(?![a-z0-9])"
    return re.search(rf"(?<![a-z0-9]){escaped}{suffix}", text.lower()) is not None


def preserves_source_term(text: str, term: str) -> bool:
    """Unambiguous evidence aliases; literal keyword/diff matching stays exact."""
    aliases = {
        "api": ("APIs",),
        "webhooks": ("webhook",),
        "continuous integration": ("CI/CD",),
    }
    return contains_term(text, term) or any(
        contains_term(text, alias) for alias in aliases.get(normalized_term(term), ())
    )


def count_term(text: str, term: str) -> int:
    escaped = re.escape(normalized_term(term))
    suffix = r"(?![a-z0-9+#])" if normalized_term(term) == "c" else r"(?![a-z0-9])"
    return len(re.findall(rf"(?<![a-z0-9]){escaped}{suffix}", text.lower()))


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = normalized_term(value)
        if key and key not in seen:
            seen.add(key)
            result.append(value.strip())
    return result


def split_skill_values(value: str) -> list[str]:
    """Split a comma-delimited skill row without breaking parenthesized tool groups."""
    values: list[str] = []
    current: list[str] = []
    depth = 0
    opening = {"(", "[", "{"}
    closing = {")", "]", "}"}
    for character in value:
        if character in opening:
            depth += 1
        elif character in closing and depth:
            depth -= 1
        if character == "," and depth == 0:
            item = "".join(current).strip()
            if item:
                values.append(item)
            current = []
            continue
        current.append(character)
    item = "".join(current).strip()
    if item:
        values.append(item)
    return values


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", normalized_term(value))
    return cleaned.strip("_")
