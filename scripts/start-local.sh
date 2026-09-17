#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
web_root="$repository_root/apps/web"
runtime_root="$repository_root/.runtime"
process_file="$runtime_root/processes.json"
web_log="$runtime_root/web.log"
worker_log="$runtime_root/worker.log"
local_url="http://127.0.0.1:3000"
open_browser=1

if [[ "${1:-}" == "--no-browser" ]]; then
  open_browser=0
elif [[ $# -gt 0 ]]; then
  echo "Usage: bash scripts/start-local.sh [--no-browser]" >&2
  exit 2
fi

node_major=""
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
if [[ "$node_major" != "22" ]]; then
  nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ -s "$nvm_script" && -f "$repository_root/.nvmrc" ]]; then
    set +u
    # shellcheck source=/dev/null
    source "$nvm_script"
    nvm use --silent "$(<"$repository_root/.nvmrc")" >/dev/null
    set -u
  elif command -v brew >/dev/null 2>&1 && brew --prefix node@22 >/dev/null 2>&1; then
    PATH="$(brew --prefix node@22)/bin:$PATH"
    export PATH
  fi
fi

for command_name in node npm uv curl lsof; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -ne 22 ]]; then
  echo "Node.js 22 is required; found $(node --version). Run 'nvm install 22 && nvm use 22'." >&2
  exit 1
fi
if [[ ! -f "$web_root/.env" && ! -f "$web_root/.env.local" ]]; then
  echo "Missing apps/web/.env or apps/web/.env.local; copy .env.example and configure it." >&2
  exit 1
fi
if ! (cd "$repository_root" && uv run python -c 'import aiadapply_v2' >/dev/null 2>&1); then
  if [[ "$(uname -s)" == "Darwin" && -d "$repository_root/.venv" ]] && \
    command -v chflags >/dev/null 2>&1; then
    # A virtual environment copied through Finder can inherit the macOS hidden
    # flag recursively. Python 3.13 then skips its editable-install .pth file.
    chflags -R nohidden "$repository_root/.venv"
  fi
fi
if ! (cd "$repository_root" && uv run python -c 'import aiadapply_v2' >/dev/null 2>&1); then
  echo "Repairing the local Python environment..."
  (cd "$repository_root" && uv sync --extra dev)
fi
if ! (cd "$repository_root" && uv run python -c 'import aiadapply_v2' >/dev/null 2>&1); then
  echo "The resume engine is not importable; run 'uv sync --extra dev' and try again." >&2
  exit 1
fi

mkdir -p "$runtime_root"
if [[ -f "$process_file" ]]; then
  IFS=$'\t' read -r recorded_root web_pid worker_pid < <(
    uv run python - "$process_file" <<'PY'
import json, sys
record = json.load(open(sys.argv[1], encoding="utf-8"))
print(record.get("repository", ""), record.get("webPid", ""), record.get("workerPid", ""), sep="\t")
PY
  )
  if [[ "$recorded_root" != "$repository_root" ]]; then
    echo "The process record does not belong to this repository." >&2
    exit 1
  fi
  web_running=0
  worker_running=0
  kill -0 "$web_pid" 2>/dev/null && web_running=1
  kill -0 "$worker_pid" 2>/dev/null && worker_running=1
  if [[ $web_running -eq 1 && $worker_running -eq 1 ]] && \
    curl --silent --fail --max-time 2 "$local_url/api/health" | grep -q '"status":"ready"'; then
      echo "AIAD Apply is already running at $local_url"
      if [[ $open_browser -eq 1 ]] && command -v open >/dev/null 2>&1; then open "$local_url"; fi
      exit 0
  fi
  if [[ $web_running -eq 1 || $worker_running -eq 1 ]]; then
    echo "Recovering an incomplete AIAD Apply start..."
    bash "$repository_root/scripts/stop-local.sh"
  else
    rm -f "$process_file"
  fi
fi

web_pid=""
worker_pid=""
started_web=0
cleanup_failed_start() {
  [[ -n "$worker_pid" ]] && kill "$worker_pid" 2>/dev/null || true
  [[ $started_web -eq 1 && -n "$web_pid" ]] && kill "$web_pid" 2>/dev/null || true
  rm -f "$process_file"
}
trap cleanup_failed_start ERR INT TERM

if curl --silent --fail --max-time 2 "$local_url" >/dev/null 2>&1; then
  web_pid="$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -n 1)"
  web_cwd="$(lsof -a -p "$web_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  if [[ -z "$web_pid" || "$web_cwd" != "$web_root" ]]; then
    echo "Port 3000 is already used by a process outside $web_root." >&2
    false
  fi
  echo "Reusing the existing AIAD Apply dashboard on port 3000."
else
  (cd "$web_root" && exec nohup npm run dev -- --hostname 127.0.0.1 --port 3000) \
    >"$web_log" 2>&1 &
  web_pid=$!
  started_web=1
fi

ready=0
for _ in $(seq 1 60); do
  if curl --silent --fail --max-time 2 "$local_url" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$web_pid" 2>/dev/null; then break; fi
  sleep 0.5
done
if [[ $ready -ne 1 ]]; then
  echo "Dashboard failed to start. See $web_log" >&2
  false
fi

(cd "$repository_root" && exec nohup uv run aiadapply worker --api-url "$local_url") \
  >"$worker_log" 2>&1 &
worker_pid=$!
worker_ready=0
for _ in $(seq 1 20); do
  if ! kill -0 "$worker_pid" 2>/dev/null; then break; fi
  if curl --silent --fail --max-time 2 "$local_url/api/health" | grep -q '"status":"ready"'; then
    worker_ready=1
    break
  fi
  sleep 0.5
done
if [[ $worker_ready -ne 1 ]]; then
  echo "Worker failed to start. See $worker_log" >&2
  false
fi

uv run python - "$process_file" "$repository_root" "$web_pid" "$worker_pid" <<'PY'
import datetime, json, sys
path, repository, web_pid, worker_pid = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "repository": repository,
        "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "webPid": int(web_pid),
        "workerPid": int(worker_pid),
    }, handle, indent=2)
    handle.write("\n")
PY

trap - ERR INT TERM
echo "AIAD Apply is running at $local_url"
echo "Logs: $web_log and $worker_log"
echo "Stop it with: bash scripts/stop-local.sh"
if [[ $open_browser -eq 1 ]] && command -v open >/dev/null 2>&1; then open "$local_url"; fi
