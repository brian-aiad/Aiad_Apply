#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
profile_root="$repository_root/.runtime/chrome-linkedin-profile"
debug_endpoint="http://127.0.0.1:9222/json/version"
chrome_app="/Applications/Google Chrome.app"

if curl --silent --fail --max-time 2 "$debug_endpoint" >/dev/null 2>&1; then
  echo "LinkedIn review Chrome is already available on port 9222."
  exit 0
fi

if [[ ! -d "$chrome_app" ]]; then
  echo "Google Chrome was not found at $chrome_app" >&2
  exit 1
fi

mkdir -p "$profile_root"
open -na "$chrome_app" --args \
  "--user-data-dir=$profile_root" \
  "--remote-debugging-port=9222" \
  "--no-first-run" \
  "--no-default-browser-check" \
  "https://www.linkedin.com/jobs/"

for _ in $(seq 1 20); do
  if curl --silent --fail --max-time 2 "$debug_endpoint" >/dev/null 2>&1; then
    echo "Opened the isolated LinkedIn review window. Sign in there if LinkedIn asks."
    exit 0
  fi
  sleep 0.5
done

echo "Chrome opened, but its debugging endpoint did not become ready on port 9222." >&2
exit 1
