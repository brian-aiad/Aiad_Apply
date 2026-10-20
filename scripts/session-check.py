"""Check cross-device Git state; fast-forward only clean, matching branches."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(
            f"git {args[0]} failed (exit {result.returncode}); resolve locally before syncing"
        )
    return result.stdout.strip()


def check(sync: bool = False) -> int:
    dirty = bool(git("status", "--porcelain"))
    branch = git("branch", "--show-current")
    print(f"Repository: {ROOT}\nBranch: {branch or 'detached HEAD'}")
    print(f"Local changes: {'present; preserved' if dirty else 'none'}")
    # Never mistake a cached remote ref for a successful GitHub check.
    git("fetch", "origin", "--prune")
    refs = git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin").splitlines()
    default = git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD").removeprefix(
        "refs/remotes/"
    )
    targets = list(dict.fromkeys([default, f"origin/{branch}"] if branch else [default]))
    for target in targets:
        if target not in refs:
            print(f"{target}: not published")
            continue
        ahead, behind = map(
            int, git("rev-list", "--left-right", "--count", f"HEAD...{target}").split()
        )
        print(f"Compared with {target}: {ahead} local-only, {behind} remote-only commits")
        if sync and target == f"origin/{branch}" and behind:
            if dirty or ahead:
                print(
                    "Automatic update skipped: local work or divergent history needs reconciliation."
                )
            else:
                git("merge", "--ff-only", target)
                print("Fast-forwarded matching branch. Re-read AGENTS.md and handoff files now.")
    print("\nRecent remote branches (check these for newer handoffs):")
    print(
        git(
            "for-each-ref",
            "--sort=-committerdate",
            "--count=8",
            "--format=%(refname:short) %(objectname:short) %(subject)",
            "refs/remotes/origin",
        )
    )
    print("\nRead docs/CURRENT_HANDOFF.md, then docs/session-handoff.md.")
    print(
        "Private configuration, browser sessions and running services do not transfer through Git."
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sync", action="store_true", help="Fast-forward only a clean matching remote branch"
    )
    try:
        raise SystemExit(check(parser.parse_args().sync))
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"GitHub check incomplete: {error}. Do not assume this checkout is current.")
        raise SystemExit(1) from None
