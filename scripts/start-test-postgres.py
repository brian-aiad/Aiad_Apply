"""Start the dedicated Windows QA database without inheriting console pipes."""

import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
binary = root / ".runtime/postgresql-qa/pgsql/bin/pg_ctl.exe"
data = root / ".runtime/oct26-test-postgres"
log = root / ".runtime/oct26-test-postgres.log"
if sys.platform != "win32" or not (data / "PG_VERSION").is_file():
    raise SystemExit("Requires the initialized Windows QA cluster.")
with log.with_suffix(".launcher.log").open("a", encoding="utf-8") as output:
    result = subprocess.run(
        [
            str(binary),
            "-D",
            str(data),
            "-l",
            str(log),
            "-o",
            "-p 55436 -h 127.0.0.1",
            "-w",
            "start",
        ],
        stdin=subprocess.DEVNULL,
        stdout=output,
        stderr=output,
        timeout=40,
    )
raise SystemExit(result.returncode)
