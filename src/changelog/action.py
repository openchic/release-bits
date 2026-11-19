from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from . import catalog, gitutils, notes as notes_module, pr as pr_module, version as version_module
from .errors import ShipkitError
from .gemini import DEFAULT_MODEL


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _set_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def _summary(lines: list[str]) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")


def _preview_paths(version: str, source_sha: str, notes: dict) -> tuple[str, str]:
    base = Path(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir())
    directory = Path(tempfile.mkdtemp(prefix="shipkit-notes-", dir=str(base)))
    return notes_module.write_preview(version, source_sha, notes, directory)


def _catalog_path(root: Path) -> tuple[Path, str]:
    root = root.resolve()
    raw = _env("SHIPKIT_CATALOG_PATH", catalog.DEFAULT_PATH) or catalog.DEFAULT_PATH
    path = (root / raw).resolve()
    try:
        rel_path = path.relative_to(root).as_posix()
    except ValueError:
        raise ShipkitError("catalog-path must stay inside the repository") from None
    return path, rel_path


def _emit(
    *,
    version: str,
    branch: str,
    pr_url: str,
    pr_created: bool,
    source_sha: str,
    commit_count: int,
    warnings: list[str],
    json_path: str,
    markdown_path: str,
) -> None:
    values = {
        "pr-url": pr_url,
        "pr-created": "true" if pr_created else "false",
        "version": version,
        "branch": branch,
        "source-sha": source_sha,
        "commit-count": str(commit_count),
        "warning-count": str(len(warnings)),
        "notes-json-path": json_path,
        "notes-markdown-path": markdown_path,
    }
    for name, value in values.items():
        _set_output(name, value)
    summary = [
        f"### Release notes v{version}",
        "",
        f"- PR: {pr_url}",
        f"- Branch: `{branch}`",
        f"- Commits: {commit_count}",
        f"- Warnings: {len(warnings)}",
    ]
    summary.extend(f"  - {warning}" for warning in warnings)
    _summary(summary)


def run() -> int:
    if not _env("GH_TOKEN"):
        raise ShipkitError("GH_TOKEN is required for the changelog action")

    gitutils.ensure_full_history()

    raw_version = _env("SHIPKIT_VERSION")
    if not raw_version:
        raise ShipkitError("version is required")
    version_type = _env("SHIPKIT_VERSION_TYPE")
    version = version_module.effective(raw_version, version_type)
    branch = pr_module.branch_name(version)

    base_branch = _env("SHIPKIT_BASE_BRANCH") or _env("GITHUB_DEFAULT_BRANCH") or "main"
    base_ref = _env("SHIPKIT_BASE_REF") or None
    max_chars_raw = _env("SHIPKIT_MAX_CHARS") or str(notes_module.DEFAULT_MAX_CHARS)
    try:
        max_chars = int(max_chars_raw)
    except ValueError:
        raise ShipkitError("max-chars must be an integer") from None
    notes_module.validate_max_chars(max_chars)
    model = _env("SHIPKIT_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
    api_key = _env("SHIPKIT_GEMINI_API_KEY") or _env("GEMINI_API_KEY") or None

    existing_pr = pr_module.find_open_pr(branch)
    if existing_pr:
        print(f"Reusing existing draft PR: {existing_pr}")
        _emit(
            version=version,
            branch=branch,
            pr_url=existing_pr,
            pr_created=False,
            source_sha="",
            commit_count=0,
            warnings=[],
            json_path="",
            markdown_path="",
        )
        return 0

    remote = pr_module.remote_branch_exists(branch)
    if remote:
        pr_module.checkout_remote_branch(branch)

    root = Path(gitutils.repo_root()).resolve()
    os.chdir(root)
    path, rel_path = _catalog_path(root)
    records = catalog.load(path)
    base_records: list = []
    if remote:
        gitutils.fetch_origin_branch(base_branch)
        base_records = catalog.load_at(f"origin/{base_branch}", rel_path) or []
    draft = None
    if remote and records:
        first = records[0]
        if isinstance(first, dict) and "source_sha" in first and first not in base_records:
            draft = first
        else:
            raise ShipkitError(
                f"Release branch {branch} exists but contains no draft; delete it and rerun"
            )
    history_records = records[1:] if draft else records
    latest_checks = [(catalog.latest_version(history_records), "catalog")]
    if remote:
        latest_checks.append((catalog.latest_version(base_records), "base catalog"))
    for latest, label in latest_checks:
        if latest and not version_module.is_newer(version, latest):
            raise ShipkitError(f"Version {version} must be newer than {label} version {latest}")

    if draft:
        notes = catalog.validate_draft(draft, version)
        source_sha = draft["source_sha"]
        commit_count = 0
        warnings = notes_module.note_style_warnings(notes, max_chars)
        catalog.verify_scope(source_sha, rel_path)
        catalog.verify_history(source_sha, rel_path, history_records)
    else:
        result = notes_module.generate_notes(version, base_ref, max_chars, model, api_key)
        notes = result["notes"]
        source_sha = result["source_sha"]
        commit_count = result["commit_count"]
        warnings = result["warnings"]
        if not remote:
            pr_module.create_branch(branch)
        draft = {"version": version}
        if version_type:
            draft["version_type"] = version_type
        draft["source_sha"] = source_sha
        draft["notes"] = notes
        records = [draft, *history_records]
        catalog.write(path, records)

    for warning in warnings:
        print(f"Style: {warning}", file=sys.stderr)

    committed = pr_module.commit(rel_path, f"docs: prepare v{version} release notes")
    if committed:
        catalog.verify_scope(source_sha, rel_path)
        pr_module.push(branch)
    elif not remote:
        raise ShipkitError("No catalog changes to commit; nothing to release")

    json_path, markdown_path = _preview_paths(version, source_sha, notes)
    body = (
        f"## Release notes v{version}\n\n"
        f"{notes_module.render_notes(notes)}\n\n"
        "---\n\n"
        "Merging this PR approves the release notes.\n"
    )
    pr_url = pr_module.create_draft_pr(
        branch,
        base_branch,
        f"docs: review v{version} release notes",
        body,
    )
    print(f"Created draft PR: {pr_url}")
    _emit(
        version=version,
        branch=branch,
        pr_url=pr_url,
        pr_created=True,
        source_sha=source_sha,
        commit_count=commit_count,
        warnings=warnings,
        json_path=json_path,
        markdown_path=markdown_path,
    )
    return 0
