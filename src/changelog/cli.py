from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

from . import action, notes as notes_module, version as version_module
from .errors import ShipkitError
from .gemini import DEFAULT_MODEL


def _preview(args: argparse.Namespace) -> int:
    version = version_module.effective(args.version, args.version_type)
    api_key = os.environ.get("SHIPKIT_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    result = notes_module.generate_notes(version, args.base_ref, args.max_chars, args.model, api_key)
    notes = result["notes"]
    output_dir = Path(args.output_dir) if args.output_dir else Path(tempfile.mkdtemp(prefix="shipkit-notes-"))
    json_path, markdown_path = notes_module.write_preview(version, result["source_sha"], notes, output_dir)
    markdown = notes_module.render_notes(notes)
    for warning in result["warnings"]:
        print(f"Style: {warning}", file=sys.stderr)
    print(markdown)
    print(f"\nJSON: {json_path}\nMarkdown: {markdown_path}", file=sys.stderr)
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="shipkit")
    commands = parser.add_subparsers(dest="command", required=True)

    preview = commands.add_parser(
        "changelog",
        help="Generate notes and preview files without creating a pull request",
    )
    preview.add_argument("--version", required=True, help="Base version in X.Y.Z format")
    preview.add_argument("--version-type", default="", help="major, minor or patch")
    preview.add_argument("--base-ref", help="Commit range start; defaults to the latest tag")
    preview.add_argument("--max-chars", type=int, default=notes_module.DEFAULT_MAX_CHARS)
    preview.add_argument("--model", default=DEFAULT_MODEL)
    preview.add_argument("--output-dir")
    preview.set_defaults(func=_preview)

    publish = commands.add_parser(
        "changelog-pr",
        help="Generate notes, update the catalog, and create or reuse a draft pull request",
    )
    publish.set_defaults(func=lambda _args: action.run())

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ShipkitError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # pragma: no cover - unexpected failures
        if os.environ.get("SHIPKIT_DEBUG"):
            raise
        print(f"Error: unexpected failure: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
