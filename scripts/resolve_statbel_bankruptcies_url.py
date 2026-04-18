#!/usr/bin/env python3
"""Resolve the freshest Statbel bankruptcies ZIP URL.

The Statbel bankruptcy dataset lives under yearly filenames such as
TF_BANKRUPTCIES(2025).zip, while the year in the filename can lag behind the
current calendar year. This helper probes a small year window and returns the
available URL with the newest Last-Modified header.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

BASE_URL = "https://statbel.fgov.be/sites/default/files/files/opendata/BRI_Nace"
STATIC_URL = f"{BASE_URL}/TF_BANKRUPTCIES.zip"


@dataclass
class Candidate:
    url: str
    source: str
    last_modified: str | None
    last_modified_ts: float


def load_metadata_url(meta_file: Path | None) -> str | None:
    if meta_file is None or not meta_file.exists():
        return None

    try:
        payload = json.loads(meta_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Skipping invalid metadata file {meta_file}: {exc}", file=sys.stderr)
        return None

    url = payload.get("url")
    return url if isinstance(url, str) and url.strip() else None


def parse_last_modified(value: str | None) -> float:
    if not value:
        return 0.0

    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return 0.0

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.timestamp()


def probe_url(url: str) -> Candidate | None:
    try:
        result = subprocess.run(
            [
                "curl", "-sSI", "-L", "--fail",
                "--connect-timeout", "10", "--max-time", "15",
                "--retry", "2", "--retry-delay", "3",
                "-A", "Mozilla/5.0 (compatible; data-blog-u/1.0)",
                url,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        print(f"Skipping {url}: {stderr or 'curl failed'}", file=sys.stderr)
        return None
    except Exception as exc:  # pragma: no cover - defensive for workflow runtime
        print(f"Skipping {url}: {exc}", file=sys.stderr)
        return None

    last_modified = None
    for line in result.stdout.splitlines():
        if line.lower().startswith("last-modified:"):
            last_modified = line.split(":", 1)[1].strip()
            break

    return Candidate(
        url=url,
        source="probe",
        last_modified=last_modified,
        last_modified_ts=parse_last_modified(last_modified),
    )


def build_candidates(current_year: int, metadata_url: str | None) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(url: str | None, source: str) -> None:
        if not url or url in seen:
            return
        seen.add(url)
        candidates.append((url, source))

    add(metadata_url, "metadata")

    for year in range(current_year + 1, current_year - 4, -1):
        add(f"{BASE_URL}/TF_BANKRUPTCIES({year}).zip", f"year:{year}")

    add(STATIC_URL, "static")
    return candidates


def choose_best(candidates: list[Candidate]) -> Candidate | None:
    if not candidates:
        return None

    def sort_key(candidate: Candidate) -> tuple[float, str]:
        return (candidate.last_modified_ts, candidate.url)

    return max(candidates, key=sort_key)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--meta-file",
        type=Path,
        help="Optional .remote_metadata.json path to seed the current known-good URL.",
    )
    args = parser.parse_args()

    metadata_url = load_metadata_url(args.meta_file)
    current_year = datetime.now(timezone.utc).year
    candidates = build_candidates(current_year, metadata_url)

    resolved: list[Candidate] = []
    for url, source in candidates:
        candidate = probe_url(url)
        if candidate is None:
            continue
        candidate.source = source
        resolved.append(candidate)
        stamp = candidate.last_modified or "no Last-Modified header"
        print(f"Candidate {source}: {url} ({stamp})", file=sys.stderr)

    best = choose_best(resolved)
    if best is None:
        print("Could not resolve a valid Statbel bankruptcies dataset URL.", file=sys.stderr)
        return 1

    print(f"Selected {best.url} from {best.source}", file=sys.stderr)
    print(best.url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
