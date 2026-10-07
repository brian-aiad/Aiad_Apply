# Local automatic startup on macOS

Setup status: prepared but not enabled. macOS denied the LaunchAgent access to
this Desktop repository. The failed agent was unloaded and its configuration
saved as `.runtime/com.brianaiad.aiadapply.plist.pending`. Resolve the project
location or macOS permission before installing it in `~/Library/LaunchAgents`.
The regular local services remain running.

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
