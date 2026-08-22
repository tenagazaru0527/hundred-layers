#!/usr/bin/env python3
"""Validate the development status snapshot and its static page."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


REQUIRED_SECTIONS = {
    "updatedAt",
    "baseCommit",
    "current",
    "progressSinceLastUpdate",
    "features",
    "shelved",
    "consultations",
    "nextSteps",
}
IMPLEMENTATION_STATUSES = {"実装済み", "検証中", "未実装"}
SPECIFICATION_STATUSES = {"確定", "Prototype仮採用", "有力案", "未決"}


class StatusPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.scripts: list[str] = []
        self._script_chunks: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"] or "")
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"] or "")
        if tag == "script" and not attributes.get("src"):
            self._script_chunks = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script_chunks is not None:
            self.scripts.append("".join(self._script_chunks))
            self._script_chunks = None

    def handle_data(self, data: str) -> None:
        if self._script_chunks is not None:
            self._script_chunks.append(data)


def fail(message: str) -> None:
    print(f"check_status_page.py: FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_text(value: object, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{path} must be a non-empty string")
    return value


def check_link(link: object, path: str) -> None:
    if not isinstance(link, dict):
        fail(f"{path} must be an object")
    require_text(link.get("label"), f"{path}.label")
    url = require_text(link.get("url"), f"{path}.url")
    parsed = urlparse(url)
    if url == "./":
        return
    if parsed.scheme != "https" or parsed.netloc != "github.com":
        fail(f"{path}.url must be ./ or an https://github.com URL")


def check_card_items(items: object, path: str) -> None:
    if not isinstance(items, list) or not items:
        fail(f"{path} must be a non-empty array")
    for index, item in enumerate(items):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            fail(f"{item_path} must be an object")
        require_text(item.get("title"), f"{item_path}.title")
        require_text(item.get("summary"), f"{item_path}.summary")
        links = item.get("links")
        if not isinstance(links, list):
            fail(f"{item_path}.links must be an array")
        for link_index, link in enumerate(links):
            check_link(link, f"{item_path}.links[{link_index}]")


def check_data(data_path: Path) -> None:
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read valid JSON from {data_path}: {error}")

    if not isinstance(data, dict):
        fail("status data root must be an object")
    missing = REQUIRED_SECTIONS - data.keys()
    if missing:
        fail("missing required sections: " + ", ".join(sorted(missing)))

    updated_at = require_text(data["updatedAt"], "updatedAt")
    try:
        parsed_date = datetime.fromisoformat(updated_at)
    except ValueError:
        fail("updatedAt must be an ISO 8601 date-time")
    if parsed_date.tzinfo is None:
        fail("updatedAt must include a timezone")

    base_commit = data["baseCommit"]
    if not isinstance(base_commit, dict):
        fail("baseCommit must be an object")
    sha = require_text(base_commit.get("sha"), "baseCommit.sha")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        fail("baseCommit.sha must be a full 40-character lowercase SHA")
    check_link({"label": sha, "url": base_commit.get("url")}, "baseCommit")

    last_pull_request = data.get("lastPullRequest")
    if last_pull_request is not None:
        if not isinstance(last_pull_request, dict):
            fail("lastPullRequest must be an object or null")
        number = last_pull_request.get("number")
        if not isinstance(number, int) or number < 1:
            fail("lastPullRequest.number must be a positive integer")
        require_text(last_pull_request.get("title"), "lastPullRequest.title")
        check_link(
            {"label": f"PR #{number}", "url": last_pull_request.get("url")},
            "lastPullRequest",
        )

    current = data["current"]
    if not isinstance(current, dict):
        fail("current must be an object")
    for key in ("theme", "summary", "decisionPoint"):
        require_text(current.get(key), f"current.{key}")
    check_link(current.get("primaryIssue"), "current.primaryIssue")

    for section in ("progressSinceLastUpdate", "shelved", "consultations", "nextSteps"):
        check_card_items(data[section], section)

    features = data["features"]
    if not isinstance(features, list) or not features:
        fail("features must be a non-empty array")
    for index, feature in enumerate(features):
        path = f"features[{index}]"
        if not isinstance(feature, dict):
            fail(f"{path} must be an object")
        require_text(feature.get("name"), f"{path}.name")
        require_text(feature.get("note"), f"{path}.note")
        if feature.get("implementationStatus") not in IMPLEMENTATION_STATUSES:
            fail(f"{path}.implementationStatus has an unknown value")
        if feature.get("specificationStatus") not in SPECIFICATION_STATUSES:
            fail(f"{path}.specificationStatus has an unknown value")
        links = feature.get("links")
        if not isinstance(links, list):
            fail(f"{path}.links must be an array")
        for link_index, link in enumerate(links):
            check_link(link, f"{path}.links[{link_index}]")


def check_page(page_path: Path) -> None:
    try:
        source = page_path.read_text(encoding="utf-8")
    except OSError as error:
        fail(f"cannot read {page_path}: {error}")

    parser = StatusPageParser()
    parser.feed(source)
    parser.close()

    missing_ids = {"snapshotMeta", "statusContent"} - parser.ids
    if missing_ids:
        fail("status page is missing IDs: " + ", ".join(sorted(missing_ids)))
    if "./" not in parser.links:
        fail("status page must link back to the Prototype")
    if not parser.scripts or not any('fetch("./status-data.json"' in script for script in parser.scripts):
        fail("status page must load ./status-data.json")

    node = shutil.which("node")
    if not node:
        fail("node is required for inline JavaScript syntax validation")
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
        handle.write("\n\n".join(parser.scripts))
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
        fail("inline JavaScript syntax error\n" + result.stderr.strip())


def main() -> None:
    data_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("status-data.json")
    page_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("status.html")
    check_data(data_path)
    check_page(page_path)
    print("check_status_page.py: PASS")


if __name__ == "__main__":
    main()
