from __future__ import annotations

import base64
import hashlib
import json
import os
import socket
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

from aiadapply_v2.config import default_output_root
from aiadapply_v2.pipeline import Reasoner, transform_resume
from aiadapply_v2.schemas import TransformationReport

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUTPUT_ROOT = default_output_root()


def load_tracking_environment() -> None:
    candidates = [
        REPOSITORY_ROOT / "apps" / "web" / ".env",
        REPOSITORY_ROOT / "apps" / "web" / ".env.local",
    ]
    for candidate in candidates:
        if not candidate.exists():
            continue
        for raw_line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def tracking_configuration(
    api_url: str | None = None,
) -> tuple[str, str]:
    load_tracking_environment()
    url = (api_url or os.environ.get("AIADAPPLY_TRACKING_URL") or "http://127.0.0.1:3000").rstrip(
        "/"
    )
    secret = os.environ.get("WORKER_SECRET") or os.environ.get("CRON_SECRET")
    if not secret:
        raise RuntimeError("WORKER_SECRET or CRON_SECRET is required for tracking.")
    return url, secret


def register_terminal_run(
    *,
    raw_paste: str,
    api_url: str | None = None,
) -> tuple[str, str, str, str, str]:
    url, secret = tracking_configuration(api_url)
    worker_id = f"terminal-{socket.gethostname()}-{os.getpid()}"
    result = _request_json(
        f"{url}/api/worker/register",
        secret=secret,
        payload={"workerId": worker_id, "rawPaste": raw_paste},
    )
    if result is None:
        raise RuntimeError("Tracking registration returned no application.")
    return url, secret, str(result["applicationId"]), str(result["runId"]), worker_id


def submit_terminal_result(
    *,
    api_url: str,
    secret: str,
    run_id: str,
    report: TransformationReport,
    output_folder: Path,
    application_id: str,
    worker_id: str,
) -> None:
    _request_json(
        f"{api_url}/api/worker/runs/{run_id}",
        secret=secret,
        payload=build_worker_payload(
            report=report,
            output_folder=output_folder,
            application_id=application_id,
            worker_id=worker_id,
        ),
        retry_attempts=2,
    )


def submit_worker_progress(
    *,
    api_url: str,
    secret: str,
    run_id: str,
    stage: str,
    worker_id: str,
) -> None:
    _request_json(
        f"{api_url}/api/worker/runs/{run_id}/progress",
        secret=secret,
        payload={"stage": stage, "workerId": worker_id},
        timeout_seconds=10,
    )


def submit_terminal_failure(
    *,
    api_url: str,
    secret: str,
    run_id: str,
    error: BaseException,
    output_folder: Path,
    worker_id: str,
) -> None:
    _request_json(
        f"{api_url}/api/worker/runs/{run_id}",
        secret=secret,
        payload={
            "workerId": worker_id,
            "success": False,
            "error": f"{type(error).__name__}: {error}",
            "outputFolder": str(output_folder),
            "keywords": [],
            "changes": [],
            "artifacts": [],
        },
        retry_attempts=2,
    )


