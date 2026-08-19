#!/usr/bin/env python3
"""Run the minimal smoke checks required for the playable prototype."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path


REQUIRED_IDS = {
    "stamina",
    "location",
    "progress",
    "screen",
    "history",
    "systemLog",
    "reset",
}
REQUIRED_TAGS = {"html", "head", "body", "script"}
EXTERNAL_RESOURCE_ATTRIBUTES = {
    "script": "src",
    "img": "src",
    "link": "href",
}


class PrototypeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tags: set[str] = set()
        self.resource_urls: list[tuple[str, str]] = []
        self.inline_scripts: list[str] = []
        self._script_chunks: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self.tags.add(tag)
        attributes = {name.lower(): value or "" for name, value in attrs}

        attribute = EXTERNAL_RESOURCE_ATTRIBUTES.get(tag)
        if attribute and attributes.get(attribute):
            self.resource_urls.append((tag, attributes[attribute]))

        if tag == "script" and "src" not in attributes:
            self._script_chunks = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._script_chunks is not None:
            self.inline_scripts.append("".join(self._script_chunks))
            self._script_chunks = None

    def handle_data(self, data: str) -> None:
        if self._script_chunks is not None:
            self._script_chunks.append(data)


def fail(message: str) -> None:
    print(f"check_prototype.py: FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def is_external(url: str) -> bool:
    return url.startswith(("http://", "https://", "//"))


def check_inline_javascript(scripts: list[str]) -> None:
    if not scripts:
        fail("inline <script> was not found")

    node = shutil.which("node")
    if not node:
        fail("node is required for inline JavaScript syntax validation")

    source = "\n\n".join(scripts)
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
        handle.write(source)
        script_path = Path(handle.name)

    try:
        result = subprocess.run(
            [node, "--check", str(script_path)],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        script_path.unlink(missing_ok=True)

    if result.returncode:
        fail(f"inline JavaScript syntax error\n{result.stderr.strip()}")


def check_behavior(prototype: Path) -> None:
    """Run the calendar and stamina behaviour checks with a fixed clock."""
    checker = Path(__file__).with_name("check_prototype_behavior.js")
    if not checker.is_file():
        fail(f"{checker.name} does not exist")

    node = shutil.which("node")
    if not node:
        fail("node is required for prototype behaviour checks")

    result = subprocess.run(
        [node, str(checker), str(prototype)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        fail("prototype behaviour check failed\n" + (result.stderr or result.stdout).strip())
    print((result.stdout or "").strip())


def main() -> None:
    prototype = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("prototype.html")
    if not prototype.is_file():
        fail(f"{prototype} does not exist")

    source = prototype.read_text(encoding="utf-8")
    if not re.search(r"<!doctype\s+html", source, flags=re.IGNORECASE):
        fail("<!doctype html> was not found")

    parser = PrototypeParser()
    parser.feed(source)
    parser.close()

    missing_tags = REQUIRED_TAGS - parser.tags
    if missing_tags:
        fail(f"missing HTML tags: {', '.join(sorted(missing_tags))}")

    found_ids = set(re.findall(r"\bid\s*=\s*['\"]([^'\"]+)['\"]", source))
    missing_ids = REQUIRED_IDS - found_ids
    if missing_ids:
        fail(f"missing required IDs: {', '.join(sorted(missing_ids))}")

    external_resources = [
        f"<{tag}> {url}" for tag, url in parser.resource_urls if is_external(url)
    ]
    if external_resources:
        fail("external resource reference found: " + ", ".join(external_resources))

    check_inline_javascript(parser.inline_scripts)
    check_behavior(prototype)
    print("check_prototype.py: PASS")


if __name__ == "__main__":
    main()
