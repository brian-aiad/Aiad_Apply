import io
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest
from aiadapply_v2 import tracking
from aiadapply_v2.tracking import (
    _request_json,
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
        worker_id="worker-123",
    )
    submit_terminal_failure(
        api_url="https://tracker.example",
        secret="worker-secret",
        run_id="run-123",
        error=ValueError("invalid output"),
        output_folder=tmp_path,
        worker_id="worker-123",
    )

    progress_request, progress_timeout = captured[0]
    failure_request, failure_timeout = captured[1]
    assert progress_request.full_url.endswith("/runs/run-123/progress")
    assert progress_request.get_header("Authorization") == "Bearer worker-secret"
    assert json.loads(progress_request.data or b"{}") == {
        "stage": "Parsing the job posting",
        "workerId": "worker-123",
    }
    assert progress_timeout == 10
    assert failure_request.full_url.endswith("/runs/run-123")
    assert json.loads(failure_request.data or b"{}") == {
        "workerId": "worker-123",
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
    claim_retry_attempts: list[int] = []

    def fake_request(
        url: str,
        *,
        secret: str,
        payload: dict[str, Any],
        allow_empty: bool = False,
        timeout_seconds: float = 60,
        retry_attempts: int = 0,
    ) -> dict[str, Any] | None:
        del secret, allow_empty, timeout_seconds
        requests.append((url, payload))
        if url.endswith("/claim"):
            claim_retry_attempts.append(retry_attempts)
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
            {
                "stage": "Parsing and grading the job posting",
                "workerId": requests[0][1]["workerId"],
            },
        )
    ]
    final_url, final_payload = requests[-1]
    assert final_url == "http://web/api/worker/runs/run-456"
    assert final_payload["success"] is False
    assert final_payload["error"] == "RuntimeError: reasoner unavailable"
    assert claim_retry_attempts == [2]


def test_worker_keeps_polling_after_tracking_api_recovers(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = 0
    sleeps: list[float] = []

    def recovering_request(*args: Any, **kwargs: Any) -> None:
        nonlocal calls
        del args, kwargs
        calls += 1
        if calls == 1:
            raise RuntimeError("temporary database outage")
        raise KeyboardInterrupt

    monkeypatch.setattr(tracking, "tracking_configuration", lambda _: ("http://web", "secret"))
    monkeypatch.setattr(tracking, "_request_json", recovering_request)
    monkeypatch.setattr(tracking.time, "sleep", sleeps.append)

    with pytest.raises(KeyboardInterrupt):
        run_worker(
            reasoner=IdentityReasoner(),
            base_resume=tmp_path / "base.docx",
            candidate_profile=tmp_path / "profile.json",
            output_root=tmp_path,
            poll_seconds=0.25,
        )

    assert calls == 2
    assert sleeps == [0.25]


def test_request_retries_transient_server_errors_but_not_client_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts = 0
    sleeps: list[float] = []

    def flaky_urlopen(request: urllib.request.Request, timeout: float) -> _JsonResponse:
        nonlocal attempts
        del request, timeout
        attempts += 1
        if attempts == 1:
            raise urllib.error.HTTPError(
                "https://tracker.example/result",
                503,
                "Unavailable",
                {},
                io.BytesIO(b"try again"),
            )
        return _JsonResponse()

    monkeypatch.setattr(urllib.request, "urlopen", flaky_urlopen)
    monkeypatch.setattr(tracking.time, "sleep", sleeps.append)

    assert _request_json(
        "https://tracker.example/result",
        secret="secret",
        payload={"ok": True},
        retry_attempts=2,
    ) == {"ok": True}
    assert attempts == 2
    assert sleeps == [0.5]
