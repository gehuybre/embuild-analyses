#!/usr/bin/env python3
"""
Keyword-based press release relevance assessment.

For each pending item in the review queue, checks the full article text against the
approval_query defined per app in press-blog-profiles.json. Apps whose query matches
are added to selected_slugs; articles with no matching app are rejected.

The approval_query uses the same syntax as press-references.json queries:
  - Space-separated tokens: ALL must appear in the article text (AND)
  - Pipe-separated within a token: ANY one must appear (OR)

Example: "vergunningsaanvraag|vergunningsaanvragen" means either compound word must occur.
Example: "faillissement|faillissementen bouwsector|bouwbedrijf" means a bankruptcy word
         AND a construction-sector word must both occur.

Usage:
    python keyword_press_review.py [--queue-file PATH] [--profiles PATH] [--dry-run] [--verbose]

When adding a new app, add an "approval_query" field to that app in press-blog-profiles.json.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import update_press_references as press_refs

DEFAULT_QUEUE = press_refs.repo_root() / ".cache" / "press-review-queue.json"
DEFAULT_PROFILES = Path(__file__).with_name("press-blog-profiles.json")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--queue-file",
        default=str(DEFAULT_QUEUE),
        help=f"Path to review queue JSON (default: {DEFAULT_QUEUE})",
    )
    p.add_argument(
        "--profiles",
        default=str(DEFAULT_PROFILES),
        help=f"Path to press-blog-profiles.json (default: {DEFAULT_PROFILES})",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print decisions without writing to the queue file.",
    )
    p.add_argument("--verbose", action="store_true")
    return p.parse_args()


def article_search_text(article: dict) -> str:
    """Build a single searchable string from the article snapshot fields."""
    parts = [
        article.get("title") or "",
        article.get("subtitle") or "",
        article.get("excerpt") or "",
        *(article.get("paragraphs") or []),
        *(article.get("quotes") or []),
    ]
    return "\n".join(p for p in parts if p.strip())


def load_approval_rules(
    profiles_file: Path, verbose: bool
) -> dict[str, tuple[list[str], list[list[str]]]]:
    raw = json.loads(profiles_file.read_text(encoding="utf-8"))
    apps = raw.get("apps") or {}
    rules: dict[str, tuple[list[str], list[list[str]]]] = {}
    for slug, app in sorted(apps.items()):
        query = str(app.get("approval_query") or "").strip()
        if not query:
            if verbose:
                print(f"  [SKIP] {slug}: no approval_query defined")
            continue
        rules[slug] = press_refs.parse_query(query)
    return rules


def main() -> int:
    args = parse_args()

    profiles_file = Path(args.profiles).resolve()
    rules = load_approval_rules(profiles_file, args.verbose)

    if not rules:
        print("Error: no apps have an approval_query in press-blog-profiles.json.")
        return 1

    queue_file = Path(args.queue_file).resolve()
    if not queue_file.exists():
        print(f"Queue file not found: {queue_file}")
        return 1

    queue = json.loads(queue_file.read_text(encoding="utf-8"))
    items = queue.get("items") or []
    pending = [item for item in items if (item.get("review") or {}).get("status") == "pending"]

    if not pending:
        print("No pending items in the review queue.")
        return 0

    print(f"Assessing {len(pending)} pending item(s) against {len(rules)} app rule(s)...")

    reviewed = approved = 0

    for item in pending:
        article = item.get("article") or {}
        title = article.get("title") or "(geen titel)"
        text = article_search_text(article)

        matched_slugs = [
            slug
            for slug, (required, alternatives) in rules.items()
            if press_refs.match_document(text, required, alternatives)
        ]

        if matched_slugs:
            status = "approved"
            notes = f"Kernwoorden gevonden voor: {', '.join(matched_slugs)}."
            approved += 1
        else:
            status = "rejected"
            notes = "Geen kernwoorden gevonden voor een van de apps."

        item["review"] = {
            "status": status,
            "selected_slugs": matched_slugs,
            "notes": notes,
        }
        reviewed += 1

        if args.verbose or args.dry_run:
            slugs = ", ".join(matched_slugs) or "-"
            print(f"  [{status.upper()}] {title}")
            print(f"    → {slugs}")

    print(f"\nDone: {reviewed} reviewed, {approved} approved, {reviewed - approved} rejected.")

    if not args.dry_run:
        queue_file.write_text(
            json.dumps(queue, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
