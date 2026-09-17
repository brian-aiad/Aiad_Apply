from __future__ import annotations

import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

from aiadapply_v2.documents.formatting import (
    DOCUMENT_PART,
    NS,
    W_NS,
    XML_NS,
    body_paragraphs,
)
from aiadapply_v2.schemas import ResumeDocument, RewritePlan
from aiadapply_v2.text import split_skill_values


def write_resume_candidate(
    base: ResumeDocument,
    plan: RewritePlan,
    output_path: str | Path,
    *,
    compression_level: int = 0,
    compressed_paragraph_ids: set[str] | None = None,
    reverted_paragraph_ids: set[str] | None = None,
) -> Path:
    """Replace only editable XML text while retaining the source DOCX package."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    by_id = {paragraph.paragraph_id: paragraph for paragraph in base.paragraphs}
    replacements: dict[int, tuple[str, str | None]] = {}

    summary_meta = by_id["summary"]
    replacements[summary_meta.index] = (
        summary_meta.text
        if reverted_paragraph_ids is not None and "summary" in reverted_paragraph_ids
        else _select_text(
            plan.summary.text,
            plan.summary.shorter_text,
            summary_meta.character_budget,
            compression_level,
            force_shorter=(
                compressed_paragraph_ids is not None and "summary" in compressed_paragraph_ids
            ),
        ),
        None,
    )

    proposed_skills = {line.paragraph_id: line for line in plan.skills.lines}
    selected_skill_values: dict[str, list[str]] = {}
    for paragraph_id, proposed_skill in proposed_skills.items():
        meta = by_id[paragraph_id]
        selected_skills = (
            split_skill_values(meta.text.split(":", 1)[1])
            if reverted_paragraph_ids is not None and paragraph_id in reverted_paragraph_ids
            else proposed_skill.shorter_skills
            if (compressed_paragraph_ids is not None and paragraph_id in compressed_paragraph_ids)
            or compression_level >= 2
            or (
                compressed_paragraph_ids is None
                and compression_level >= 1
                and len(", ".join(proposed_skill.skills)) > meta.character_budget
            )
            else proposed_skill.skills
        )
        selected_skill_values[paragraph_id] = selected_skills

    for paragraph_id, selected_skills in selected_skill_values.items():
        meta = by_id[paragraph_id]
        prefix_match = re.match(r"^.*?:\s*", meta.text)
        fixed_prefix = (
            prefix_match.group(0) if prefix_match else f"{meta.text.split(':', 1)[0].strip()}: "
        )
        replacements[meta.index] = (fixed_prefix, ", ".join(selected_skills))

    proposed_bullets = {bullet.paragraph_id: bullet for bullet in plan.bullets}
    for paragraph_id, proposed_bullet in proposed_bullets.items():
        meta = by_id[paragraph_id]
        replacements[meta.index] = (
            meta.text
            if reverted_paragraph_ids is not None and paragraph_id in reverted_paragraph_ids
            else _select_text(
                proposed_bullet.text,
                proposed_bullet.shorter_text,
                meta.character_budget,
                compression_level,
                force_shorter=(
                    compressed_paragraph_ids is not None
                    and paragraph_id in compressed_paragraph_ids
                ),
            ),
            None,
        )

    with ZipFile(base.source_path) as source:
        document_xml = _rewrite_document_xml(source.read(DOCUMENT_PART), replacements)
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as destination:
            destination.comment = source.comment
            for member in source.infolist():
                data = document_xml if member.filename == DOCUMENT_PART else source.read(member)
                destination.writestr(member, data)
    return output


def _select_text(
    full: str,
    shorter: str,
    budget: int,
    compression_level: int,
    *,
    force_shorter: bool = False,
) -> str:
    if force_shorter:
        return shorter
    if compression_level >= 2:
        return shorter
    if compression_level >= 1 and len(full) > budget:
        return shorter
    return full


def _rewrite_document_xml(
    raw_xml: bytes,
    replacements: dict[int, tuple[str, str | None]],
) -> bytes:
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
    root = etree.fromstring(raw_xml, parser)
    paragraphs = body_paragraphs(root)
    for index, (primary, secondary) in replacements.items():
        paragraph = paragraphs[index]
        if secondary is None:
            _replace_all_text(paragraph, primary)
        else:
            _replace_skill_text(paragraph, primary, secondary)
    return etree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        standalone=True,
    )


def _replace_all_text(paragraph: etree._Element, value: str) -> None:
    text_nodes = paragraph.findall(".//w:t", NS)
    if not text_nodes:
        raise ValueError("Editable paragraph does not contain a writable Word text node.")
    for node in text_nodes:
        _set_text(node, "")
    _set_text(text_nodes[0], value)


def _replace_skill_text(
    paragraph: etree._Element,
    fixed_prefix: str,
    skills: str,
) -> None:
    runs = paragraph.findall(".//w:r", NS)
    bold_run = next((run for run in runs if _is_bold(run)), None)
    content_run = next((run for run in runs if not _is_bold(run)), None)
    if bold_run is None or content_run is None:
        raise ValueError("Skill paragraph must retain distinct bold-label and body runs.")
    for node in paragraph.findall(".//w:t", NS):
        _set_text(node, "")
    bold_text = bold_run.find("w:t", NS)
    content_text = content_run.find("w:t", NS)
    if bold_text is None or content_text is None:
        raise ValueError("Skill paragraph format runs do not contain writable text nodes.")
    _set_text(bold_text, fixed_prefix)
    _set_text(content_text, skills)


def _is_bold(run: etree._Element) -> bool:
    bold = run.find("w:rPr/w:b", NS)
    if bold is None:
        return False
    value = bold.get(f"{{{W_NS}}}val")
    return value not in {"0", "false", "off"}


def _set_text(node: etree._Element, value: str) -> None:
    node.text = value
    if value[:1].isspace() or value[-1:].isspace():
        node.set(f"{{{XML_NS}}}space", "preserve")
    else:
        space_attribute = f"{{{XML_NS}}}space"
        if space_attribute in node.attrib:
            del node.attrib[space_attribute]
