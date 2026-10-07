#!/usr/bin/env bash
# Foreground supervisor for the per-user macOS LaunchAgent.
set -euo pipefail
repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$repository_root"

exec uv run python - "$repository_root" <<'PY'
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(sys.argv[1])
record_path = root / ".runtime/processes.json"


def services_running():
    try:
        record = json.loads(record_path.read_text())
        if record.get("repository") != str(root):
            return False
        for key in ("webPid", "workerPid"):
            pid = record[key]
            if not isinstance(pid, int) or pid <= 1:
                return False
            os.kill(pid, 0)
        return True
    except (OSError, ValueError, KeyError):
        return False


print("AIAD Apply background supervisor started.", flush=True)
while True:
    # Network/database outages are not a reason to interrupt active tailoring.
    # The existing launcher validates ownership and recovers missing processes.
    if not services_running():
        result = subprocess.run(
            ["/bin/bash", str(root / "scripts/start-local.sh"), "--no-browser"],
            cwd=root,
            check=False,
        )
        if result.returncode:
            print("Startup unsuccessful; retrying in 30 seconds.", flush=True)
    time.sleep(30)
PY
