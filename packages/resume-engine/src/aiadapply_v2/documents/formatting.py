from __future__ import annotations

import copy
import hashlib
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

from aiadapply_v2.documents.optimizer import font_deembedded_equivalent

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}
DOCUMENT_PART = "word/document.xml"
NUMBERING_PART = "word/numbering.xml"
BULLET_HANGING_TWIPS = "180"


def compact_bullet_numbering(raw_xml: bytes) -> bytes:
    """Tighten the primary bullet marker gap without touching the protected base file."""
    parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
    root = etree.fromstring(raw_xml, parser)
    numbered_abstract_ids = {
        abstract.get(f"{{{W_NS}}}val")
        for number in root.findall("w:num", NS)
        if number.get(f"{{{W_NS}}}numId") == "2"
        for abstract in number.findall("w:abstractNumId", NS)
    }
    for abstract in root.findall("w:abstractNum", NS):
        if abstract.get(f"{{{W_NS}}}abstractNumId") not in numbered_abstract_ids:
            continue
        level = next(
            (item for item in abstract.findall("w:lvl", NS) if item.get(f"{{{W_NS}}}ilvl") == "0"),
            None,
        )
        indent = level.find("w:pPr/w:ind", NS) if level is not None else None
        if indent is not None:
            indent.set(f"{{{W_NS}}}hanging", BULLET_HANGING_TWIPS)
            # Persist the first-text tab in the exported DOCX as well as the PDF.
            # Otherwise viewers can choose a default tab beyond the wrap indent.
            properties = indent.getparent()
            position = indent.get(f"{{{W_NS}}}left")
            if properties is not None and position:
                tabs = properties.find("w:tabs", NS)
                if tabs is None:
                    tabs = etree.Element(f"{{{W_NS}}}tabs")
                    properties.insert(properties.index(indent), tabs)
                number_tabs = [
                    tab for tab in tabs.findall("w:tab", NS) if tab.get(f"{{{W_NS}}}val") == "num"
                ]
                if not number_tabs:
                    number_tabs = [etree.SubElement(tabs, f"{{{W_NS}}}tab")]
                for tab in number_tabs:
                    tab.set(f"{{{W_NS}}}val", "num")
                    tab.set(f"{{{W_NS}}}pos", position)
    return etree.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)


def package_format_metadata(
    path: str | Path,
) -> tuple[list[str], dict[str, str], str, str]:
    """Fingerprint every immutable package part and the editable document skeleton."""
    with ZipFile(path) as archive:
        parts = sorted(archive.namelist())
        immutable = {
            name: hashlib.sha256(archive.read(name)).hexdigest()
            for name in parts
            if name != DOCUMENT_PART
        }
        document_xml = archive.read(DOCUMENT_PART)
    root = etree.fromstring(document_xml)
    skeleton = _document_skeleton(root)
    section_properties = root.find(".//w:body/w:sectPr", NS)
    return (
        parts,
        immutable,
        _xml_sha256(skeleton),
        _element_sha256(section_properties),
    )


def paragraph_format_metadata(
    path: str | Path,
) -> list[tuple[str, list[str]]]:
    """Return exact paragraph-property and run-property digests in document order."""
    with ZipFile(path) as archive:
        root = etree.fromstring(archive.read(DOCUMENT_PART))
    result: list[tuple[str, list[str]]] = []
    for paragraph in root.findall(".//w:body/w:p", NS):
        paragraph_properties = paragraph.find("w:pPr", NS)
        run_properties = [
            _element_sha256(run.find("w:rPr", NS)) for run in paragraph.findall(".//w:r", NS)
        ]
        result.append((_element_sha256(paragraph_properties), run_properties))
    return result


def compare_format_integrity(
    *,
    base_path: str | Path,
    candidate_path: str | Path,
) -> list[tuple[str, str]]:
    """Find package, paragraph, or run formatting changes outside editable text."""
    base_parts, base_immutable, base_skeleton, base_section = package_format_metadata(base_path)
    candidate_parts, candidate_immutable, candidate_skeleton, candidate_section = (
        package_format_metadata(candidate_path)
    )
    issues: list[tuple[str, str]] = []
    approved_font_optimization = font_deembedded_equivalent(base_path, candidate_path)
    if base_parts != candidate_parts and not approved_font_optimization:
        issues.append(("package_parts_changed", "The DOCX package part inventory changed."))
    changed_parts = (
        []
        if approved_font_optimization
        else [
            part
            for part, digest in base_immutable.items()
            if candidate_immutable.get(part) != digest
        ]
    )
    if changed_parts:
        issues.append(
            (
                "immutable_package_part_changed",
                f"Untouched DOCX parts changed: {', '.join(changed_parts)}.",
            )
        )
    if base_skeleton != candidate_skeleton:
        issues.append(
            (
                "document_format_skeleton_changed",
                "Paragraph, run, hyperlink, or document formatting structure changed.",
            )
        )
    if base_section != candidate_section:
        issues.append(
            (
                "section_properties_changed",
                "Page size, margins, columns, or section properties changed.",
            )
        )

    base_paragraphs = paragraph_format_metadata(base_path)
    candidate_paragraphs = paragraph_format_metadata(candidate_path)
    if len(base_paragraphs) != len(candidate_paragraphs):
        issues.append(
            (
                "format_paragraph_count_changed",
                "The count of formatted body paragraphs changed.",
            )
        )
        return issues
    for index, (base_format, candidate_format) in enumerate(
        zip(base_paragraphs, candidate_paragraphs, strict=True)
    ):
        if base_format[0] != candidate_format[0]:
            issues.append(
                (
                    "paragraph_format_changed",
                    f"Paragraph {index} spacing, indentation, tabs, or numbering changed.",
                )
            )
        if base_format[1] != candidate_format[1]:
            issues.append(
                (
                    "run_format_changed",
                    f"Paragraph {index} font, size, bold, italic, or color runs changed.",
                )
            )
    return issues


def _bullet_numbering_compacted_equivalent(
    base_path: str | Path,
    candidate_path: str | Path,
) -> bool:
    with ZipFile(base_path) as base, ZipFile(candidate_path) as candidate:
        if NUMBERING_PART not in base.namelist() or NUMBERING_PART not in candidate.namelist():
            return False
        return candidate.read(NUMBERING_PART) == compact_bullet_numbering(base.read(NUMBERING_PART))


def document_xml(path: str | Path) -> bytes:
    with ZipFile(path) as archive:
        return archive.read(DOCUMENT_PART)


def body_paragraphs(root: etree._Element) -> list[etree._Element]:
    return root.findall(".//w:body/w:p", NS)


def _document_skeleton(root: etree._Element) -> etree._Element:
    skeleton = copy.deepcopy(root)
    for node in skeleton.findall(".//w:t", NS):
        node.text = ""
        space_attribute = f"{{{XML_NS}}}space"
        if space_attribute in node.attrib:
            del node.attrib[space_attribute]
    return skeleton


def _element_sha256(element: etree._Element | None) -> str:
    if element is None:
        return hashlib.sha256(b"").hexdigest()
    return _xml_sha256(element)


def _xml_sha256(element: etree._Element) -> str:
    canonical = etree.tostring(element, method="c14n", exclusive=True)
    return hashlib.sha256(canonical).hexdigest()
