#!/usr/bin/env python3
"""Sync visible analysis metadata with the latest available dataset period."""

from __future__ import annotations

import argparse
import calendar
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

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

PAGE_DATE_RE = re.compile(r'^(\s*date:\s*)"([^"]+)"', re.MULTILINE)
PAGE_DATA_LABEL_RE = re.compile(r'^(\s*dataAvailabilityLabel:\s*)"([^"]+)"', re.MULTILINE)
PAGE_PUBLICATION_DATE_RE = re.compile(r'^(\s*publicationDate:\s*)"([^"]+)"', re.MULTILINE)
PAGE_SUMMARY_LINE_RE = re.compile(r'^(\s*summary:\s*"[^"]*",\n)', re.MULTILINE)
FRONTMATTER_RE = re.compile(r'^---\n(.*?)\n---\n?', re.DOTALL)


@dataclass
class DataStatus:
    data_availability_label: str
    source_publication_date: str | None = None
    content_exact_through_label: str | None = None


def format_month_year_label(year: int, month: int) -> str:
    return f"{DUTCH_MONTHS[month]} {year}"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def replace_first_quoted_field(content: str, pattern: re.Pattern[str], value: str) -> tuple[str, bool, str | None]:
    match = pattern.search(content)
    if not match:
        return content, False, None

    existing_value = match.group(2)
    if existing_value == value:
        return content, False, existing_value

    updated_content, count = pattern.subn(rf'\1"{value}"', content, count=1)
    return updated_content, count > 0, existing_value


def upsert_page_data_label(content: str, value: str) -> tuple[str, bool, str | None]:
    updated_content, changed, existing_value = replace_first_quoted_field(content, PAGE_DATA_LABEL_RE, value)
    if existing_value is not None:
        return updated_content, changed, existing_value

    match = PAGE_SUMMARY_LINE_RE.search(content)
    if not match:
        raise SystemExit("Could not find summary line to insert dataAvailabilityLabel after.")

    insertion = f'{match.group(1)}  dataAvailabilityLabel: "{value}",\n'
    updated_content = content[:match.start()] + insertion + content[match.end():]
    return updated_content, True, None


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

    updated = frontmatter.rstrip('\n') + f'\n{replacement}\n'
    return updated, True


def monthly_status(data_path: Path) -> DataStatus:
    data = load_json(data_path)
    latest = max(data, key=lambda row: (int(row["y"]), int(row["mo"])))
    year = int(latest["y"])
    month = int(latest["mo"])
    last_day = calendar.monthrange(year, month)[1]
    return DataStatus(
        data_availability_label=format_month_year_label(year, month),
        content_exact_through_label=f"{last_day:02d}/{month:02d}/{year}",
    )


def yearly_status(data_path: Path) -> DataStatus:
    data = load_json(data_path)
    latest_year = max(int(row["y"]) for row in data)
    return DataStatus(data_availability_label=str(latest_year))


def parse_dateish_string(value: str) -> datetime | None:
    normalized = value.strip()
    for separator in ("T", " "):
        if separator in normalized:
            normalized = normalized.split(separator, 1)[0]
            break

    if re.fullmatch(r"\d{4}-\d{2}$", normalized):
        normalized = f"{normalized}-01"

    try:
        return datetime.strptime(normalized, "%Y-%m-%d")
    except ValueError:
        return None


def status_from_metadata_dict(metadata: dict[str, Any]) -> DataStatus | None:
    source_publication_date = metadata.get("sourcePublicationDate") or metadata.get("source_publication_date")

    latest_period = metadata.get("latestPeriod")
    if isinstance(latest_period, str) and re.fullmatch(r"\d{4}-\d{2}", latest_period):
        year_text, month_text = latest_period.split("-")
        return DataStatus(
            data_availability_label=format_month_year_label(int(year_text), int(month_text)),
            source_publication_date=source_publication_date,
        )

    latest_year = metadata.get("latest_year")
    if isinstance(latest_year, int):
        return DataStatus(data_availability_label=str(latest_year), source_publication_date=source_publication_date)

    period_end = metadata.get("period_end")
    if isinstance(period_end, int):
        return DataStatus(data_availability_label=str(period_end), source_publication_date=source_publication_date)

    year_range = metadata.get("year_range")
    if isinstance(year_range, dict) and isinstance(year_range.get("max"), int):
        return DataStatus(data_availability_label=str(year_range["max"]), source_publication_date=source_publication_date)

    rapportjaren = metadata.get("rapportjaren")
    if isinstance(rapportjaren, list) and rapportjaren:
        years = [int(year) for year in rapportjaren]
        return DataStatus(data_availability_label=str(max(years)), source_publication_date=source_publication_date)

    latest_data_date = metadata.get("latest_data_date")
    if isinstance(latest_data_date, str):
        parsed = parse_dateish_string(latest_data_date)
        if parsed:
            return DataStatus(
                data_availability_label=format_month_year_label(parsed.year, parsed.month),
                source_publication_date=source_publication_date,
            )

    if isinstance(metadata.get("max_year"), int) and isinstance(metadata.get("max_month"), int):
        return DataStatus(
            data_availability_label=format_month_year_label(int(metadata["max_year"]), int(metadata["max_month"])),
            source_publication_date=source_publication_date,
        )

    if isinstance(metadata.get("max_year"), int):
        return DataStatus(data_availability_label=str(int(metadata["max_year"])), source_publication_date=source_publication_date)

    return None


