"""Concatenate all markdown-like files under a docs directory into one output file.

Usage:
    python scripts/concat_docs.py 
    python scripts/concat_docs.py --docs docs --output docs/combined_docs.md --include-filenames --strip-frontmatter

Features:
- Recursively walks a docs directory and picks up files with extensions: .md, .mdx, .markdown
- Writes a single output file with optional file headers
- Optionally strips YAML frontmatter from each file
- Skips the output file if it's located inside the docs folder
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path
from typing import Iterable

DEFAULT_EXTS = {".md", ".mdx", ".markdown"}


def iter_doc_files(docs_dir: Path, exts: Iterable[str]):
    for root, dirs, files in os.walk(docs_dir):
        # sort for deterministic order
        dirs.sort()
        files.sort()
        for f in files:
            path = Path(root) / f
            if path.suffix.lower() in exts:
                yield path


def strip_yaml_frontmatter(text: str) -> str:
    # Remove initial YAML frontmatter block (---\n...---\n)
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            return parts[2].lstrip("\n")
    return text


def main():
    parser = argparse.ArgumentParser(description="Concatenate docs into one file")
    parser.add_argument("--docs", type=Path, default=Path("docs"), help="Docs directory to read from")
    parser.add_argument("--output", type=Path, default=Path("docs/combined_docs.md"), help="Output file path")
    parser.add_argument("--include-filenames", action="store_true", help="Include a heading with the original file path before each file content")
    parser.add_argument("--strip-frontmatter", action="store_true", help="Strip YAML frontmatter from files")
    parser.add_argument("--extensions", type=str, default=",".join(sorted(DEFAULT_EXTS)), help="Comma-separated extensions to include (e.g. .md,.mdx)")
    args = parser.parse_args()

    docs_dir = args.docs.resolve()
    out_path = args.output.resolve()

    if not docs_dir.exists() or not docs_dir.is_dir():
        raise SystemExit(f"Docs directory not found: {docs_dir}")

    exts = {e if e.startswith('.') else f'.{e}' for e in [p.strip() for p in args.extensions.split(',') if p.strip()]}

    # Avoid reading the output file if it lives under docs
    skip_output = out_path.samefile(docs_dir) if out_path.exists() and docs_dir in out_path.parents else False

    header = f"# Combined docs\n\nGenerated: {datetime.utcnow().isoformat()} UTC\n\n"

    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as out:
        out.write(header)

        wrote_any = False
        for path in iter_doc_files(docs_dir, exts):
            # skip the output file itself to avoid recursion
            if path.resolve() == out_path:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"Skipping {path}: could not read ({e})")
                continue

            if args.strip_frontmatter:
                text = strip_yaml_frontmatter(text)

            if args.include_filenames:
                out.write(f"\n---\n\n## File: {path.relative_to(docs_dir)}\n\n")
            else:
                out.write("\n---\n\n")

            out.write(text.rstrip() + "\n")
            wrote_any = True

    if wrote_any:
        print(f"Wrote combined docs to {out_path}")
    else:
        print("No docs files found to combine.")


if __name__ == '__main__':
    main()
