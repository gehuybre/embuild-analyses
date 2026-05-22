#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import update_press_references as press_refs

DEFAULT_PROFILES = Path(__file__).with_name("press-blog-profiles.json")
DEFAULT_REVIEWED = Path(__file__).with_name("press-reviewed-links.json")
DEFAULT_QUEUE = press_refs.repo_root() / ".cache" / "press-review-queue.json"
DEFAULT_STATE = press_refs.repo_root() / ".cache" / "press-review-state.json"
DEFAULT_MARKDOWN = press_refs.repo_root() / ".cache" / "press-review-queue.md"

WORD_RE = re.compile(r"\w+", re.UNICODE)


@dataclass(frozen=True)
class BlogProfile:
    slug: str
    title: str
    summary: str
    tags: list[str]
    keywords: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a local review queue for new press articles. "
            "The queue uses heuristic candidate selection and is meant to be reviewed with Codex in VS Code."
        )
    )
    parser.add_argument("--profiles", default=str(DEFAULT_PROFILES))
    parser.add_argument("--reviewed-file", default=str(DEFAULT_REVIEWED))
    parser.add_argument("--queue-file", default=str(DEFAULT_QUEUE))
    parser.add_argument("--state-file", default=str(DEFAULT_STATE))
    parser.add_argument("--markdown-output", default=str(DEFAULT_MARKDOWN))
    parser.add_argument("--source-file", help="Path to press.ndjson")
    parser.add_argument("--source-url", help="Optional fallback source URL")
    parser.add_argument("--max-items", type=int, default=20)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--min-score", type=int, default=6)
    parser.add_argument("--include-unmatched", action="store_true")
    parser.add_argument("--slug", action="append", dest="slugs")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def tokenize(value: str) -> set[str]:
    return {token for token in WORD_RE.findall(normalize_text(value)) if len(token) > 2}


def load_profiles(path: Path, selected_slugs: list[str] | None) -> list[BlogProfile]:
    raw = load_json(path, {"apps": {}})
    apps = raw.get("apps", {})
    if not isinstance(apps, dict):
        raise SystemExit(f"Invalid profiles file: {path}")

    profiles: list[BlogProfile] = []
    missing = set(selected_slugs or [])

    for slug, item in sorted(apps.items()):
        if selected_slugs and slug not in selected_slugs:
            continue
        if not isinstance(item, dict):
            raise SystemExit(f"Invalid profile for slug {slug}")
        profiles.append(
            BlogProfile(
                slug=slug,
                title=str(item.get("title") or slug),
                summary=str(item.get("summary") or ""),
                tags=[str(tag) for tag in item.get("tags", [])],
                keywords=[str(keyword) for keyword in item.get("keywords", [])],
            )
        )
        missing.discard(slug)

    if missing:
        raise SystemExit(f"Unknown slug(s) in profiles: {', '.join(sorted(missing))}")

    return profiles


def reviewed_ids(reviewed_file: Path, state_file: Path) -> set[str]:
    ids: set[str] = set()
    reviewed = load_json(reviewed_file, {"articles": []})
    for item in reviewed.get("articles", []):
        article_id = str(item.get("id") or "").strip()
        if article_id:
            ids.add(article_id)

    state = load_json(state_file, {"processed_article_ids": []})
    for article_id in state.get("processed_article_ids", []):
        cleaned = str(article_id).strip()
        if cleaned:
            ids.add(cleaned)

    return ids


def article_snapshot(doc: dict) -> dict:
    paragraphs = [str(value).strip() for value in (doc.get("paragraphs") or []) if str(value).strip()]
    quotes = [str(value).strip() for value in (doc.get("quotes") or []) if str(value).strip()]
    return {
        "id": press_refs.document_id(doc),
        "date": str(doc.get("date") or doc.get("published_at") or "")[:10],
        "title": press_refs.extract_title(doc),
        "url": str(doc.get("url") or ""),
        "excerpt": str(doc.get("excerpt") or ""),
        "subtitle": str(doc.get("subtitle") or "") if doc.get("subtitle") else "",
        "paragraphs": paragraphs[:3],
        "quotes": quotes[:2],
    }


def article_text(doc: dict) -> str:
    return press_refs.build_search_text(doc)


def score_candidate(article: dict, text: str, profile: BlogProfile) -> tuple[int, list[str]]:
    title = normalize_text(article.get("title", ""))
    excerpt = normalize_text(article.get("excerpt", ""))
    body = normalize_text(text)

    score = 0
    reasons: list[str] = []

    for phrase in profile.keywords:
        needle = normalize_text(phrase)
        if not needle:
            continue
        if needle in title:
            score += 8
            reasons.append(f"title matches '{phrase}'")
        elif needle in excerpt:
            score += 5
            reasons.append(f"excerpt matches '{phrase}'")
        elif needle in body:
            score += 3
            reasons.append(f"body matches '{phrase}'")

    article_tokens = tokenize(" ".join([article.get("title", ""), article.get("excerpt", ""), text]))
    profile_tokens = tokenize(" ".join([profile.title, profile.summary, *profile.tags, *profile.keywords]))
    overlap = sorted(article_tokens & profile_tokens)
    if overlap:
        bonus = min(len(overlap), 6)
        score += bonus
        reasons.append("token overlap: " + ", ".join(overlap[:6]))

    return score, reasons[:5]


