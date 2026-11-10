# Local automatic startup on macOS

Setup status (2026-10-20): enabled on the Mac at the current Code/Projects checkout.
Windows has a per-user login task installed for its own checkout. Both start the
local dashboard and tailoring worker; the dedicated application browser starts
on demand for approved work on Windows. A due, enabled LinkedIn discovery cycle may also reopen
its own dedicated browser after the shared cooldown check, using saved sign-in.
Manual Open continues to use a blank page. Each computer must be awake and signed
in. A real reboot/login cycle has not yet been observed.

Windows setup: `powershell -File scripts/install-login-startup.ps1`.
Its supervisor is `scripts/keep-local-running.ps1`; process ownership is checked
before stopping services. Browser ownership uses a native exclusive lock.
Mac setup: `python3 scripts/install-login-startup.py`.

This installation uses the per-user LaunchAgent
`~/Library/LaunchAgents/com.brianaiad.aiadapply.plist` to start
`scripts/keep-local-running.sh` at login. The supervisor starts the dashboard and
worker with the existing local launcher and checks their processes every 30
seconds. It leaves running services alone during temporary network outages.

Open or pin <http://127.0.0.1:3000> in Chrome. No terminal needs to remain open.
The Mac must be awake and the user logged in. Moving the repository requires
updating the LaunchAgent's paths. This is a local development server, not a
public deployment.

Supervisor output: `.runtime/autostart.log` and `.runtime/autostart-error.log`.
Dashboard and worker output: `.runtime/web.log` and `.runtime/worker.log`.

Check the service:

```sh
launchctl print "gui/$(id -u)/com.brianaiad.aiadapply"
```

To stop it intentionally, unload the supervisor before stopping the app:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.brianaiad.aiadapply.plist"
bash scripts/stop-local.sh
```

To start it again:

```sh
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.brianaiad.aiadapply.plist"
```

To permanently disable login startup, unload it and remove that plist.
