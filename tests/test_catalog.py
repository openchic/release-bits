import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from changelog import catalog, pr
from changelog.errors import ShipkitError

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Shipkit Test",
    "GIT_AUTHOR_EMAIL": "shipkit@example.com",
    "GIT_COMMITTER_NAME": "Shipkit Test",
    "GIT_COMMITTER_EMAIL": "shipkit@example.com",
}

NOTES = {"zh-CN": ["修复了闪退。"], "en": ["Fixed a crash."]}


def run_git(cwd, *args):
    env = os.environ.copy()
    env.update(GIT_ENV)
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    return subprocess.run(
        ["git", "-c", "commit.gpgsign=false", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )


def draft(version="1.3.0"):
    return {
        "version": version,
        "source_sha": "a" * 40,
        "notes": NOTES,
    }


class CatalogTests(unittest.TestCase):
    def test_latest_version(self):
        entries = [
            {"version": "1.2.0", "notes": NOTES},
            {"version": "1.3.0", "notes": NOTES},
        ]
        self.assertEqual(catalog.latest_version(entries), "1.3.0")

    def test_validate_draft(self):
        self.assertEqual(catalog.validate_draft(draft(), "1.3.0"), NOTES)
        with self.assertRaises(ShipkitError):
            catalog.validate_draft(draft(), "1.4.0")

    def test_write_and_load(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "changelogs.json"
            catalog.write(path, [draft()])
            self.assertEqual(catalog.load(path), [draft()])

    def test_branch_name(self):
        self.assertEqual(pr.branch_name("1.3.0"), "changelogs/v1.3.0")


class CatalogGitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name
        previous = os.getcwd()
        self.addCleanup(os.chdir, previous)
        run_git(self.root, "init", "-q", "-b", "main")
        self.path = Path(self.root) / "changelogs.json"
        self.history = [
            {
                "version": "1.2.0",
                "published_at": "2026-01-01T00:00:00+00:00",
                "notes": NOTES,
            }
        ]
        self.path.write_text(json.dumps(self.history), encoding="utf-8")
        Path(self.root, "README.md").write_text("readme", encoding="utf-8")
        run_git(self.root, "add", ".")
        run_git(self.root, "commit", "-m", "chore: base")
        self.source = run_git(self.root, "rev-parse", "HEAD").stdout.strip()
        os.chdir(self.root)

    def test_history_and_scope_checks(self):
        records = [draft(), *self.history]
        catalog.verify_history(self.source, "changelogs.json", self.history)
        catalog.verify_scope(self.source, "changelogs.json")

        catalog.write(self.path, records)
        run_git(self.root, "add", "changelogs.json")
        run_git(self.root, "commit", "-m", "docs: draft")
        catalog.verify_scope(self.source, "changelogs.json")

        Path(self.root, "app.txt").write_text("app", encoding="utf-8")
        run_git(self.root, "add", "app.txt")
        run_git(self.root, "commit", "-m", "feat: app")
        with self.assertRaises(ShipkitError):
            catalog.verify_scope(self.source, "changelogs.json")

    def test_history_change_is_rejected(self):
        changed_history = [dict(self.history[0], version="1.1.0")]
        with self.assertRaises(ShipkitError):
            catalog.verify_history(self.source, "changelogs.json", changed_history)
