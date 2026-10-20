# Current development handoff

Updated: 2026-10-20 UTC (October 19 Pacific). Device: MacBook.
Branch to continue: `codex/cross-device-handoff`.

## Objective and latest decision

Brian wants to switch between his desktop and MacBook without repeating project
context. Both computers use their own local checkout; GitHub carries published
code and this technical checkpoint. Brian authorized publishing this setup to a
separate branch, not merging or pushing main. Earlier dated push instructions
elsewhere are historical. Future publication still needs current authorization.

## Completed

- Root AGENTS.md requires a GitHub fetch/check and reading this note before new
  work, and refreshing this note at checkpoints and session end.
- `scripts/session-check.py --sync` fast-forwards only a clean matching branch.
  It preserves dirty/divergent/unpublished branches, reports comparison with the
  default branch and recent remote branches, and fails visibly on fetch errors.
- Shared history remains in `docs/session-handoff.md` and
  `docs/WINDOWS_CONTINUATION.md`; read these after the current checkpoint. Old
  application outcomes are historical, not current database verification.
- Current Mac primary project folder was set by Brian to
  `/Users/brianaiad/Code/Projects/aiad_apply`. Each device needs its own path.

## Dev startup recovery

The default Turbopack dev run coincided with a Mac crash/reboot; its log contained
543 Node malloc-stack warnings and many build child processes. This suggests a
runaway compilation but is not a confirmed OS crash diagnosis. Changed the dev
script to `next dev --webpack` and set `experimental.cpus: 2` in next.config.ts.
The subsequent launch returned HTTP 200 for `/`; `/api/health` reported ready,
database/base resume/worker true and one worker. No equivalent process explosion
was seen during that check. This is not an extended stability certification.
Keep these local dev settings when publishing this handoff. Do not start multiple
dev servers or heavy parallel builds. Check health and processes before restarting.

## Verification

- Six isolated real-Git fixture tests passed: clean fast-forward, report-only,
  dirty work preservation, diverged commits, unpublished branch, fetch failure.
- Live GitHub check on the existing checkout fetched successfully and preserved
  all local work; main was one commit behind the existing local reconciliation.
- Ruff formatting/lint and final rerun are recorded in the publishing session.
- No application submissions, deployments or database changes for this setup.

## One-time desktop bootstrap / next action

The desktop cannot follow instructions it has not received yet. In its existing
checkout, inspect `git status` and preserve any local work first, then:

```text
git fetch origin
git switch --track origin/codex/cross-device-handoff
python scripts/session-check.py --sync
```

If the branch already exists, switch to it without `--track`. Do not switch over
uncommitted changes or discard desktop-only commits. If desktop work diverges,
inspect it and reconcile deliberately before continuing. Never use reset/clean or
force push to make the check pass. This branch includes the prior reviewed local
reconciliation commit; it is intentionally separate from main.

Attach that desktop checkout as the project's primary local folder, then start a
new local chat. Ask it to continue AIAD_APPLY; AGENTS.md tells it to recover this
checkpoint and inspect newer remote branches. The next substantive build prompt
has not been supplied yet. Do not invent or resume an unrelated old task.

## Session-end contract and limitations

Update this note with the actual requested outcome, decisions, changed paths,
tests and remaining work before ending. Publish only specifically reviewed source
paths within authorization. Only pushed work can be recovered on another device;
if a session is interrupted before a push, that work remains on the first device.
Chat sync does not upload the repository. This workflow runs when an agent starts
work; it is not a background Git daemon or an unconditional chat-start hook.

Credentials, .env files, .runtime, browser sign-ins and dependencies remain
private and device-local. Application records use the existing configured shared
database; Git is not a backup or transfer tool for those records. Check live worker
ownership before starting browser workers on another computer.