def run_worker(
    *,
    reasoner: Reasoner,
    base_resume: Path,
    candidate_profile: Path,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
    api_url: str | None = None,
    once: bool = False,
    poll_seconds: float = 3.0,
) -> None:
    url, secret = tracking_configuration(api_url)
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    while True:
        claimed = _request_json(
            f"{url}/api/worker/claim",
            secret=secret,
            payload={"workerId": worker_id},
            allow_empty=True,
        )
        if claimed is None:
            if once:
                return
            time.sleep(poll_seconds)
            continue
        run_id = str(claimed["runId"])
        application_id = str(claimed["applicationId"])
        raw_paste = str(claimed["rawPaste"])
        company = str(claimed["company"])
        title = str(claimed["title"])
        folder = output_root / (
            f"{date.today().isoformat()}_{_slug(company)}_{_slug(title)}_run_{run_id[:8]}"
        )
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "job-description.txt").write_text(raw_paste.rstrip() + "\n", encoding="utf-8")
        progress_sync_available = True

        def report_progress(message: str, *, current_run_id: str = run_id) -> None:
            nonlocal progress_sync_available
            print(f"[{time.strftime('%H:%M:%S')}] {message}")
            if not progress_sync_available:
                return
            try:
                submit_worker_progress(
                    api_url=url,
                    secret=secret,
                    run_id=current_run_id,
                    stage=message,
                    worker_id=worker_id,
                )
            except Exception as error:
                progress_sync_available = False
                print(f"Progress sync unavailable; continuing locally: {error}")

        try:
            report = transform_resume(
                raw_paste=raw_paste,
                base_resume=base_resume,
                output_dir=folder,
                reasoner=reasoner,
                candidate_profile=candidate_profile,
                progress=report_progress,
            )
            payload = build_worker_payload(
                report=report,
                output_folder=folder,
                application_id=application_id,
                worker_id=worker_id,
            )
        except Exception as error:
            payload = {
                "workerId": worker_id,
                "success": False,
                "error": f"{type(error).__name__}: {error}",
                "outputFolder": str(folder),
                "keywords": [],
                "changes": [],
                "artifacts": [],
            }
        try:
            _request_json(
                f"{url}/api/worker/runs/{run_id}",
                secret=secret,
                payload=payload,
                retry_attempts=2,
            )
        except Exception as error:
            print(f"Final result sync failed; the run will be recovered by its lease: {error}")
            if once:
                raise
        if once:
            return


def build_worker_payload(
    *,
    report: TransformationReport,
    output_folder: Path,
    application_id: str,
    worker_id: str,
) -> dict[str, Any]:
    del application_id
    report_payload = report.model_dump(mode="json")
    keywords = []
    for decision in report.keyword_decisions:
        item = decision.model_dump(mode="json")
        item["placement"] = ", ".join(decision.placements)
        keywords.append(item)
    files = [
        ("DOCX", output_folder / "Brian_Aiad_resume.docx"),
        ("PDF", output_folder / "Brian_Aiad_resume.pdf"),
        ("REPORT_JSON", output_folder / "transformation_report.json"),
        ("REPORT_MARKDOWN", output_folder / "transformation_report.md"),
        ("CHARACTER_AUDIT", output_folder / "character_audit.json"),
        ("JOB_DESCRIPTION", output_folder / "job-description.txt"),
    ]
    artifacts = [_artifact_payload(kind, path) for kind, path in files if path.exists()]
    return {
        "workerId": worker_id,
        "success": True,
        "outputFolder": str(output_folder),
        "report": report_payload,
        "keywords": keywords,
        "changes": [change.model_dump(mode="json") for change in report.changes],
        "artifacts": artifacts,
    }


def _artifact_payload(kind: str, path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    content_types = {
        "DOCX": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "PDF": "application/pdf",
        "REPORT_JSON": "application/json",
        "REPORT_MARKDOWN": "text/markdown",
        "CHARACTER_AUDIT": "application/json",
        "JOB_DESCRIPTION": "text/plain",
    }
    return {
        "kind": kind,
        "fileName": path.name,
        "localPath": str(path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "byteSize": len(data),
        "contentType": content_types[kind],
        "contentBase64": base64.b64encode(data).decode("ascii"),
    }


def _request_json(
    url: str,
    *,
    secret: str,
    payload: dict[str, Any],
    allow_empty: bool = False,
    timeout_seconds: float = 60,
    retry_attempts: int = 0,
) -> dict[str, Any] | None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    for attempt in range(retry_attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                content = response.read()
                if response.status == 204 or not content:
                    return None
                parsed: dict[str, Any] = json.loads(content.decode("utf-8"))
                return parsed
        except urllib.error.HTTPError as error:
            if allow_empty and error.code in {204, 409}:
                return None
            detail = error.read().decode("utf-8", errors="replace")
            if error.code not in {429, 500, 502, 503, 504} or attempt >= retry_attempts:
                raise RuntimeError(f"Tracking API returned {error.code}: {detail}") from error
        except (TimeoutError, urllib.error.URLError) as error:
            if attempt >= retry_attempts:
                raise RuntimeError(f"Tracking API is unreachable: {error}") from error
        time.sleep(0.5 * (2**attempt))
    raise RuntimeError("Tracking API request exhausted its retry budget.")


def _slug(value: str) -> str:
    import re

    slug = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return slug[:80] or "unknown"
