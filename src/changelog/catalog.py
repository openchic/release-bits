from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

from . import gitutils, notes as notes_module, version as version_module
from .errors import ShipkitError

DEFAULT_PATH = "changelogs.json"
_SHA = re.compile(r"[a-f0-9]{40}\Z")


def _parse_records(text: str, label: str) -> list:
    try:
        records = json.loads(text)
    except json.JSONDecodeError:
        raise ShipkitError(f"Unable to read catalog: {label}") from None
    if not isinstance(records, list):
        raise ShipkitError("Catalog must be a JSON array")
    return records


def load(path: Path) -> list:
    if not path.exists():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        raise ShipkitError(f"Unable to read catalog: {path}") from None
    return _parse_records(text, str(path))


def load_at(ref: str, rel_path: str) -> Optional[list]:
    text = gitutils.show_file(ref, rel_path)
    if text is None:
        return None
    return _parse_records(text, f"{ref}:{rel_path}")


def latest_version(entries: list) -> Optional[str]:
    latest = None
    for record in entries:
        if not isinstance(record, dict):
            raise ShipkitError("Invalid catalog record")
        version = record.get("version")
        if not isinstance(version, str):
            raise ShipkitError("Invalid catalog version")
        parsed = version_module.parse(version)
        if latest is None or parsed > latest[0]:
            latest = (parsed, version)
    return latest[1] if latest else None


def validate_draft(draft: object, expected_version: str) -> dict:
    if not isinstance(draft, dict):
        raise ShipkitError("Catalog draft is invalid")
    if draft.get("version") != expected_version:
        raise ShipkitError(
            f"Catalog already contains a draft for v{draft.get('version')}; expected v{expected_version}"
        )
    source_sha = draft.get("source_sha")
    if not isinstance(source_sha, str) or not _SHA.fullmatch(source_sha):
        raise ShipkitError("Catalog draft is missing its generation source")
    version_type = draft.get("version_type")
    if version_type is not None and version_type not in version_module.BUMP_TYPES:
        raise ShipkitError("Catalog draft has an invalid version_type")
    return notes_module.validate_notes(draft.get("notes"))


def write(path: Path, records: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(records, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
    except OSError:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise ShipkitError(f"Unable to write catalog: {path}") from None


def verify_scope(source_sha: str, rel_path: str) -> None:
    if not gitutils.is_ancestor(source_sha):
        raise ShipkitError("Generation source is not an ancestor of HEAD; regenerate the draft")
    changed = set(gitutils.changed_files(source_sha))
    unexpected = changed - {rel_path}
    if unexpected:
        raise ShipkitError(
            "App code changed after notes generation; regenerate the draft "
            f"(changed: {', '.join(sorted(unexpected))})"
        )


def verify_history(source_sha: str, rel_path: str, current_history: list) -> None:
    previous = load_at(source_sha, rel_path) or []
    if previous != current_history:
        raise ShipkitError("Published catalog history changed after notes generation; regenerate the draft")