def existing_reviews(queue_file: Path) -> dict[str, dict]:
    if not queue_file.exists():
        return {}
    queue = load_json(queue_file, {"items": []})
    reviews: dict[str, dict] = {}
    for item in queue.get("items", []):
        article = item.get("article", {})
        article_id = str(article.get("id") or "").strip()
        review = item.get("review")
        if article_id and isinstance(review, dict):
            reviews[article_id] = review
    return reviews


def iter_docs(source_file: Path | None, source_url: str | None) -> Iterable[dict]:
    for line in press_refs.iter_source_lines(source_file, source_url):
        if not line.strip():
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def build_queue(
    docs: Iterable[dict],
    profiles: list[BlogProfile],
    already_processed: set[str],
    preserved_reviews: dict[str, dict],
    top_k: int,
    min_score: int,
    max_items: int,
    include_unmatched: bool,
    verbose: bool,
) -> list[dict]:
    items: list[dict] = []

    for doc in docs:
        article = article_snapshot(doc)
        if not article["id"] or article["id"] in already_processed:
            continue

        text = article_text(doc)
        candidates = []
        for profile in profiles:
            score, reasons = score_candidate(article, text, profile)
            if score < min_score and not include_unmatched:
                continue
            candidates.append(
                {
                    "slug": profile.slug,
                    "title": profile.title,
                    "score": score,
                    "reasons": reasons,
                    "summary": profile.summary,
                }
            )

        candidates.sort(key=lambda item: (item["score"], item["slug"]), reverse=True)
        if not candidates and not include_unmatched:
            continue

        if verbose:
            candidate_summary = ", ".join(
                f"{candidate['slug']}={candidate['score']}"
                for candidate in candidates[:top_k]
            ) or "no candidates"
            print(
                f"queue {article['date']} {article['title']}: {candidate_summary}"
            )

        review = preserved_reviews.get(
            article["id"],
            {
                "status": "pending",
                "selected_slugs": [],
                "notes": "",
            },
        )

        items.append(
            {
                "article": article,
                "top_candidates": candidates[:top_k],
                "review": review,
            }
        )
        if len(items) >= max_items:
            break

    return items


def write_json(path: Path, payload: dict) -> None:
    ensure_parent(path)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def write_markdown(path: Path, payload: dict) -> None:
    ensure_parent(path)
    lines = [
        "# Press Review Queue",
        "",
        "Review `top_candidates`, inspect the local `press.ndjson` article if needed, and edit the JSON queue file.",
        "Set `review.status` to `approved` or `rejected`, fill `selected_slugs`, and add short `notes`.",
        "",
    ]

    for index, item in enumerate(payload.get("items", []), start=1):
        article = item["article"]
        review = item["review"]
        lines.extend(
            [
                f"## {index}. {article['title']}",
                "",
                f"- Date: `{article['date']}`",
                f"- URL: {article['url']}",
                f"- Current review: `{review.get('status', 'pending')}`",
                f"- Selected slugs: `{', '.join(review.get('selected_slugs', [])) or '-'}`",
                "",
                article.get("excerpt", "") or "_No excerpt_",
                "",
                "Top candidates:",
            ]
        )
        for candidate in item.get("top_candidates", []):
            lines.append(
                f"- `{candidate['slug']}` score `{candidate['score']}`: "
                f"{'; '.join(candidate.get('reasons', []))}"
            )
        lines.extend(["", "Paragraphs:"])
        for paragraph in article.get("paragraphs", []):
            lines.append(f"- {paragraph}")
        lines.extend(["", "---", ""])

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    source_file = Path(args.source_file).expanduser().resolve() if args.source_file else None
    if source_file and not source_file.exists():
        raise SystemExit(f"Source file not found: {source_file}")
    if source_file is None:
        source_file = press_refs.resolve_default_source_file()

    profiles = load_profiles(Path(args.profiles).resolve(), args.slugs)
    processed = reviewed_ids(Path(args.reviewed_file).resolve(), Path(args.state_file).resolve())
    preserved = existing_reviews(Path(args.queue_file).resolve())

    items = build_queue(
        docs=iter_docs(source_file, args.source_url),
        profiles=profiles,
        already_processed=processed,
        preserved_reviews=preserved,
        top_k=args.top_k,
        min_score=args.min_score,
        max_items=args.max_items,
        include_unmatched=args.include_unmatched,
        verbose=args.verbose,
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(source_file) if source_file else None,
        "items": items,
    }

    queue_path = Path(args.queue_file).resolve()
    write_json(queue_path, payload)

    markdown_output = args.markdown_output
    if markdown_output:
        write_markdown(Path(markdown_output).resolve(), payload)

    print(f"Wrote {len(items)} queue items to {queue_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
