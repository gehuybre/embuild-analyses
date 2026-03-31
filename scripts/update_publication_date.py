#!/usr/bin/env python3
"""Scrape publication date from Statbel pages and update MDX frontmatter."""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

import requests

# Mapping of Dutch month names to numbers
DUTCH_MONTHS = {
    'januari': 1, 'februari': 2, 'maart': 3, 'april': 4,
    'mei': 5, 'juni': 6, 'juli': 7, 'augustus': 8,
    'september': 9, 'oktober': 10, 'november': 11, 'december': 12
}

FRONTMATTER_RE = re.compile(r'^---\n(.*?)\n---\n?', re.DOTALL)


def fetch_publication_date(url: str) -> str | None:
    """
    Fetch the publication date from a Statbel page.

    Statbel pages typically show dates in format "16 oktober 2025" or similar.
    Returns date in ISO format (YYYY-MM-DD) or None if not found.
    """
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        html = response.text

        # Pattern for Dutch date format: "1 december 2025" or "16 oktober 2025"
        # Look for dates in article headers, news items, or metadata
        date_pattern = r'(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})'

        matches = re.findall(date_pattern, html, re.IGNORECASE)

        if not matches:
            print(f"No publication date found on {url}")
            return None

        # Take the first (most prominent) date found
        day, month_name, year = matches[0]
        month = DUTCH_MONTHS[month_name.lower()]

        date = datetime(int(year), month, int(day))
        iso_date = date.strftime('%Y-%m-%d')

        print(f"Found publication date: {iso_date}")
        return iso_date

    except requests.RequestException as e:
        print(f"Error fetching {url}: {e}")
        return None


def extract_frontmatter(content: str) -> tuple[str, str] | None:
    match = FRONTMATTER_RE.match(content)
    if not match:
        return None
    return match.group(1), content[match.end():]


def upsert_frontmatter_field(frontmatter: str, field_name: str, value: str) -> tuple[str, bool]:
    pattern = rf'^{re.escape(field_name)}:\s*(.+)$'
    replacement = f'{field_name}: {value}'
    match = re.search(pattern, frontmatter, re.MULTILINE)
    if match:
        existing_value = match.group(1).strip()
        if existing_value == value:
            return frontmatter, False
        return re.sub(pattern, replacement, frontmatter, flags=re.MULTILINE), True

    if 'sourceUrl:' in frontmatter and field_name == 'sourcePublicationDate':
        updated = re.sub(
            r'(sourceUrl:\s*[^\n]+)',
            rf'\1\n{replacement}',
            frontmatter.rstrip('\n'),
        ) + '\n'
        return updated, True

    updated = frontmatter.rstrip('\n') + f'\n{replacement}\n'
    return updated, True


def update_mdx_frontmatter(mdx_path: Path, publication_date: str, sync_date_field: bool = False) -> bool:
    """
    Update sourcePublicationDate and optionally the public date in MDX frontmatter.

    Returns True if the file was modified, False otherwise.
    """
    content = mdx_path.read_text(encoding='utf-8')
    parsed = extract_frontmatter(content)
    if not parsed:
        print(f"No valid frontmatter found in {mdx_path}")
        return False

    frontmatter, rest = parsed
    modified = False

    frontmatter, changed = upsert_frontmatter_field(frontmatter, 'sourcePublicationDate', publication_date)
    modified = modified or changed

    if sync_date_field:
        frontmatter, changed = upsert_frontmatter_field(frontmatter, 'date', publication_date)
        modified = modified or changed

    if not modified:
        print(f"Publication date already up to date in {mdx_path}")
        return False

    new_content = f"---\n{frontmatter.rstrip()}\n---\n{rest.lstrip()}"
    mdx_path.write_text(new_content, encoding='utf-8')
    print(f"Updated {mdx_path} with publication date {publication_date}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('analysis_slug')
    parser.add_argument('statbel_url')
    parser.add_argument(
        '--sync-date-field',
        action='store_true',
        help='Also update the frontmatter date field to the same publication date.',
    )
    args = parser.parse_args()

    # Find the MDX file
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    mdx_path = repo_root / 'embuild-analyses' / 'analyses' / args.analysis_slug / 'content.mdx'

    if not mdx_path.exists():
        print(f"MDX file not found: {mdx_path}")
        sys.exit(1)

    # Fetch publication date
    pub_date = fetch_publication_date(args.statbel_url)
    if not pub_date:
        print("Could not fetch publication date, exiting")
        sys.exit(0)  # Don't fail the workflow, just skip

    # Update MDX
    modified = update_mdx_frontmatter(mdx_path, pub_date, sync_date_field=args.sync_date_field)

    if modified:
        print(f"Successfully updated {args.analysis_slug} with publication date {pub_date}")
    else:
        print(f"No changes needed for {args.analysis_slug}")


if __name__ == '__main__':
    main()
