# Mac development and Windows scheduled discovery

Develop and watch application attempts on the Mac; keep the Windows desktop awake
and logged in for 12-hour discovery. Settings → Application computer chooses which
platform can claim new applications independently of scheduled discovery.

Only switch when there is no RUNNING or SUBMITTING attempt. The server enforces
this under the same database lock used to claim applications. Blocked or uncertain
attempts stay parked and are not retried by switching computers. Exact resume,
live eligibility and employer receipt checks still apply.

## Mac

From `/Users/brianaiad/Code/Projects/aiad_apply`:

```bash
python3 scripts/session-check.py --sync
bash scripts/start-local.sh --no-browser
bash scripts/application-worker.sh start
```

Open http://127.0.0.1:3000/settings and choose **Use Mac for applications**.
The application worker opens a separate visible Chrome window when it claims a
qualifying application. An idle worker does not show a fake application or perform
an unapproved retry. Sign in on the Mac when an employer requires it; browser
cookies and credentials are never copied from Windows.

```bash
# Inspect shared health and selected computers:
curl -fsS http://127.0.0.1:3000/api/health
# Stop only this Mac's application worker (finish/park active work first):
bash scripts/application-worker.sh stop
```

Keep the Mac awake while applications belong to it. If it sleeps, applications
wait; Windows collection and preparation continue. No silent automatic fallback
moves an interrupted form to another computer.

## Return unattended applications to Windows

In Settings choose **Return applications to Windows** after active work finishes.
Windows' existing tailoring supervisor starts its application browser on demand.
For explicit startup on Windows, from `C:\Users\kingt\Desktop\aiad_apply`:

```powershell
python scripts/session-check.py --sync
.\scripts\start-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\application-worker.ps1 -Action start
```

For a safe idle-worker stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\application-worker.ps1 -Action stop
```

The application worker is separate from the dashboard/tailoring/discovery startup
task. Stopping it does not disable the 12-hour collection schedule. Do not stop the
whole desktop service merely to watch applications on the Mac.

Changes made during this development session are uncommitted on both computers.
Git synchronization does not transfer unpublished changes, environment files,
private browser profiles, OAuth credentials or pending application journals.
