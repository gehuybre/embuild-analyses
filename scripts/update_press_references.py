#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator
from urllib.error import URLError
from urllib.request import urlopen

DEFAULT_CONFIG = Path(__file__).with_name("press-references.json")
SENT_SPLIT_RE = re.compile(r"(?<=[\.\!\?])\s+")


@dataclass(frozen=True)
class PressConfig:
    slug: str
    query: str
    limit: int
    start_date: str | None = None
    end_date: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate app press reference JSON files from the emv-pers press.ndjson feed. "
            "The query/excerpt logic follows the emv-pers press-ndjson-search SKILL contract."
        )
    )
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG),
        help=f"Path to press reference config JSON (default: {DEFAULT_CONFIG})",
    )
    parser.add_argument(
        "--slug",
        action="append",
        dest="slugs",
        help="Only update one or more specific app slugs",
    )
    parser.add_argument(
        "--source-file",
        help=(
            "Path to press.ndjson. If omitted, the script first checks PRESS_NDJSON_FILE "
            "and then ../emv-pers/press.ndjson next to this repo."
        ),
    )
    parser.add_argument(
        "--source-url",
        help="Optional URL to press.ndjson. Used only when no local source file is available.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when generated output differs from the committed files.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-app details.",
    )
    return parser.parse_args()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_default_source_file() -> Path | None:
    override = os.environ.get("PRESS_NDJSON_FILE")
    if override:
        return Path(override).expanduser().resolve()

    sibling = repo_root().parent / "emv-pers" / "press.ndjson"
    if sibling.exists():
        return sibling

    return None


def load_config(path: Path, selected_slugs: list[str] | None) -> list[PressConfig]:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    apps = raw.get("apps", {})
    if not isinstance(apps, dict):
        raise SystemExit(f"Invalid config file: {path}")

    configs: list[PressConfig] = []
    missing_slugs = set(selected_slugs or [])

    for slug, item in sorted(apps.items()):
        if selected_slugs and slug not in selected_slugs:
            continue
        if not isinstance(item, dict):
            raise SystemExit(f"Invalid config entry for slug {slug}")
        query = item.get("query")
        limit = item.get("limit", 5)
        if not isinstance(query, str) or not query.strip():
            raise SystemExit(f"Missing query for slug {slug}")
        if not isinstance(limit, int) or limit <= 0:
            raise SystemExit(f"Invalid limit for slug {slug}")
        configs.append(
            PressConfig(
                slug=slug,
                query=query,
                limit=limit,
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
            )
        )
        missing_slugs.discard(slug)

    if missing_slugs:
        missing = ", ".join(sorted(missing_slugs))
        raise SystemExit(f"Unknown slug(s) in config: {missing}")

    return configs


def iter_source_lines(source_file: Path | None, source_url: str | None) -> Iterator[str]:
    if source_file:
        with source_file.open("r", encoding="utf-8") as handle:
            yield from handle
        return

    if not source_url:
        raise SystemExit(
            "No press source available. Provide --source-file, set PRESS_NDJSON_FILE, "
            "or pass --source-url."
        )

    try:
        with urlopen(source_url) as response:  # noqa: S310 - caller controls URL
            for raw_line in response:
                yield raw_line.decode("utf-8")
    except URLError as exc:
        raise SystemExit(f"Unable to read press source URL {source_url}: {exc}") from exc


def parse_query(query: str) -> tuple[list[str], list[list[str]]]:
    required: list[str] = []
    alternatives: list[list[str]] = []

    for token in shlex.split(query):
        if "|" in token:
            parts = [part.strip().lower() for part in token.split("|") if part.strip()]
            if parts:
                alternatives.append(parts)
        else:
            required.append(token.lower())

    return required, alternatives


def date_in_range(iso_ts: str, start: str | None, end: str | None) -> bool:
    date_part = iso_ts[:10]
    if start and date_part < start:
        return False
    if end and date_part > end:
        return False
    return True


