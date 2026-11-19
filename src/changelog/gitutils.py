from __future__ import annotations

import subprocess
from typing import Optional

from .errors import ShipkitError


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and result.returncode:
        detail = result.stderr.strip().splitlines()
        reason = detail[-1] if detail else f"exit {result.returncode}"
        raise ShipkitError(f"git {' '.join(args)} failed: {reason}")
    return result


def output(*args: str) -> str:
    return git(*args).stdout.strip()


def head_sha() -> str:
    return output("rev-parse", "HEAD")


def repo_root() -> str:
    return output("rev-parse", "--show-toplevel")


def is_shallow() -> bool:
    return output("rev-parse", "--is-shallow-repository") == "true"


def ensure_full_history() -> None:
    if is_shallow():
        try:
            git("fetch", "--tags", "--force", "--unshallow")
        except ShipkitError:
            raise ShipkitError(
                "Repository is shallow and fetching full history failed; "
                "keep checkout credentials or set fetch-depth: 0"
            ) from None
    else:
        # Tags may be missing even with full history; fetch is best-effort here.
        git("fetch", "--tags", "--force", check=False)


def fetch_origin_branch(branch: str) -> None:
    result = git(
        "fetch",
        "origin",
        f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
        check=False,
    )
    if result.returncode:
        detail = result.stderr.strip().splitlines()
        reason = detail[-1] if detail else f"exit {result.returncode}"
        raise ShipkitError(f"Unable to fetch base branch '{branch}': {reason}")


def latest_tag(ref: str = "HEAD") -> Optional[str]:
    result = git("describe", "--tags", "--abbrev=0", ref, check=False)
    return result.stdout.strip() or None


def resolve_commit(ref: str) -> str:
    result = git("rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}", check=False)
    if result.returncode:
        raise ShipkitError(f"Unable to resolve ref '{ref}'")
    return result.stdout.strip()


def read_commits(revision: str) -> list[dict]:
    log_format = "--format=%H%x1f%s%x1f%b%x1e"
    raw = git("log", revision, log_format, "--no-merges").stdout
    commits = []
    for record in raw.split("\x1e"):
        fields = record.strip("\n").split("\x1f", 2)
        if len(fields) < 2 or not fields[0].strip() or not fields[1].strip():
            continue
        commits.append(
            {
                "sha": fields[0].strip(),
                "subject": fields[1].strip(),
                "body": fields[2].strip() if len(fields) > 2 else "",
            }
        )
    return commits


def changed_files(source_sha: str, head: str = "HEAD") -> list[str]:
    raw = git("diff", "--name-only", source_sha, head).stdout
    return [line for line in raw.splitlines() if line]


def show_file(sha: str, path: str) -> Optional[str]:
    result = git("show", f"{sha}:{path}", check=False)
    return result.stdout if result.returncode == 0 else None


def is_ancestor(source_sha: str, ref: str = "HEAD") -> bool:
    return git("merge-base", "--is-ancestor", source_sha, ref, check=False).returncode == 0
