from __future__ import annotations

import re
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPE_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
FONT_TABLE = "word/fontTable.xml"
FONT_RELATIONSHIPS = "word/_rels/fontTable.xml.rels"
SETTINGS = "word/settings.xml"
CONTENT_TYPES = "[Content_Types].xml"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def write_ats_optimized_docx(source_path: str | Path, output_path: str | Path) -> Path:
    """Remove embedded font binaries while preserving document and run formatting."""
    source_path = Path(source_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with (
        ZipFile(source_path) as source,
        ZipFile(
            output_path,
            "w",
            compression=ZIP_DEFLATED,
        ) as destination,
    ):
        destination.comment = source.comment
        for member in source.infolist():
            if _is_embedded_font_part(member.filename):
                continue
            destination.writestr(
                member,
                _optimized_part(member.filename, source.read(member)),
            )
    return output_path


def font_deembedded_equivalent(base_path: str | Path, candidate_path: str | Path) -> bool:
    """Verify that immutable package differences are exactly the approved font removal."""
    with ZipFile(base_path) as base, ZipFile(candidate_path) as candidate:
        expected_names = {name for name in base.namelist() if not _is_embedded_font_part(name)}
        if set(candidate.namelist()) != expected_names:
            return False
        for name in expected_names:
            if name == "word/document.xml":
                continue
            expected = _optimized_part(name, base.read(name))
            if candidate.read(name) != expected:
                return False
    return True


def extract_embedded_fonts(source_path: str | Path, output_dir: str | Path) -> list[Path]:
    """Extract OOXML-obfuscated fonts for temporary, local render validation."""
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    with ZipFile(source_path) as source:
        if FONT_TABLE not in source.namelist() or FONT_RELATIONSHIPS not in source.namelist():
            return extracted
        font_table = etree.fromstring(source.read(FONT_TABLE))
        relationships = etree.fromstring(source.read(FONT_RELATIONSHIPS))
        targets = {
            relationship.get("Id", ""): relationship.get("Target", "")
            for relationship in relationships.findall(f"{{{REL_NS}}}Relationship")
            if str(relationship.get("Type", "")).endswith("/font")
        }
        for element in font_table.iter():
            if etree.QName(element).localname not in {
                "embedRegular",
                "embedBold",
                "embedItalic",
                "embedBoldItalic",
            }:
                continue
            relationship_id = element.get(f"{{{OFFICE_REL_NS}}}id", "")
            target = PurePosixPath(targets.get(relationship_id, ""))
            key_hex = re.sub(r"[^0-9A-Fa-f]", "", element.get(f"{{{W_NS}}}fontKey", ""))
            if len(key_hex) != 32 or target.is_absolute() or ".." in target.parts:
                continue
            package_path = str(PurePosixPath("word") / target)
            if not _is_embedded_font_part(package_path) or package_path not in source.namelist():
                continue
            data = bytearray(source.read(package_path))
            mask = bytes.fromhex(key_hex)[::-1]
            for index in range(min(32, len(data))):
                data[index] ^= mask[index % len(mask)]
            if bytes(data[:4]) not in {b"\x00\x01\x00\x00", b"OTTO", b"true", b"typ1"}:
                continue
            output = destination / f"{target.stem}.ttf"
            output.write_bytes(data)
            extracted.append(output)
    return extracted


def _is_embedded_font_part(name: str) -> bool:
    return name.startswith("word/fonts/") and name.casefold().endswith(".odttf")


def _optimized_part(name: str, data: bytes) -> bytes:
    if name == FONT_TABLE:
        return _remove_font_embed_elements(data)
    if name == FONT_RELATIONSHIPS:
        return _remove_font_relationships(data)
    if name == SETTINGS:
        return _remove_font_embedding_settings(data)
    if name == CONTENT_TYPES:
        return _remove_font_content_type(data)
    return data


def _remove_font_embed_elements(data: bytes) -> bytes:
    root = etree.fromstring(data)
    for local_name in ("embedRegular", "embedBold", "embedItalic", "embedBoldItalic"):
        for element in root.findall(f".//{{{W_NS}}}{local_name}"):
            parent = element.getparent()
            if parent is not None:
                parent.remove(element)
    return _serialize(root)


def _remove_font_relationships(data: bytes) -> bytes:
    root = etree.fromstring(data)
    for relationship in root.findall(f"{{{REL_NS}}}Relationship"):
        if str(relationship.get("Type", "")).endswith("/font"):
            root.remove(relationship)
    return _serialize(root)


def _remove_font_embedding_settings(data: bytes) -> bytes:
    root = etree.fromstring(data)
    for local_name in ("embedTrueTypeFonts", "saveSubsetFonts"):
        for element in root.findall(f"{{{W_NS}}}{local_name}"):
            root.remove(element)
    return _serialize(root)


def _remove_font_content_type(data: bytes) -> bytes:
    root = etree.fromstring(data)
    for default in root.findall(f"{{{CONTENT_TYPE_NS}}}Default"):
        if str(default.get("Extension", "")).casefold() == "odttf":
            root.remove(default)
    return _serialize(root)


def _serialize(root: etree._Element) -> bytes:
    return etree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        standalone=True,
    )
