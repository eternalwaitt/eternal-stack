#!/usr/bin/env python3
"""Retain one stable control-plane behavior lesson in Hindsight."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


LESSON_ID = "control-plane/evidence-before-agreement/v1"
LESSON_TTL_SECONDS = 30 * 24 * 60 * 60
BANK_ID = "claude-control-plane"

LESSON = """Control-plane behavior lesson: evidence before agreement.

When the user challenges a claim, do not begin with agreement language like "You're right",
"good catch", "exactly", or an apology followed by "let me check".

Required response shape:
1. State whether the claim is verified, unverified, or contradicted.
2. Name the evidence already checked, or name the concrete check you will run next.
3. Only then give the correction or next action.

This is a standing behavior rule, not a transcript memory. Prefer fresh repo,
runtime, and command evidence over recalled memory."""


def load_config() -> dict:
    config_path = Path.home() / ".hindsight" / "claude-code.json"
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text())


def should_skip(stamp_path: Path) -> bool:
    if os.environ.get("CLAUDE_GUARD_FORCE_LESSON_RETAIN") == "1":
        return False
    if not stamp_path.exists():
        return False
    return time.time() - stamp_path.stat().st_mtime < LESSON_TTL_SECONDS


def retain_lesson(config: dict) -> None:
    api_url = str(config.get("hindsightApiUrl") or "").rstrip("/")
    if not api_url:
        return

    item = {
        "content": LESSON,
        "document_id": LESSON_ID,
        "context": "claude-control-plane",
        "metadata": {
            "kind": "standing_behavior_rule",
            "version": "1",
            "retention_policy": "stable_upsert_not_per_violation",
        },
        "tags": ["control-plane", "behavior", "evidence-before-agreement"],
    }
    body = json.dumps({"items": [item], "async": True}).encode()
    bank = urllib.parse.quote(BANK_ID, safe="")
    req = urllib.request.Request(
        f"{api_url}/v1/default/banks/{bank}/memories",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = config.get("hindsightApiToken")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=3):
        return


def main() -> int:
    if os.environ.get("CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON") == "1":
        return 0

    stamp_dir = Path.home() / ".claude" / "cache" / "control-plane-lessons"
    stamp_dir.mkdir(parents=True, exist_ok=True)
    stamp_path = stamp_dir / "evidence-before-agreement-v1.retained"
    if should_skip(stamp_path):
        return 0

    try:
        retain_lesson(load_config())
        stamp_path.write_text(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError, TimeoutError):
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
