#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
process_file="$repository_root/.runtime/processes.json"

if [[ ! -f "$process_file" ]]; then
  echo "No AIAD Apply local process record was found."
  exit 0
fi

IFS=$'\t' read -r recorded_root web_pid worker_pid < <(
  python3 - "$process_file" <<'PY'
import json, sys
record = json.load(open(sys.argv[1], encoding="utf-8"))
print(record.get("repository", ""), record.get("webPid", ""), record.get("workerPid", ""), sep="\t")
PY
)
if [[ "$recorded_root" != "$repository_root" ]]; then
  echo "The process record does not belong to this repository." >&2
  exit 1
fi

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

stop_tree() {
  local pid="$1" expected_root="$2" validate_root="${3:-1}" cwd
  if ! kill -0 "$pid" 2>/dev/null; then return; fi
  if [[ "$validate_root" == "1" ]]; then
    cwd="$(process_cwd "$pid")"
    if [[ "$cwd" != "$expected_root" && "$cwd" != "$expected_root/apps/web" ]]; then
      echo "Refusing to stop PID $pid because its working directory is '$cwd'." >&2
      exit 1
    fi
  fi
  local child
  while read -r child; do
    [[ -n "$child" ]] && stop_tree "$child" "$expected_root" 0
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid"
}

stop_tree "$worker_pid" "$repository_root"
stop_tree "$web_pid" "$repository_root"
rm -f "$process_file"
echo "AIAD Apply local services stopped."
