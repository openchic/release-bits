import subprocess
import unittest
from unittest import mock

from changelog import pr
from changelog.errors import ShipkitError


class GhTests(unittest.TestCase):
    def test_missing_gh_is_reported(self):
        with mock.patch.object(pr.subprocess, "run", side_effect=FileNotFoundError):
            with self.assertRaises(ShipkitError) as raised:
                pr._gh("pr", "list")
        self.assertIn("gh CLI is required", str(raised.exception))

    def test_timeout_is_reported(self):
        with mock.patch.object(
            pr.subprocess, "run", side_effect=subprocess.TimeoutExpired(["gh"], 120)
        ):
            with self.assertRaises(ShipkitError) as raised:
                pr._gh("pr", "list")
        self.assertIn("timed out", str(raised.exception))

    def test_remote_branch_states(self):
        with mock.patch.object(pr.gitutils, "git", return_value=subprocess.CompletedProcess([], 0)):
            self.assertTrue(pr.remote_branch_exists("changelogs/v1.0.0"))
        with mock.patch.object(pr.gitutils, "git", return_value=subprocess.CompletedProcess([], 2)):
            self.assertFalse(pr.remote_branch_exists("changelogs/v1.0.0"))
        with mock.patch.object(pr.gitutils, "git", return_value=subprocess.CompletedProcess([], 128)):
            with self.assertRaises(ShipkitError):
                pr.remote_branch_exists("changelogs/v1.0.0")


class CreatePrTests(unittest.TestCase):
    def test_extracts_url_from_output(self):
        with mock.patch.object(
            pr,
            "_gh",
            return_value=subprocess.CompletedProcess(
                [], 0, stdout="note\nhttps://github.com/o/r/pull/12\n", stderr=""
            ),
        ):
            url = pr.create_draft_pr("changelogs/v1.0.0", "main", "title", "body")
        self.assertEqual(url, "https://github.com/o/r/pull/12")

    def test_falls_back_to_existing_pr_without_url(self):
        with mock.patch.object(
            pr,
            "_gh",
            return_value=subprocess.CompletedProcess([], 0, stdout="created", stderr=""),
        ), mock.patch.object(pr, "find_open_pr", return_value="https://github.com/o/r/pull/13"):
            url = pr.create_draft_pr("changelogs/v1.0.0", "main", "title", "body")
        self.assertEqual(url, "https://github.com/o/r/pull/13")

    def test_reuses_existing_pr_after_create_error(self):
        with mock.patch.object(pr, "_gh", side_effect=ShipkitError("boom")), mock.patch.object(
            pr, "find_open_pr", return_value="https://github.com/o/r/pull/14"
        ):
            url = pr.create_draft_pr("changelogs/v1.0.0", "main", "title", "body")
        self.assertEqual(url, "https://github.com/o/r/pull/14")

    def test_raises_when_url_and_existing_pr_are_missing(self):
        with mock.patch.object(
            pr,
            "_gh",
            return_value=subprocess.CompletedProcess([], 0, stdout="created", stderr=""),
        ), mock.patch.object(pr, "find_open_pr", return_value=""):
            with self.assertRaises(ShipkitError):
                pr.create_draft_pr("changelogs/v1.0.0", "main", "title", "body")
