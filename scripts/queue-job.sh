#!/usr/bin/env bash
set -euo pipefail
queue_repo_root="$(cd "$(dirname "$0")/.." && pwd -P)"
export PYTHONPATH="$queue_repo_root/packages/resume-engine/src${PYTHONPATH:+:$PYTHONPATH}"
cd "$queue_repo_root"
exec uv run aiadapply queue "$@"
