"""Hold the native installation lock for the lifetime of the browser worker."""

import os
import secrets
import signal
import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    runtime = root / ".runtime"
    runtime.mkdir(exist_ok=True)
    descriptor = os.open(runtime / "application-worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
    if sys.platform == "win32":
        import json
        import msvcrt

        if os.fstat(descriptor).st_size == 0:
            os.write(descriptor, b"0")
        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        except OSError:
            os.close(descriptor)
            raise SystemExit("Another application browser worker owns this installation.") from None
        token = secrets.token_hex(32)
        proof = runtime / "application-launch.json"
        proof.write_text(json.dumps({"pid": os.getpid(), "token": token}), encoding="utf-8")
        environment = {
            **os.environ,
            "AIADAPPLY_APPLICATION_PARENT_PID": str(os.getpid()),
            "AIADAPPLY_APPLICATION_LOCK_TOKEN": token,
        }
        child = subprocess.Popen(
            ["node", "scripts/application-browser/worker.mjs", *sys.argv[1:]],
            cwd=root / "apps/web",
            env=environment,
            stdin=subprocess.PIPE,
        )

        def stop(_signum: int, _frame: object) -> None:
            child.terminate()

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        try:
            raise SystemExit(child.wait())
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=10)
            proof.unlink(missing_ok=True)
            os.close(descriptor)
    else:
        import fcntl

        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(descriptor)
            raise SystemExit("Another application browser worker owns this installation.") from None
        os.set_inheritable(descriptor, True)
        os.ftruncate(descriptor, 0)
        os.write(descriptor, f"{os.getpid()}\n".encode())
        os.environ["AIADAPPLY_APPLICATION_LOCK_FD"] = str(descriptor)
        os.chdir(root / "apps/web")
        os.execvp("node", ["node", "scripts/application-browser/worker.mjs", *sys.argv[1:]])


if __name__ == "__main__":
    main()
