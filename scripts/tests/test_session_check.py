"""Exercise real Git repositories without touching project code or a network."""

import contextlib
import importlib.util
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "session_check", Path(__file__).parents[1] / "session-check.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SessionCheckTests(unittest.TestCase):
    def run_git(self, path, *args):
        return subprocess.check_output(
            ["git", "-C", str(path), *args], text=True, stderr=subprocess.DEVNULL
        ).strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.remote, self.writer, self.reader = (
            base / name for name in ("remote.git", "writer", "reader")
        )
        self.remote.mkdir()
        self.run_git(self.remote, "init", "--bare", "--initial-branch=main")
        subprocess.check_call(
            ["git", "clone", str(self.remote), str(self.writer)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.identity(self.writer)
        self.commit(self.writer, "initial.txt")
        self.run_git(self.writer, "push", "-u", "origin", "main")
        subprocess.check_call(
            ["git", "clone", str(self.remote), str(self.reader)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.identity(self.reader)
        MODULE.ROOT = self.reader

    def identity(self, path):
        self.run_git(path, "config", "user.name", "Fixture")
        self.run_git(path, "config", "user.email", "fixture@example.invalid")

    def commit(self, path, filename):
        (path / filename).write_text(filename)
        self.run_git(path, "add", filename)
        self.run_git(path, "commit", "-m", filename)

    def advance_remote(self):
        self.commit(self.writer, "remote.txt")
        self.run_git(self.writer, "push")

    def check(self, sync=True):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            MODULE.check(sync)
        return output.getvalue()

    def test_clean_fast_forward(self):
        self.advance_remote()
        self.check()
        self.assertEqual(
            self.run_git(self.writer, "rev-parse", "HEAD"),
            self.run_git(self.reader, "rev-parse", "HEAD"),
        )

    def test_check_only_does_not_update(self):
        before = self.run_git(self.reader, "rev-parse", "HEAD")
        self.advance_remote()
        self.check(False)
        self.assertEqual(before, self.run_git(self.reader, "rev-parse", "HEAD"))

    def test_dirty_work_preserved(self):
        before = self.run_git(self.reader, "rev-parse", "HEAD")
        (self.reader / "private-untracked.txt").write_text("local")
        self.advance_remote()
        self.assertIn("Automatic update skipped", self.check())
        self.assertEqual(before, self.run_git(self.reader, "rev-parse", "HEAD"))
        self.assertEqual("local", (self.reader / "private-untracked.txt").read_text())

    def test_divergence_preserved(self):
        self.commit(self.reader, "local.txt")
        before = self.run_git(self.reader, "rev-parse", "HEAD")
        self.advance_remote()
        self.assertIn("Automatic update skipped", self.check())
        self.assertEqual(before, self.run_git(self.reader, "rev-parse", "HEAD"))

    def test_unpublished_branch_does_not_switch(self):
        self.run_git(self.reader, "checkout", "-b", "local-work")
        self.advance_remote()
        self.assertIn("origin/local-work: not published", self.check())
        self.assertEqual("local-work", self.run_git(self.reader, "branch", "--show-current"))
        self.assertFalse((self.reader / "remote.txt").exists())

    def test_fetch_failure_is_not_success(self):
        self.run_git(self.reader, "remote", "set-url", "origin", str(self.reader / "missing.git"))
        with self.assertRaisesRegex(RuntimeError, "git fetch failed"):
            self.check()


if __name__ == "__main__":
    unittest.main()
