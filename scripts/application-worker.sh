#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$repository_root"
python3 - "$repository_root" "${1:-start}" <<'PY'
import json, os, signal, subprocess, sys, time
from pathlib import Path

root, action = Path(sys.argv[1]), sys.argv[2]
runtime = root / '.runtime'
runtime.mkdir(exist_ok=True)
record = runtime / 'application-worker.json'
pid = None
if record.exists():
    data = json.loads(record.read_text())
    if data.get('repository') != str(root):
        raise SystemExit('Application worker record belongs to another project.')
    pid = data.get('pid')
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, TypeError):
        pid = None
if action == 'stop':
    if pid:
        cwd = subprocess.run(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], capture_output=True, text=True).stdout
        if f'n{root / "apps/web"}\n' not in cwd:
            raise SystemExit('Refusing to stop an application worker outside this project.')
        os.kill(pid, signal.SIGTERM)
        for _ in range(20):
            time.sleep(.25)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
        else:
            os.killpg(pid, signal.SIGTERM)
    record.unlink(missing_ok=True)
elif action == 'start':
    if pid:
        print('Application browser worker is already running.')
        raise SystemExit(0)
    with (runtime / 'application-worker.log').open('a') as log:
        process = subprocess.Popen(['python3', str(root / 'scripts/run-application-worker.py')], cwd=root / 'apps/web', stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    time.sleep(.5)
    if process.poll() is not None:
        raise SystemExit('Application worker failed to start; see .runtime/application-worker.log')
    record.write_text(json.dumps({'repository': str(root), 'pid': process.pid})+'\n')
    print('Application browser worker running; waiting for resume approvals.')
else:
    raise SystemExit('Usage: bash scripts/application-worker.sh [start|stop]')
PY
