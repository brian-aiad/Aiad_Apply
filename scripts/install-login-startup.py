"""Install the user-authorized dashboard/tailoring LaunchAgent on macOS."""

import os
import plistlib
import subprocess
import sys
from pathlib import Path

if sys.platform != "darwin":
    raise SystemExit("Use install-login-startup.ps1 on Windows.")
root = Path(__file__).resolve().parent.parent
runtime = root / ".runtime"
runtime.mkdir(exist_ok=True)
file = Path.home() / "Library/LaunchAgents/com.brianaiad.aiadapply.plist"
file.parent.mkdir(parents=True, exist_ok=True)
file.write_bytes(
    plistlib.dumps(
        {
            "Label": "com.brianaiad.aiadapply",
            "ProgramArguments": ["/bin/bash", str(root / "scripts/keep-local-running.sh")],
            "WorkingDirectory": str(root),
            "RunAtLoad": True,
            "KeepAlive": True,
            "EnvironmentVariables": {"PATH": os.environ["PATH"]},
            "StandardOutPath": str(runtime / "autostart.log"),
            "StandardErrorPath": str(runtime / "autostart-error.log"),
        }
    )
)
subprocess.run(
    ["launchctl", "bootout", f"gui/{os.getuid()}", str(file)], check=False, capture_output=True
)
subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(file)], check=True)
print("Login startup enabled for dashboard/tailoring. Browser automation is on demand.")
