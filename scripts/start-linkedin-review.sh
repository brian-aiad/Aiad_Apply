#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd -P)"
profile_root="$repository_root/.runtime/chrome-linkedin-profile"
debug_endpoint="http://127.0.0.1:9222/json/version"
chrome_app="/Applications/Google Chrome.app"
verify_owner() {
  local listener_pid owner_command
  listener_pid="$(/usr/sbin/lsof -nP -tiTCP:9222 -sTCP:LISTEN 2>/dev/null | sort -u || true)"
  if [[ ! "$listener_pid" =~ ^[0-9]+$ ]]; then
    echo "Cannot establish the owner of port 9222. No browser was launched or reused." >&2; return 1
  fi
  owner_command="$(ps -ww -p "$listener_pid" -o command=)"
  case "$owner_command " in
    *"Google Chrome"*"--user-data-dir=$profile_root "*) return 0 ;;
    *) echo "Port 9222 belongs to another browser/profile. Close that debugging session or resolve the port conflict; it will not be reused." >&2; return 1 ;;
  esac
}

if curl --silent --fail --max-time 2 "$debug_endpoint" >/dev/null 2>&1; then
  verify_owner
  echo "Dedicated LinkedIn Chrome verified on port 9222. No navigation was performed."
  exit 0
fi
if [[ ! -d "$chrome_app" ]]; then echo "Google Chrome was not found at $chrome_app" >&2; exit 1; fi
mkdir -p "$repository_root/.runtime"
launch_lock="$repository_root/.runtime/linkedin-launch.lock"
if ! mkdir "$launch_lock" 2>/dev/null; then echo "Another LinkedIn browser launch is in progress. No duplicate browser was opened." >&2; exit 1; fi
trap 'rmdir "$launch_lock" 2>/dev/null || true' EXIT
if [[ -e "$profile_root/SingletonLock" || -L "$profile_root/SingletonLock" ]]; then
  echo "The dedicated Chrome profile is locked but its debugging endpoint is unavailable. Close that profile's Chrome window and retry. Its lock and data were left intact." >&2; exit 1
fi
if /usr/sbin/lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 9222 is occupied. No browser was launched." >&2; exit 1
fi
mkdir -p "$profile_root"
open -na "$chrome_app" --args \
  "--user-data-dir=$profile_root" "--remote-debugging-port=9222" \
  "--no-first-run" "--no-default-browser-check" "about:blank"
for _ in $(seq 1 20); do
  if curl --silent --fail --max-time 2 "$debug_endpoint" >/dev/null 2>&1; then
    verify_owner
    echo "Opened the dedicated LinkedIn window without navigation. Open LinkedIn manually when access is available."
    exit 0
  fi
  sleep 0.5
done
echo "Chrome opened, but its debugging endpoint is unavailable. No second browser was launched." >&2
exit 1
