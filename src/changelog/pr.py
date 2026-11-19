from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from . import gitutils
from .errors import ShipkitError


def branch_name(version: str) -> str:
    return f"changelogs/v{version}"


def _gh(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise ShipkitError("gh CLI is required; install it or use a runner with GitHub CLI") from None
    except subprocess.TimeoutExpired:
        raise ShipkitError("gh command timed out; check network and GitHub status") from None
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip().splitlines()
        reason = detail[-1] if detail else f"exit {result.returncode}"
        raise ShipkitError(f"gh {' '.join(args)} failed: {reason}")
    return result


def find_open_pr(branch: str) -> str:
    result = _gh(
        "pr",
        "list",
        "--state",
        "open",
        "--head",
        branch,
        "--json",
        "url",
        "--jq",
        '.[0].url // ""',
    )
    return result.stdout.strip()


def remote_branch_exists(branch: str) -> bool:
    result = gitutils.git("ls-remote", "--exit-code", "--heads", "origin", branch, check=False)
    if result.returncode == 0:
        return True
    if result.returncode == 2:
        return False
    raise ShipkitError("Unable to query the release branch on origin; check credentials and network")


def checkout_remote_branch(branch: str) -> None:
    gitutils.git("fetch", "origin", branch)
    gitutils.git("switch", "--force-create", branch, "FETCH_HEAD")


def create_branch(branch: str) -> None:
    result = gitutils.git("switch", "--create", branch, check=False)
    if result.returncode:
        detail = result.stderr.strip().splitlines()
        reason = detail[-1] if detail else f"exit {result.returncode}"
        raise ShipkitError(f"Unable to create branch {branch}: {reason}")


def commit(rel_path: str, message: str) -> bool:
    gitutils.git("add", "--", rel_path)
    staged = gitutils.git("diff", "--cached", "--quiet", "--", rel_path, check=False)
    if staged.returncode == 0:
        return False
    gitutils.git(
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=github-actions[bot]@users.noreply.github.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        message,
    )
    return True


def push(branch: str) -> None:
    try:
        gitutils.git("push", "--set-upstream", "origin", branch)
    except ShipkitError as error:
        raise ShipkitError(f"Unable to push the release branch; check workflow permissions ({error})") from None


def _reuse_existing(branch: str) -> str:
    try:
        return find_open_pr(branch)
    except ShipkitError:
        return ""


def create_draft_pr(branch: str, base: str, title: str, body: str) -> str:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".md") as handle:
        handle.write(body)
        body_path = handle.name
    try:
        try:
            result = _gh(
                "pr",
                "create",
                "--draft",
                "--base",
                base,
                "--head",
                branch,
                "--title",
                title,
                "--body-file",
                body_path,
            )
        except ShipkitError:
            existing = _reuse_existing(branch)
            if existing:
                return existing
            raise
        match = re.search(r"https?://\S+/pull/\d+", result.stdout)
        if match:
            return match.group(0)
        existing = _reuse_existing(branch)
        if existing:
            return existing
        raise ShipkitError("Unable to determine the created pull request URL")
    finally:
        Path(body_path).unlink(missing_ok=True)
