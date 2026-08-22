#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")" && pwd -P)"
exec /usr/bin/env bash "$repository_root/scripts/stop-local.sh"
