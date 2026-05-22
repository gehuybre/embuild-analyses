#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import update_press_references as press_refs

DEFAULT_REVIEWED = Path(__file__).with_name("press-reviewed-links.json")
DEFAULT_CONFIG = Path(__file__).with_name("press-references.json")
DEFAULT_QUEUE = press_refs.repo_root() / ".cache" / "press-review-queue.json"
DEFAULT_STATE = press_refs.repo_root() / ".cache" / "press-review-state.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Apply reviewed queue items, persist curated article-to-blog matches, "
            "and rebuild the public press-reference JSON files."
        )
    )
    parser.add_argument("--queue-file", default=str(DEFAULT_QUEUE))
    parser.add_argument("--reviewed-file", default=str(DEFAULT_REVIEWED))
    parser.add_argument("--state-file", default=str(DEFAULT_STATE))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--source-file", help="Path to press.ndjson")
    parser.add_argument("--source-url", help="Optional fallback source URL")
    parser.add_argument("--keep-queue", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def normalize_review(item: dict) -> tuple[str, list[str], str]:
    review = item.get("review", {})
    status = str(review.get("status") or "pending").strip().lower()
    selected_slugs = [str(slug).strip() for slug in review.get("selected_slugs", []) if str(slug).strip()]
    notes = str(review.get("notes") or "").strip()
    return status, sorted(set(selected_slugs)), notes


def merge_reviewed_articles(reviewed_file: Path, queue_items: list[dict], verbose: bool) -> int:
    payload = load_json(reviewed_file, {"articles": [], "updated_at": None})
    existing = {
        str(item.get("id") or "").strip(): item
        for item in payload.get("articles", [])
        if str(item.get("id") or "").strip()
    }

    processed_count = 0
    for item in queue_items:
        article = item.get("article", {})
        article_id = str(article.get("id") or "").strip()
        if not article_id:
            continue

        status, selected_slugs, notes = normalize_review(item)
        if status == "pending":
            continue

        processed_count += 1
        if status == "approved":
            if not selected_slugs:
                raise SystemExit(f"Approved item {article_id} is missing selected_slugs")
            existing[article_id] = {
                "id": article_id,
                "title": str(article.get("title") or ""),
                "date": str(article.get("date") or ""),
                "url": str(article.get("url") or ""),
                "excerpt": str(article.get("excerpt") or ""),
                "matched_slugs": selected_slugs,
                "notes": notes,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
            if verbose:
                print(f"approved {article_id}: {', '.join(selected_slugs)}")
        elif status == "rejected":
            existing.pop(article_id, None)
            if verbose:
                print(f"rejected {article_id}")
        else:
            raise SystemExit(f"Unknown review status for {article_id}: {status}")

    payload["articles"] = sorted(
        existing.values(),
        key=lambda item: (item.get("date", ""), item.get("title", "")),
        reverse=True,
    )
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(reviewed_file, payload)
    return processed_count


def update_state(state_file: Path, queue_items: list[dict]) -> int:
    payload = load_json(state_file, {"processed_article_ids": [], "updated_at": None})
    processed_ids = {str(item).strip() for item in payload.get("processed_article_ids", []) if str(item).strip()}
    touched = 0

    for item in queue_items:
        article = item.get("article", {})
        article_id = str(article.get("id") or "").strip()
        status, _, _ = normalize_review(item)
        if article_id and status != "pending" and article_id not in processed_ids:
            processed_ids.add(article_id)
            touched += 1

    payload["processed_article_ids"] = sorted(processed_ids)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(state_file, payload)
    return touched


def clear_applied_items(queue_file: Path, queue_payload: dict) -> None:
    pending_items = [
        item
        for item in queue_payload.get("items", [])
        if normalize_review(item)[0] == "pending"
    ]
    queue_payload["items"] = pending_items
    queue_payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(queue_file, queue_payload)


def main() -> int:
    args = parse_args()
    queue_file = Path(args.queue_file).resolve()
    reviewed_file = Path(args.reviewed_file).resolve()
    state_file = Path(args.state_file).resolve()
    queue_payload = load_json(queue_file, {"items": []})
    queue_items = queue_payload.get("items", [])
    if not isinstance(queue_items, list):
        raise SystemExit(f"Invalid queue file: {queue_file}")

    processed_count = merge_reviewed_articles(reviewed_file, queue_items, args.verbose)
    state_count = update_state(state_file, queue_items)

    source_file = Path(args.source_file).expanduser().resolve() if args.source_file else None
    if source_file and not source_file.exists():
        raise SystemExit(f"Source file not found: {source_file}")
    if source_file is None:
        source_file = press_refs.resolve_default_source_file()

    configs = press_refs.load_config(Path(args.config).resolve(), None)
    reviewed_links_by_slug = press_refs.load_reviewed_links(reviewed_file)
    changed_paths = press_refs.generate_for_configs(
        configs=configs,
        source_file=source_file,
        source_url=args.source_url,
        check_only=False,
        verbose=args.verbose,
        reviewed_links_by_slug=reviewed_links_by_slug,
    )

    if not args.keep_queue:
        clear_applied_items(queue_file, queue_payload)

    print(
        f"Applied {processed_count} reviewed items, marked {state_count} article(s) processed, "
        f"and refreshed {changed_paths} output file(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
