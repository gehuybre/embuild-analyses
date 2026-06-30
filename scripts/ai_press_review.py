#!/usr/bin/env python3
"""
AI-powered press release relevance assessment using the Claude API.

Reads the pending items from the review queue (built by build_press_review_queue.py),
asks Claude to decide which app slugs each article is relevant for, and writes the
decisions back to the queue file so apply_press_review_queue.py can consume them.

Usage:
    python ai_press_review.py [--queue-file PATH] [--dry-run] [--verbose]

The ANTHROPIC_API_KEY environment variable must be set.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import anthropic

import update_press_references as press_refs

DEFAULT_QUEUE = press_refs.repo_root() / ".cache" / "press-review-queue.json"

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 300

SYSTEM_PROMPT = """\
Je bent een redacteur van Embuild Vlaanderen. Je beoordeelt of nieuwe persberichten
relevant zijn voor specifieke data-analyse blogs op embuildvlaanderen.be.

Elke blog gaat over een concreet thema (bv. bouwvergunningen, faillissementen,
arbeidsmarkt). Een persbericht is relevant als het direct over dat thema gaat of
de statistieken daarin contextueel versterkt met actuele sector-informatie.

Wees streng: twijfelgevallen zijn "rejected". Antwoord uitsluitend in geldig JSON.
"""

ITEM_PROMPT = """\
PERSBERICHT:
Titel: {title}
Datum: {date}
Excerpt: {excerpt}
{paragraphs_block}

KANDIDAAT-BLOGS (gesorteerd op relevantiescore):
{candidates_block}

Beslis of dit persbericht relevant is en voor welke blogs.

Geef UITSLUITEND dit JSON-object terug (geen extra tekst):
{{
  "status": "approved" | "rejected",
  "selected_slugs": ["slug1", "slug2"],
  "notes": "Één zin uitleg in het Nederlands."
}}

Regels:
- "approved" alleen als het persbericht duidelijk relevant is voor minstens één blog.
- "rejected" als het persbericht te algemeen is of niet specifiek genoeg aansluit.
- "selected_slugs" bevat alleen slugs uit de kandidatenlijst hierboven.
- Bij "rejected" is "selected_slugs" een lege lijst.
"""


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--queue-file",
        default=str(DEFAULT_QUEUE),
        help=f"Path to review queue JSON (default: {DEFAULT_QUEUE})",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print decisions without writing to the queue file.",
    )
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--model", default=MODEL)
    p.add_argument("--max-tokens", type=int, default=MAX_TOKENS)
    p.add_argument("--retry-delay", type=float, default=3.0, help="Base delay between retries (seconds).")
    p.add_argument("--max-retries", type=int, default=3)
    return p.parse_args()


def build_prompt(item: dict) -> str:
    article = item.get("article", {})

    paragraphs = article.get("paragraphs") or []
    paragraphs_block = ""
    if paragraphs:
        paragraphs_block = "Paragrafen:\n" + "\n".join(f"- {p}" for p in paragraphs[:3])

    candidates = item.get("top_candidates") or []
    candidate_lines = []
    for c in candidates:
        reasons = "; ".join(c.get("reasons") or [])
        candidate_lines.append(
            f"- {c['slug']} ({c['title']}): {c['summary']}\n"
            f"  Score: {c['score']}; {reasons}"
        )

    return ITEM_PROMPT.format(
        title=article.get("title") or "(geen titel)",
        date=article.get("date") or "",
        excerpt=article.get("excerpt") or "(geen excerpt)",
        paragraphs_block=paragraphs_block,
        candidates_block="\n".join(candidate_lines),
    )


def parse_ai_response(text: str, valid_slugs: set[str]) -> dict:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1].lstrip("json").strip() if len(parts) > 1 else text

    data = json.loads(text)
    status = str(data.get("status") or "rejected").strip().lower()
    if status not in ("approved", "rejected"):
        status = "rejected"

    raw_slugs = data.get("selected_slugs") or []
    selected = [str(s).strip() for s in raw_slugs if str(s).strip() in valid_slugs]

    if status == "approved" and not selected:
        status = "rejected"

    return {
        "status": status,
        "selected_slugs": selected,
        "notes": str(data.get("notes") or "").strip(),
    }


def call_api(
    client: anthropic.Anthropic,
    prompt: str,
    valid_slugs: set[str],
    model: str,
    max_tokens: int,
    retry_delay: float,
    max_retries: int,
    title: str,
) -> dict:
    for attempt in range(1, max_retries + 1):
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            return parse_ai_response(resp.content[0].text, valid_slugs)
        except (json.JSONDecodeError, KeyError, IndexError, AttributeError) as exc:
            if attempt == max_retries:
                return {"status": "rejected", "selected_slugs": [], "notes": f"Parse error: {exc}"}
            time.sleep(retry_delay)
        except anthropic.RateLimitError:
            wait = retry_delay * (2 ** attempt)
            print(f"  Rate limit hit, waiting {wait:.0f}s...", file=sys.stderr)
            time.sleep(wait)
        except anthropic.APIError as exc:
            if attempt == max_retries:
                return {"status": "rejected", "selected_slugs": [], "notes": f"API error: {exc}"}
            time.sleep(retry_delay * attempt)

    return {"status": "rejected", "selected_slugs": [], "notes": "Max retries exceeded."}


def main() -> int:
    args = parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr)
        return 1

    queue_file = Path(args.queue_file).resolve()
    if not queue_file.exists():
        print(f"Queue file not found: {queue_file}", file=sys.stderr)
        return 1

    with queue_file.open("r", encoding="utf-8") as handle:
        queue = json.load(handle)

    items = queue.get("items") or []
    pending = [item for item in items if (item.get("review") or {}).get("status") == "pending"]

    if not pending:
        print("No pending items in the review queue.")
        return 0

    print(f"Reviewing {len(pending)} pending item(s) with {args.model}...")
    client = anthropic.Anthropic(api_key=api_key)

    reviewed = 0
    approved = 0

    for item in pending:
        article = item.get("article") or {}
        title = article.get("title") or "(geen titel)"
        candidates = item.get("top_candidates") or []

        if not candidates:
            item["review"] = {
                "status": "rejected",
                "selected_slugs": [],
                "notes": "Geen kandidaat-blogs gevonden.",
            }
            if args.verbose:
                print(f"  SKIP (no candidates): {title}")
            continue

        valid_slugs = {c["slug"] for c in candidates}
        prompt = build_prompt(item)

        decision = call_api(
            client=client,
            prompt=prompt,
            valid_slugs=valid_slugs,
            model=args.model,
            max_tokens=args.max_tokens,
            retry_delay=args.retry_delay,
            max_retries=args.max_retries,
            title=title,
        )
        item["review"] = decision
        reviewed += 1
        if decision["status"] == "approved":
            approved += 1

        if args.verbose or args.dry_run:
            slugs = ", ".join(decision["selected_slugs"]) or "-"
            status_label = decision["status"].upper()
            print(f"  [{status_label}] {title}")
            print(f"    → {slugs}")
            if decision["notes"]:
                print(f"    {decision['notes']}")

    print(f"\nDone: {reviewed} reviewed, {approved} approved, {reviewed - approved} rejected.")

    if not args.dry_run:
        with queue_file.open("w", encoding="utf-8") as handle:
            json.dump(queue, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
