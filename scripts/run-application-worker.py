"""Hold an OS-level exclusive lock for the lifetime of the browser worker."""
import fcntl
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
lock_path = root / ".runtime/application-worker.lock"
lock_path.parent.mkdir(exist_ok=True)
descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
try:
    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    os.close(descriptor)
    raise SystemExit("Another application browser worker already owns this installation.")
os.set_inheritable(descriptor, True)
os.ftruncate(descriptor, 0)
os.write(descriptor, f"{os.getpid()}\n".encode())
os.environ["AIADAPPLY_APPLICATION_LOCK_FD"] = str(descriptor)
os.chdir(root / "apps/web")
os.execvp("node", ["node", "scripts/application-browser/worker.mjs", *sys.argv[1:]])
