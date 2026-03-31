#!/usr/bin/env python3
"""Sync vergunningen-goedkeuringen MDX copy with the latest generated dataset period."""

from __future__ import annotations

import json
import re
from pathlib import Path

DUTCH_MONTHS = {
    1: "januari",
    2: "februari",
    3: "maart",
    4: "april",
    5: "mei",
    6: "juni",
    7: "juli",
    8: "augustus",
    9: "september",
    10: "oktober",
    11: "november",
    12: "december",
}


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    content_path = repo_root / "embuild-analyses" / "analyses" / "vergunningen-goedkeuringen" / "content.mdx"
    data_path = repo_root / "embuild-analyses" / "analyses" / "vergunningen-goedkeuringen" / "results" / "data_monthly.json"

    if not content_path.exists():
        raise SystemExit(f"Content file not found: {content_path}")
    if not data_path.exists():
        raise SystemExit(f"Results file not found: {data_path}")

    data = json.loads(data_path.read_text(encoding="utf-8"))
    latest = max(data, key=lambda row: (row["y"], row["mo"]))
    latest_label = f"{DUTCH_MONTHS[int(latest['mo'])]} {int(latest['y'])}"

    content = content_path.read_text(encoding="utf-8")
    updated_content = re.sub(r"\(data:\s*[^)]+\)", f"(data: {latest_label})", content, count=1)

    if updated_content == content:
        print(f"No content text change needed; latest dataset period already is {latest_label}.")
        return 0

    content_path.write_text(updated_content, encoding="utf-8")
    print(f"Updated {content_path} to dataset period {latest_label}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
