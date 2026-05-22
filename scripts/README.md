# Scripts

See the auto-generated [scripts catalog](../README.md#scripts) in the root README.

Run `pnpm docs` to regenerate the catalog after adding or changing scripts.

## Offline Press Review

Use these scripts when you want Codex in VS Code to review new press articles locally instead of running LLM logic in CI.

1. Build a review queue from new press articles:

```bash
python3 scripts/build_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --max-items 20
```

This writes:

- `.cache/press-review-queue.json` — edit `review.status`, `review.selected_slugs`, and `review.notes`
- `.cache/press-review-queue.md` — human-readable brief for Codex or manual review

Suggested Codex prompt in VS Code:

```text
Read analyses/.cache/press-review-queue.json and analyses/.cache/press-review-queue.md.
For each pending item, inspect the article context and fill review.status, review.selected_slugs, and review.notes.
Use "approved" only when the article is genuinely useful for the selected blog(s); otherwise use "rejected".
Do not change unrelated files.
```

2. Apply the reviewed decisions and refresh app output:

```bash
python3 scripts/apply_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson
```

This updates:

- `scripts/press-reviewed-links.json` — curated article-to-blog matches kept in git
- `.cache/press-review-state.json` — local memory of processed articles
- `apps/*/public/press-references/*.json` and `apps/*/public/data/press_references.json`
