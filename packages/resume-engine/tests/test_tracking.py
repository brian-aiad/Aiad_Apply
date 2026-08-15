import json
import urllib.request
from pathlib import Path
from typing import Any

import pytest
from aiadapply_v2 import tracking
from aiadapply_v2.tracking import (
    run_worker,
    submit_terminal_failure,
    submit_worker_progress,
    tracking_configuration,
)

from .helpers import IdentityReasoner


class _JsonResponse:
    status = 200

    def __enter__(self) -> "_JsonResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return b'{"ok": true}'


def test_tracking_defaults_local_and_does_not_borrow_nextauth_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NEXTAUTH_URL", "https://hosted-old-version.example")
    monkeypatch.setenv("WORKER_SECRET", "worker-secret")
    monkeypatch.delenv("AIADAPPLY_TRACKING_URL", raising=False)

    assert tracking_configuration() == ("http://127.0.0.1:3000", "worker-secret")

    monkeypatch.setenv("AIADAPPLY_TRACKING_URL", "https://explicit-tracker.example/")
    assert tracking_configuration() == (
        "https://explicit-tracker.example",
        "worker-secret",
    )


def test_progress_and_failure_requests_are_bearer_authenticated(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    captured: list[tuple[urllib.request.Request, float]] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> _JsonResponse:
        captured.append((request, timeout))
        return _JsonResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    submit_worker_progress(
        api_url="https://tracker.example",
        secret="worker-secret",
        run_id="run-123",
        stage="Parsing the job posting",
    )
    submit_terminal_failure(
        api_url="https://tracker.example",
        secret="worker-secret",
        run_id="run-123",
        error=ValueError("invalid output"),
        output_folder=tmp_path,
    )

    progress_request, progress_timeout = captured[0]
    failure_request, failure_timeout = captured[1]
    assert progress_request.full_url.endswith("/runs/run-123/progress")
    assert progress_request.get_header("Authorization") == "Bearer worker-secret"
    assert json.loads(progress_request.data or b"{}") == {"stage": "Parsing the job posting"}
    assert progress_timeout == 10
    assert failure_request.full_url.endswith("/runs/run-123")
    assert json.loads(failure_request.data or b"{}") == {
        "success": False,
        "error": "ValueError: invalid output",
        "outputFolder": str(tmp_path),
        "keywords": [],
        "changes": [],
        "artifacts": [],
    }
    assert failure_timeout == 60


def test_worker_reports_progress_and_records_transform_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    requests: list[tuple[str, dict[str, Any]]] = []

    def fake_request(
        url: str,
        *,
        secret: str,
        payload: dict[str, Any],
        allow_empty: bool = False,
        timeout_seconds: float = 60,
    ) -> dict[str, Any] | None:
        del secret, allow_empty, timeout_seconds
        requests.append((url, payload))
        if url.endswith("/claim"):
            return {
                "runId": "run-456",
                "applicationId": "application-456",
                "rawPaste": "A complete job posting " * 10,
                "company": "Example Systems",
                "title": "Application Support Engineer",
            }
        return {"ok": True}

    def failed_transform(**kwargs: Any) -> None:
        kwargs["progress"]("Parsing and grading the job posting")
        raise RuntimeError("reasoner unavailable")

    monkeypatch.setattr(tracking, "tracking_configuration", lambda _: ("http://web", "secret"))
    monkeypatch.setattr(tracking, "_request_json", fake_request)
    monkeypatch.setattr(tracking, "transform_resume", failed_transform)

    run_worker(
        reasoner=IdentityReasoner(),
        base_resume=tmp_path / "base.docx",
        candidate_profile=tmp_path / "profile.json",
        output_root=tmp_path,
        once=True,
    )

    progress_calls = [item for item in requests if item[0].endswith("/progress")]
    assert progress_calls == [
        (
            "http://web/api/worker/runs/run-456/progress",
            {"stage": "Parsing and grading the job posting"},
        )
    ]
    final_url, final_payload = requests[-1]
    assert final_url == "http://web/api/worker/runs/run-456"
    assert final_payload["success"] is False
    assert final_payload["error"] == "RuntimeError: reasoner unavailable"
