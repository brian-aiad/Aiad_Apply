# Overnight Codex workflow

This project uses Codex Goal mode for large, unattended tasks. Goal mode keeps one durable
objective attached to the current chat, works across multiple turns, and stops only at a stated
completion condition. The full prompt is stored in an ignored file because a goal objective is
limited to 4,000 characters.

## One-time setup

- Goal mode is enabled in this Codex installation.
- `prevent_idle_sleep` is enabled in the global Codex configuration. Restart Codex once after this
  setup so the setting is loaded everywhere.
- Keep the computer plugged in, powered on, connected to the internet, and keep the ChatGPT/Codex
  desktop app running. Do not let Windows hibernate.

The sleep-prevention feature helps only while Codex is actively running. Windows power policy,
forced restarts, lost connectivity, account usage limits, and requests that require a human choice
can still pause work.

## Start an overnight task

Open this project in a new chat and paste the following header immediately before the complete
request. The request can be much longer than 4,000 characters.

```text
OVERNIGHT GOAL

<paste the complete project request here>
```

That phrase explicitly authorizes Codex to:

1. preserve the full prompt in `docs/overnight/runs/ACTIVE_TASK.md`;
2. create a concise Goal-mode objective that points to the saved prompt;
3. implement, test, review, and iterate until the prompt's verifiable stopping condition is met;
4. checkpoint resumable state in `docs/overnight/runs/PROGRESS.md`; and
5. leave a completion report in `docs/overnight/runs/LAST_RESULT.md`.

You can include your own structure or use [TASK_TEMPLATE.md](TASK_TEMPLATE.md). Clear acceptance
criteria matter more than formatting.

## While it runs

- Use `/goal` to inspect the active objective.
- Use `/goal pause`, `/goal resume`, `/goal edit`, or `/goal clear` to control it.
- Send a follow-up in the same chat to add constraints or steer the work.
- Do not launch another writer against this same checkout. Use a worktree for truly independent
  parallel work.

If an account usage limit pauses the run, leave the goal in place. Resume the same chat after the
limit resets; the ignored progress file is the durable recovery checkpoint. Official documentation
does not promise that every quota interruption will automatically retry at the exact reset minute.

For an extra wake-up signal, create a scheduled task in this same chat for a few minutes after the
usual reset time:

```text
Every day at 2:05 AM America/Los_Angeles, return to this chat. If it has an active goal, read
docs/overnight/runs/ACTIVE_TASK.md and docs/overnight/runs/PROGRESS.md, then resume the goal from
the next unfinished checkpoint. If no goal is active, do nothing. Never start a second writer in
the same checkout.
```

Scheduled local tasks require the desktop app to stay running and this project to remain available
on disk. The schedule is a recovery nudge; Goal mode remains the owner of completion.

## Morning review

Read `docs/overnight/runs/LAST_RESULT.md`, inspect `git diff`, and review the listed test evidence.
An overnight run may make source changes, but it must not deploy or perform external/destructive
actions unless the task explicitly authorized those actions.
