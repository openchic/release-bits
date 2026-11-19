from __future__ import annotations

import re

from .errors import ShipkitError

_VERSION = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\Z")
BUMP_TYPES = ("major", "minor", "patch")


def parse(version: str) -> tuple[int, int, int]:
    match = _VERSION.fullmatch(version.strip()) if isinstance(version, str) else None
    if not match:
        raise ShipkitError("version must use X.Y.Z format, for example 1.2.3")
    major, minor, patch = match.groups()
    return int(major), int(minor), int(patch)


def validate(version: str) -> str:
    parse(version)
    return version.strip()


def bump(version: str, kind: str) -> str:
    if kind not in BUMP_TYPES:
        raise ShipkitError("version-type must be major, minor or patch")
    major, minor, patch = parse(version)
    if kind == "major":
        major, minor, patch = major + 1, 0, 0
    elif kind == "minor":
        major, minor, patch = major, minor + 1, 0
    else:
        major, minor, patch = major, minor, patch + 1
    return f"{major}.{minor}.{patch}"


def effective(version: str, version_type: str = "") -> str:
    version = validate(version)
    version_type = (version_type or "").strip()
    if not version_type:
        return version
    return bump(version, version_type)


def is_newer(candidate: str, latest: str) -> bool:
    return parse(candidate) > parse(latest)
