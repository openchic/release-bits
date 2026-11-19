import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from changelog import action, gitutils
from changelog.errors import ShipkitError

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Shipkit Test",
    "GIT_AUTHOR_EMAIL": "shipkit@example.com",
    "GIT_COMMITTER_NAME": "Shipkit Test",
    "GIT_COMMITTER_EMAIL": "shipkit@example.com",
}
NOTES = {"zh-CN": ["修复了主窗口显示。"], "en": ["Fixed the main window display."]}


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


def commit_file(cwd, name, content, message):
    Path(cwd, name).write_text(content, encoding="utf-8")
    run_git(cwd, "add", name)
    run_git(cwd, "commit", "-m", message)


class ActionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin.git"
        self.work = self.root / "work"
        run_git(self.root, "init", "-q", "--bare", str(self.origin))
        run_git(self.root, "clone", "-q", str(self.origin), str(self.work))
        run_git(self.work, "checkout", "-q", "-b", "main")
        commit_file(self.work, "app.txt", "v1", "feat: add app")
        run_git(self.work, "tag", "v1.0.0")
        run_git(self.work, "push", "-q", "-u", "origin", "main", "--tags")
        commit_file(self.work, "app.txt", "v2", "fix: correct app")
        run_git(self.work, "push", "-q")
        self.runner_temp = self.root / "runner-temp"
        self.runner_temp.mkdir()
        previous = os.getcwd()
        self.addCleanup(os.chdir, previous)
        os.chdir(self.work)

    def _env(self, **overrides):
        values = {
            "GH_TOKEN": "test-token",
            "SHIPKIT_VERSION": "1.1.0",
            "SHIPKIT_VERSION_TYPE": "",
            "SHIPKIT_CATALOG_PATH": "changelogs.json",
            "SHIPKIT_BASE_BRANCH": "main",
            "SHIPKIT_BASE_REF": "",
            "SHIPKIT_MAX_CHARS": "50",
            "SHIPKIT_MODEL": "test-model",
            "GITHUB_DEFAULT_BRANCH": "main",
            "GITHUB_OUTPUT": str(self.root / "output.txt"),
            "GITHUB_STEP_SUMMARY": str(self.root / "summary.md"),
            "RUNNER_TEMP": str(self.runner_temp),
        }
        values.update(overrides)
        return mock.patch.dict(os.environ, values, clear=False)

    def _fake_generate(self):
        def generate(version, base_ref, max_chars, model, api_key):
            return {
                "notes": NOTES,
                "source_sha": gitutils.head_sha(),
                "commit_count": 1,
                "warnings": ["第 1 条：测试警告。"],
            }

        return generate

    def test_generates_catalog_and_pr(self):
        with self._env(), mock.patch.object(
            action.notes_module, "generate_notes", self._fake_generate()
        ), mock.patch.object(action.pr_module, "find_open_pr", return_value=""), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=False
        ), mock.patch.object(
            action.pr_module, "create_draft_pr", return_value="https://example.test/pr/1"
        ) as create:
            self.assertEqual(action.run(), 0)

        create.assert_called_once()
        records = json.loads((self.work / "changelogs.json").read_text(encoding="utf-8"))
        self.assertEqual(records[0]["version"], "1.1.0")
        self.assertNotIn("reviewed", records[0])
        self.assertEqual(records[0]["notes"], NOTES)
        branches = run_git(self.work, "ls-remote", "--heads", "origin").stdout
        self.assertIn("refs/heads/changelogs/v1.1.0", branches)
        output = (self.root / "output.txt").read_text(encoding="utf-8")
        self.assertIn("pr-created=true", output)
        self.assertIn("warning-count=1", output)
        summary = (self.root / "summary.md").read_text(encoding="utf-8")
        self.assertIn("测试警告", summary)

    def test_reuses_draft_without_generating(self):
        with self._env(), mock.patch.object(
            action.notes_module, "generate_notes", self._fake_generate()
        ), mock.patch.object(action.pr_module, "find_open_pr", return_value=""), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=False
        ), mock.patch.object(
            action.pr_module, "create_draft_pr", return_value="https://example.test/pr/1"
        ):
            self.assertEqual(action.run(), 0)

        clone = self.root / "clone"
        run_git(self.root, "clone", "-q", str(self.origin), str(clone))
        os.chdir(clone)
        output = self.root / "output2.txt"
        with self._env(GITHUB_OUTPUT=str(output)), mock.patch.object(
            action.notes_module, "generate_notes"
        ) as generate, mock.patch.object(
            action.pr_module, "find_open_pr", return_value=""
        ), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=True
        ), mock.patch.object(
            action.pr_module, "create_draft_pr", return_value="https://example.test/pr/2"
        ):
            self.assertEqual(action.run(), 0)

        generate.assert_not_called()
        text = output.read_text(encoding="utf-8")
        self.assertIn("commit-count=0", text)
        self.assertIn("pr-created=true", text)

    def test_returns_existing_pr_without_other_calls(self):
        output = self.root / "early.txt"
        with self._env(GITHUB_OUTPUT=str(output)), mock.patch.object(
            action.pr_module, "find_open_pr", return_value="https://example.test/pr/9"
        ), mock.patch.object(action.pr_module, "remote_branch_exists") as remote, mock.patch.object(
            action.notes_module, "generate_notes"
        ) as generate:
            self.assertEqual(action.run(), 0)

        remote.assert_not_called()
        generate.assert_not_called()
        text = output.read_text(encoding="utf-8")
        self.assertIn("pr-url=https://example.test/pr/9", text)
        self.assertIn("pr-created=false", text)

    def test_regenerates_empty_release_branch(self):
        run_git(self.work, "branch", "changelogs/v1.1.0")
        run_git(self.work, "push", "-q", "origin", "changelogs/v1.1.0")
        with self._env(), mock.patch.object(
            action.notes_module, "generate_notes", self._fake_generate()
        ), mock.patch.object(action.pr_module, "find_open_pr", return_value=""), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=True
        ), mock.patch.object(
            action.pr_module, "create_draft_pr", return_value="https://example.test/pr/3"
        ):
            self.assertEqual(action.run(), 0)

        records = json.loads((self.work / "changelogs.json").read_text(encoding="utf-8"))
        self.assertEqual(records[0]["version"], "1.1.0")

    def test_version_type_bumps_from_version(self):
        with self._env(SHIPKIT_VERSION="1.0.0", SHIPKIT_VERSION_TYPE="minor"), mock.patch.object(
            action.notes_module, "generate_notes", self._fake_generate()
        ), mock.patch.object(action.pr_module, "find_open_pr", return_value=""), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=False
        ), mock.patch.object(
            action.pr_module, "create_draft_pr", return_value="https://example.test/pr/4"
        ):
            self.assertEqual(action.run(), 0)

        records = json.loads((self.work / "changelogs.json").read_text(encoding="utf-8"))
        self.assertEqual(records[0]["version"], "1.1.0")
        self.assertEqual(records[0]["version_type"], "minor")

    def test_rejects_draft_when_base_advanced(self):
        history = [{"version": "1.0.0", "published_at": "2026-01-01T00:00:00+00:00", "notes": NOTES}]
        (self.work / "changelogs.json").write_text(json.dumps(history), encoding="utf-8")
        run_git(self.work, "add", "changelogs.json")
        run_git(self.work, "commit", "-m", "chore: catalog")
        run_git(self.work, "push", "-q")
        source = run_git(self.work, "rev-parse", "HEAD").stdout.strip()
        draft = {"version": "1.1.0", "version_type": "minor", "source_sha": source, "notes": NOTES}
        run_git(self.work, "switch", "-q", "-c", "changelogs/v1.1.0")
        (self.work / "changelogs.json").write_text(json.dumps([draft, *history]), encoding="utf-8")
        run_git(self.work, "add", "changelogs.json")
        run_git(self.work, "commit", "-m", "docs: prepare v1.1.0 release notes")
        run_git(self.work, "push", "-q", "-u", "origin", "changelogs/v1.1.0")
        run_git(self.work, "switch", "-q", "main")

        advanced = [
            {"version": "1.1.0", "published_at": "2026-01-02T00:00:00+00:00", "notes": NOTES},
            *history,
        ]
        (self.work / "changelogs.json").write_text(json.dumps(advanced), encoding="utf-8")
        run_git(self.work, "add", "changelogs.json")
        run_git(self.work, "commit", "-m", "chore: release 1.1.0")
        run_git(self.work, "push", "-q")

        clone = self.root / "advanced-clone"
        run_git(self.root, "clone", "-q", str(self.origin), str(clone))
        os.chdir(clone)
        with self._env(), mock.patch.object(
            action.notes_module, "generate_notes"
        ) as generate, mock.patch.object(
            action.pr_module, "find_open_pr", return_value=""
        ), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=True
        ), mock.patch.object(action.pr_module, "create_draft_pr") as create:
            with self.assertRaises(ShipkitError) as raised:
                action.run()

        self.assertIn("base catalog", str(raised.exception))
        generate.assert_not_called()
        create.assert_not_called()

    def test_rejects_branch_without_draft(self):
        history = [{"version": "0.9.0", "published_at": "2026-01-01T00:00:00+00:00", "notes": NOTES}]
        (self.work / "changelogs.json").write_text(json.dumps(history), encoding="utf-8")
        run_git(self.work, "add", "changelogs.json")
        run_git(self.work, "commit", "-m", "chore: catalog")
        run_git(self.work, "push", "-q")
        run_git(self.work, "branch", "changelogs/v1.1.0")
        run_git(self.work, "push", "-q", "origin", "changelogs/v1.1.0")

        with self._env(), mock.patch.object(
            action.notes_module, "generate_notes"
        ) as generate, mock.patch.object(
            action.pr_module, "find_open_pr", return_value=""
        ), mock.patch.object(
            action.pr_module, "remote_branch_exists", return_value=True
        ), mock.patch.object(action.pr_module, "create_draft_pr") as create:
            with self.assertRaises(ShipkitError) as raised:
                action.run()

        self.assertIn("no draft", str(raised.exception))
        generate.assert_not_called()
        create.assert_not_called()
