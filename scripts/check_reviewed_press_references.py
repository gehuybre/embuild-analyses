#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).with_name("press-references.json")
DEFAULT_REVIEWED_LINKS = Path(__file__).with_name("press-reviewed-links.json")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def reference_key(item: dict) -> str:
    return str(item.get("id") or item.get("url") or "").strip()


def load_limits(path: Path) -> dict[str, int]:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    apps = raw.get("apps", {})
    if not isinstance(apps, dict):
        raise SystemExit(f"Invalid config file: {path}")

    limits: dict[str, int] = {}
    for slug, item in apps.items():
        if not isinstance(item, dict):
            continue
        limit = item.get("limit", 5)
        if isinstance(limit, int) and limit > 0:
            limits[str(slug)] = limit
    return limits


def load_reviewed_links(path: Path) -> dict[str, list[dict]]:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    articles = raw.get("articles", [])
    if not isinstance(articles, list):
        raise SystemExit(f"Invalid reviewed links file: {path}")

    by_slug: dict[str, list[dict]] = {}
    for item in articles:
        if not isinstance(item, dict):
            continue
        matched_slugs = item.get("matched_slugs", [])
        if not isinstance(matched_slugs, list):
            continue
        reference = {
            "id": str(item.get("id") or ""),
            "title": str(item.get("title") or ""),
            "date": str(item.get("date") or ""),
            "url": str(item.get("url") or ""),
        }
        if not reference_key(reference):
            continue
        for slug in matched_slugs:
            cleaned = str(slug).strip()
            if not cleaned:
                continue
            by_slug.setdefault(cleaned, []).append(reference)

    for references in by_slug.values():
        references.sort(key=lambda item: (item["date"], item["title"].lower()), reverse=True)

    return by_slug


def dedupe_references(references: list[dict]) -> list[dict]:
    deduped: list[dict] = []
    seen: set[str] = set()

    for item in references:
        key = reference_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def load_generated_reference_keys(slug: str) -> tuple[set[str], set[str]]:
    app_public = repo_root() / "apps" / slug / "public"
    primary_path = app_public / "press-references" / f"{slug}.json"
    secondary_path = app_public / "data" / "press_references.json"

    keys_by_path: list[set[str]] = []
    for path in (primary_path, secondary_path):
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        references = payload.get("references", [])
        if not isinstance(references, list):
            raise SystemExit(f"Invalid generated references file: {path}")
        keys_by_path.append({reference_key(item) for item in references if isinstance(item, dict)})

    return keys_by_path[0], keys_by_path[1]


def main() -> int:
    limits = load_limits(DEFAULT_CONFIG)
    reviewed_links_by_slug = load_reviewed_links(DEFAULT_REVIEWED_LINKS)
    failures: list[str] = []

    for slug, references in sorted(reviewed_links_by_slug.items()):
        limit = limits.get(slug)
        if limit is None:
            failures.append(f"{slug}: reviewed links exist but no app config limit found")
            continue

        expected = dedupe_references(references)[:limit]
        if not expected:
            continue

        primary_keys, secondary_keys = load_generated_reference_keys(slug)
        if primary_keys != secondary_keys:
            failures.append(f"{slug}: public outputs disagree between press-references and data copies")
            continue

        missing = [item for item in expected if reference_key(item) not in primary_keys]
        if missing:
            missing_titles = ", ".join(item["title"] for item in missing)
            failures.append(f"{slug}: missing reviewed references in generated output: {missing_titles}")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1

    print("Reviewed press links are present in generated app outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
