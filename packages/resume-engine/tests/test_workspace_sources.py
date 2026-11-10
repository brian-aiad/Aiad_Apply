import base64
import hashlib
from pathlib import Path

import pytest
from aiadapply_v2.tracking import material_sources


def test_shared_material_preserves_source_and_validates_actual_bytes(tmp_path: Path) -> None:
    original = tmp_path / "original.docx"
    original.write_bytes(b"original")
    content = b"shared"
    material = {
        "candidateProfile": {"confirmed_skills": ["Fixture"]},
        "baseResume": {
            "contentBase64": base64.b64encode(content).decode(),
            "byteSize": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        },
    }
    base, profile = material_sources(
        material, tmp_path / "run", original, tmp_path / "profile.json"
    )
    assert base.read_bytes() == content
    assert original.read_bytes() == b"original"
    assert "Fixture" in profile.read_text()
    material["baseResume"]["sha256"] = "0" * 64  # type: ignore[index]
    with pytest.raises(ValueError, match="fingerprint"):
        material_sources(material, tmp_path / "bad", original, profile)