def unique_chunks(chunks: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for chunk in chunks:
        if not chunk:
            continue
        cleaned = re.sub(r"\s+", " ", chunk).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
    return output


def build_search_text(doc: dict) -> str:
    chunks = unique_chunks(
        [
            doc.get("title"),
            doc.get("subtitle"),
            doc.get("excerpt"),
            *(doc.get("quotes") or []),
            *(doc.get("paragraphs") or []),
        ]
    )
    return "\n".join(chunks)


def extract_title(doc: dict) -> str:
    title = doc.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    text = build_search_text(doc)
    return text.split("\n", 1)[0].strip()


def match_document(text: str, required: list[str], alternatives: list[list[str]]) -> bool:
    haystack = text.lower()

    for token in required:
        if token not in haystack:
            return False

    for group in alternatives:
        if not any(token in haystack for token in group):
            return False

    return True


def find_excerpts(doc: dict, tokens: list[str], max_excerpts: int = 2) -> list[str]:
    tokens = [token.lower() for token in tokens if token]
    if not tokens:
        return []

    excerpts: list[str] = []
    candidates = unique_chunks(
        [
            doc.get("excerpt"),
            *(doc.get("paragraphs") or []),
        ]
    )
    for candidate in candidates:
        for sentence in SENT_SPLIT_RE.split(candidate):
            snippet = sentence.strip()
            if snippet and any(token in snippet.lower() for token in tokens):
                excerpts.append(snippet)
                break
        if len(excerpts) >= max_excerpts:
            break

    for quote in doc.get("quotes") or []:
        quote_text = str(quote).strip()
        if quote_text and any(token in quote_text.lower() for token in tokens):
            excerpts.append(quote_text)
            if len(excerpts) >= max_excerpts:
                return unique_chunks(excerpts)[:max_excerpts]

    fallback = build_search_text(doc)
    for sentence in SENT_SPLIT_RE.split(fallback):
        snippet = sentence.strip()
        if snippet and any(token in snippet.lower() for token in tokens):
            excerpts.append(snippet)
            if len(excerpts) >= max_excerpts:
                break

    return unique_chunks(excerpts)[:max_excerpts]


def document_id(doc: dict) -> str:
    raw_id = str(doc.get("id") or "").strip()
    if raw_id:
        return raw_id

    basis = "|".join(
        [
            str(doc.get("url") or ""),
            str(doc.get("title") or ""),
            str(doc.get("date") or doc.get("published_at") or ""),
        ]
    )
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def search_documents(lines: Iterable[str], config: PressConfig) -> list[dict]:
    required, alternatives = parse_query(config.query)
    excerpt_tokens = list(required)
    for group in alternatives:
        excerpt_tokens.extend(group)

    matches: list[dict] = []

    for line in lines:
        if not line.strip():
            continue

        try:
            doc = json.loads(line)
        except json.JSONDecodeError:
            continue

        published_at = str(doc.get("date") or doc.get("published_at") or "").strip()
        if not published_at or not date_in_range(
            published_at, config.start_date, config.end_date
        ):
            continue

        text = build_search_text(doc)
        if not text or not match_document(text, required, alternatives):
            continue

        excerpts = find_excerpts(doc, excerpt_tokens)
        matches.append(
            {
                "id": document_id(doc),
                "title": extract_title(doc),
                "date": published_at[:10],
                "url": str(doc.get("url") or ""),
                "excerpt": excerpts[0] if excerpts else "",
            }
        )

    matches.sort(key=lambda item: (item["date"], item["title"].lower()), reverse=True)
    return matches[: config.limit]


def build_payload(config: PressConfig, references: list[dict]) -> dict:
    return {
        "query": config.query,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "references": references,
    }


def payload_signature(payload: dict) -> dict:
    return {
        "query": payload.get("query"),
        "references": payload.get("references"),
    }


def read_existing(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return None


def write_json_if_changed(path: Path, payload: dict, check_only: bool) -> bool:
    existing = read_existing(path)
    if existing and payload_signature(existing) == payload_signature(payload):
        return False

    if check_only:
        return True

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return True


def output_paths(slug: str) -> list[Path]:
    app_root = repo_root() / "apps" / slug / "public"
    return [
        app_root / "press-references" / f"{slug}.json",
        app_root / "data" / "press_references.json",
    ]


def generate_for_configs(
    configs: list[PressConfig],
    source_file: Path | None,
    source_url: str | None,
    check_only: bool,
    verbose: bool,
) -> int:
    raw_lines = list(iter_source_lines(source_file, source_url))
    changed_paths = 0

    for config in configs:
        references = search_documents(raw_lines, config)
        payload = build_payload(config, references)
        stale = False

        for path in output_paths(config.slug):
            changed = write_json_if_changed(path, payload, check_only)
            changed_paths += int(changed)
            stale = stale or changed

        if verbose:
            state = "stale" if stale else "unchanged"
            print(
                f"{config.slug}: {len(references)} references, query={config.query!r}, {state}"
            )

    return changed_paths


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).resolve()
    source_file = Path(args.source_file).expanduser().resolve() if args.source_file else None
    if source_file and not source_file.exists():
        raise SystemExit(f"Source file not found: {source_file}")

    if source_file is None:
        source_file = resolve_default_source_file()

    configs = load_config(config_path, args.slugs)
    changed_paths = generate_for_configs(
        configs=configs,
        source_file=source_file,
        source_url=args.source_url,
        check_only=args.check,
        verbose=args.verbose,
    )

    if args.check:
        if changed_paths:
            print(f"Press references are stale in {changed_paths} file(s).", file=sys.stderr)
            return 1
        print("Press references are up to date.")
        return 0

    if changed_paths:
        print(f"Updated {changed_paths} file(s).")
    else:
        print("Press references already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
