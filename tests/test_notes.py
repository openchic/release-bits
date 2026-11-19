import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from changelog import notes
from changelog.errors import ShipkitError

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Shipkit Test",
    "GIT_AUTHOR_EMAIL": "shipkit@example.com",
    "GIT_COMMITTER_NAME": "Shipkit Test",
    "GIT_COMMITTER_EMAIL": "shipkit@example.com",
}


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


class RevertTests(unittest.TestCase):
    def test_revert_excludes_original(self):
        original = "a" * 40
        revert = "b" * 40
        excluded, reverts = notes.revert_state(
            [
                {"sha": original, "subject": "feat: add alpha", "body": ""},
                {
                    "sha": revert,
                    "subject": "fix: undo alpha",
                    "body": f"This reverts commit {original}.",
                },
            ]
        )
        self.assertEqual(excluded, {original})
        self.assertEqual(reverts, {revert})


class StyleTests(unittest.TestCase):
    def test_clean_notes_have_no_warnings(self):
        warnings = notes.note_style_warnings(
            {"zh-CN": ["修复了菜单栏图标闪烁。"], "en": ["Fixed menu bar icon flicker."]},
            50,
        )
        self.assertEqual(warnings, [])

    def test_flags_multiple_changes(self):
        warnings = notes.note_style_warnings(
            {"zh-CN": ["修复了闪退并改进了性能。"], "en": ["Fixed crashes and improved performance."]},
            50,
        )
        self.assertTrue(any("多个变化" in warning for warning in warnings))

    def test_flags_vague_start(self):
        warnings = notes.note_style_warnings(
            {"zh-CN": ["优化了体验。"], "en": ["Improved the experience."]},
            50,
        )
        self.assertTrue(any("空泛" in warning for warning in warnings))

    def test_flags_long_chinese(self):
        warnings = notes.note_style_warnings(
            {"zh-CN": ["长" * 61 + "。"], "en": ["Added a long note."]},
            50,
        )
        self.assertTrue(any("超过 60 字" in warning for warning in warnings))

    def test_flags_english_imperative_and_now(self):
        warnings = notes.note_style_warnings(
            {"zh-CN": ["新增了项目筛选。"], "en": ["Add project filters now."]},
            50,
        )
        self.assertTrue(any("祈使句" in warning for warning in warnings))
        self.assertTrue(any("now" in warning for warning in warnings))


class CollectChangesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name
        previous = os.getcwd()
        self.addCleanup(os.chdir, previous)
        run_git(self.root, "init", "-q", "-b", "main")
        commit_file(self.root, "alpha.txt", "alpha", "feat: add alpha")
        run_git(self.root, "tag", "v1.0.0")
        commit_file(self.root, "docs.txt", "docs", "docs: update readme")
        commit_file(self.root, "beta.txt", "beta", "fix: correct beta")
        os.chdir(self.root)

    def test_collects_only_feat_and_fix_after_latest_tag(self):
        evidence, count = notes.collect_changes(None)
        payload = json.loads(evidence)
        self.assertEqual(count, 1)
        self.assertEqual([item["subject"] for item in payload["commits"]], ["fix: correct beta"])

    def test_explicit_base_ref(self):
        base = run_git(self.root, "rev-parse", "HEAD~2").stdout.strip()
        evidence, count = notes.collect_changes(base)
        self.assertEqual(count, 1)
        self.assertIn("fix: correct beta", evidence)

    def test_no_release_changes(self):
        run_git(self.root, "tag", "v1.1.0")
        commit_file(self.root, "more-docs.txt", "docs", "docs: more notes")
        with self.assertRaises(ShipkitError):
            notes.collect_changes(None)

    def test_generate_notes_with_fake_gemini(self):
        def fake_gemini(prompt, model, api_key):
            self.assertIn("fix: correct beta", prompt)
            return {
                "notes": {
                    "zh-CN": ["修复了主窗口显示。"],
                    "en": ["Fixed the main window display."],
                }
            }

        result = notes.generate_notes("1.1.0", None, 50, "test-model", "key", gemini_call=fake_gemini)
        self.assertEqual(result["commit_count"], 1)
        self.assertEqual(result["notes"]["en"], ["Fixed the main window display."])
        self.assertEqual(result["warnings"], [])

    def test_rejects_invalid_max_chars(self):
        with self.assertRaises(ShipkitError):
            notes.generate_notes("1.1.0", None, 0, "test-model", "key")


class PreviewTests(unittest.TestCase):
    def test_write_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            json_path, markdown_path = notes.write_preview(
                "1.2.3",
                "a" * 40,
                {"zh-CN": ["修复了闪退。"], "en": ["Fixed a crash."]},
                Path(directory),
            )
            payload = json.loads(Path(json_path).read_text(encoding="utf-8"))
            self.assertEqual(payload["version"], "1.2.3")
            self.assertEqual(payload["source_sha"], "a" * 40)
            self.assertIn("## 简体中文", Path(markdown_path).read_text(encoding="utf-8"))
