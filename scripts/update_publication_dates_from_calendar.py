#!/usr/bin/env python3
"""
Update Statbel analysis frontmatter using the Statbel publication calendar.

Usage:
    python scripts/update_publication_dates_from_calendar.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
from html import unescape
from pathlib import Path

import requests

CALENDAR_URL = "https://statbel.fgov.be/nl/calendar"

ROW_RE = re.compile(r"<tr>.*?</tr>", re.DOTALL)
TIME_RE = re.compile(r'<time[^>]*datetime="([^"]+)"')
HREF_RE = re.compile(r'<a[^>]*href="([^"]+)"')
FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)


def normalize_url(url: str) -> str:
    return url.rstrip("/")


def parse_calendar(html: str) -> dict[str, str]:
    """
    Parse Statbel calendar HTML and return {url: YYYY-MM-DD} mapping.
    """
    dates: dict[str, str] = {}

    for row in ROW_RE.findall(html):
        time_match = TIME_RE.search(row)
        href_match = HREF_RE.search(row)
        if not time_match or not href_match:
            continue

        raw_datetime = time_match.group(1)
        date = raw_datetime[:10]
        url = href_match.group(1).strip()
        if url.startswith("/"):
            url = f"https://statbel.fgov.be{url}"

        url = normalize_url(unescape(url))
        if len(date) != 10:
            continue

        # Keep the most recent date for the same URL.
        if url in dates and dates[url] >= date:
            continue
        dates[url] = date

    return dates


def extract_frontmatter(content: str) -> tuple[str, str] | None:
    match = FRONTMATTER_RE.match(content)
    if not match:
        return None
    return match.group(1), content[match.end():]


def parse_source_url(frontmatter: str) -> str | None:
    match = re.search(r"^sourceUrl:\s*(.+)$", frontmatter, re.MULTILINE)
    if not match:
        return None
    raw = match.group(1).strip()
    if raw and raw[0] in ("'", '"') and raw[-1] == raw[0]:
        raw = raw[1:-1]
    return normalize_url(raw)


def update_mdx_frontmatter(mdx_path: Path, publication_date: str, dry_run: bool) -> bool:
    content = mdx_path.read_text(encoding="utf-8")
    parsed = extract_frontmatter(content)
    if not parsed:
        return False
    frontmatter, rest = parsed

    pub_date_pattern = r"^sourcePublicationDate:\s*(\d{4}-\d{2}-\d{2})\s*$"
    match = re.search(pub_date_pattern, frontmatter, re.MULTILINE)
    if match:
        existing_date = match.group(1)
        if existing_date == publication_date:
            return False
        new_frontmatter = re.sub(
            pub_date_pattern,
            f"sourcePublicationDate: {publication_date}",
            frontmatter,
            flags=re.MULTILINE,
        )
    else:
        if "sourceUrl:" in frontmatter:
            frontmatter_lines = frontmatter.rstrip("\n")
            new_frontmatter = re.sub(
                r"(sourceUrl:\s*[^\n]+)",
                rf"\1\nsourcePublicationDate: {publication_date}",
                frontmatter_lines,
            ) + "\n"
        else:
            new_frontmatter = frontmatter.rstrip("\n") + f"\nsourcePublicationDate: {publication_date}\n"

    new_content = f"---\n{new_frontmatter.rstrip()}\n---\n{rest.lstrip()}"
    if dry_run:
        return True
    mdx_path.write_text(new_content, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calendar-url", default=CALENDAR_URL)
    parser.add_argument("--analyses-dir", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    response = requests.get(args.calendar_url, timeout=30)
    response.raise_for_status()
    calendar_dates = parse_calendar(response.text)

    repo_root = Path(__file__).resolve().parent.parent
    analyses_dir = Path(args.analyses_dir) if args.analyses_dir else repo_root / "embuild-analyses" / "analyses"
    mdx_files = sorted(analyses_dir.glob("*/content.mdx"))

    updated = 0
    missing = 0

    for mdx_path in mdx_files:
        content = mdx_path.read_text(encoding="utf-8")
        parsed = extract_frontmatter(content)
        if not parsed:
            continue
        source_url = parse_source_url(parsed[0])
        if not source_url:
            continue
        date = calendar_dates.get(source_url)
        if not date:
            missing += 1
            continue
        if update_mdx_frontmatter(mdx_path, date, args.dry_run):
            updated += 1

    print(f"Calendar entries parsed: {len(calendar_dates)}")
    print(f"MDX files scanned: {len(mdx_files)}")
    print(f"Updated files: {updated}")
    print(f"MDX files without calendar match: {missing}")
    if args.dry_run:
        print("Dry run: no files were written.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