def metadata_status(metadata_path: Path) -> DataStatus | None:
    if not metadata_path.exists():
        return None

    data = load_json(metadata_path)
    if not isinstance(data, dict):
        return None

    return status_from_metadata_dict(data)


def infer_status_for_slug(repo_root: Path, slug: str) -> DataStatus | None:
    app_root = repo_root / "apps" / slug

    if slug == "vergunningen-goedkeuringen":
        data_path = app_root / "public" / "data" / "data_monthly.json"
        if data_path.exists():
            return monthly_status(data_path)

    if slug == "vergunningen-aanvragen":
        data_path = app_root / "public" / "data" / "yearly_totals.json"
        if data_path.exists():
            return yearly_status(data_path)

    for path in (
        app_root / "public" / "data" / "metadata.json",
        app_root / "public" / "data" / "processed_metadata.json",
        app_root / "public" / "data" / "summary.json",
        app_root / "public" / "data" / "lookups.json",
    ):
        status = metadata_status(path)
        if status:
            return status

    return None


def get_status_for_slug(repo_root: Path, slug: str) -> DataStatus:
    status = infer_status_for_slug(repo_root, slug)
    if status:
        return status
    raise SystemExit(f"No data status adapter configured for slug: {slug}")


def update_page_metadata(page_path: Path, status: DataStatus, updated_date: str) -> bool:
    content = page_path.read_text(encoding="utf-8")
    updated_content, data_label_changed, existing_label = upsert_page_data_label(content, status.data_availability_label)

    metadata_changed = data_label_changed
    publication_changed = False

    if status.source_publication_date:
        updated_content, publication_changed, _ = replace_first_quoted_field(
            updated_content, PAGE_PUBLICATION_DATE_RE, status.source_publication_date
        )
        metadata_changed = metadata_changed or publication_changed

    should_bump_date = (
        (existing_label is not None and existing_label != status.data_availability_label)
        or publication_changed
    )

    if should_bump_date:
        updated_content, date_changed, _ = replace_first_quoted_field(updated_content, PAGE_DATE_RE, updated_date)
        metadata_changed = metadata_changed or date_changed

    if not metadata_changed:
        print(f"No page metadata change needed for {page_path}")
        return False

    page_path.write_text(updated_content, encoding="utf-8")
    if should_bump_date:
        print(f"Updated {page_path} with data availability '{status.data_availability_label}' and blog date {updated_date}")
    else:
        print(f"Updated {page_path} with data availability '{status.data_availability_label}'")
    return True


def update_content_date(content_path: Path, updated_date: str) -> bool:
    content = content_path.read_text(encoding="utf-8")
    parsed = extract_frontmatter(content)
    if not parsed:
        print(f"No valid frontmatter found in {content_path}")
        return False

    frontmatter, rest = parsed
    frontmatter, changed = upsert_frontmatter_field(frontmatter, "date", updated_date)
    if not changed:
        return False

    content_path.write_text(f"---\n{frontmatter.rstrip()}\n---\n{rest.lstrip()}", encoding="utf-8")
    print(f"Updated {content_path} frontmatter date to {updated_date}")
    return True


def update_content_body_date(content_path: Path, data_label: str, exact_through_label: str) -> bool:
    """Replace the (data: ...) period indicator in the MDX body text."""
    content = content_path.read_text(encoding="utf-8")
    replacement = f"(data: {data_label}; data beschikbaar tot en met {exact_through_label})"
    updated = re.sub(r"\(data:\s*[^)]+\)", replacement, content, count=1)
    if updated == content:
        print(f"No body text change needed for {content_path}")
        return False
    content_path.write_text(updated, encoding="utf-8")
    print(f"Updated body text in {content_path} to {data_label}")
    return True


def process_slug(repo_root: Path, slug: str, updated_date: str) -> int:
    status = get_status_for_slug(repo_root, slug)
    app_root = repo_root / "apps" / slug
    page_path = app_root / "src" / "app" / "page.tsx"
    content_path = app_root / "content.mdx"

    if not page_path.exists():
        raise SystemExit(f"Page file not found: {page_path}")

    changed = update_page_metadata(page_path, status, updated_date)
    if changed and content_path.exists():
        update_content_date(content_path, updated_date)

    if content_path.exists() and status.content_exact_through_label:
        update_content_body_date(content_path, status.data_availability_label, status.content_exact_through_label)

    return 0


def discover_supported_slugs(repo_root: Path) -> list[str]:
    apps_dir = repo_root / "apps"
    supported: list[str] = []
    for app_root in sorted(apps_dir.iterdir()):
        if not app_root.is_dir() or app_root.name == "portal":
            continue
        page_path = app_root / "src" / "app" / "page.tsx"
        if not page_path.exists():
            continue
        if infer_status_for_slug(repo_root, app_root.name):
            supported.append(app_root.name)
    return supported


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", nargs="?", help="Analysis slug to update")
    parser.add_argument("--all", action="store_true", help="Update every analysis with an inferable data status")
    parser.add_argument(
        "--updated-date",
        default=date.today().isoformat(),
        help="ISO date to write when the data availability label or source publication date changed (default: today)",
    )
    args = parser.parse_args()

    if args.all == (args.slug is not None):
        raise SystemExit("Pass exactly one of <slug> or --all.")

    repo_root = Path(__file__).resolve().parent.parent
    slugs = discover_supported_slugs(repo_root) if args.all else [args.slug]

    for slug in slugs:
        process_slug(repo_root, slug, args.updated_date)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
