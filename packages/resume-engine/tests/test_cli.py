from __future__ import annotations

import json
from pathlib import Path

from aiadapply_v2.cli import app
from typer.testing import CliRunner


def test_parse_emits_machine_readable_json_for_long_job_descriptions() -> None:
    fixture = Path("data/fixtures/pacific_life_platform_engineer_ii_live_2026_09_21.txt")
    result = CliRunner().invoke(app, ["parse", "--paste-file", str(fixture)])

    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    assert payload["job"]["company"] == "Pacific Life"
    assert payload["job"]["title"] == "Platform Engineer II"


def test_queue_batch_reports_partial_errors_without_running_reasoner(monkeypatch, tmp_path):
    from aiadapply_v2 import cli

    first = tmp_path / "one.txt"
    second = tmp_path / "two.txt"
    first.write_text("Complete posting responsibilities and qualifications. " * 15)
    second.write_text("Another complete posting responsibilities and qualifications. " * 15)
    calls = []

    def capture(**kwargs):
        calls.append(kwargs)
        if "Another" in kwargs["raw_paste"]:
            raise RuntimeError("Server unavailable")
        return {"id": "application-1", "duplicate": False}

    monkeypatch.setattr(cli, "queue_terminal_paste", capture)
    result = CliRunner().invoke(
        app, ["queue", "--paste-file", str(first), "--paste-file", str(second), "--save-only"]
    )
    assert result.exit_code == 1
    assert len(calls) == 2
    assert all(call["tailor"] is False for call in calls)
    payload = json.loads(result.stdout)
    assert payload["results"][0]["id"] == "application-1"
    assert payload["results"][1]["error"] == "Server unavailable"
