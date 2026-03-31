#!/usr/bin/env python3
import argparse
import os
import re
import sys


SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight checks for analysis slug and structure.")
    parser.add_argument("--slug", required=True, help="Analysis slug (kebab-case).")
    parser.add_argument(
        "--base-dir",
        default="embuild-analyses/analyses",
        help="Base analyses directory.",
    )
    args = parser.parse_args()

    errors = []
    warnings = []

    if not SLUG_RE.match(args.slug):
        errors.append(f"Invalid slug format: '{args.slug}' (expected kebab-case).")

    analysis_dir = os.path.join(args.base_dir, args.slug)
    if not os.path.isdir(analysis_dir):
        errors.append(f"Missing analysis directory: {analysis_dir}")
    else:
        for required in ["data", "results", "src"]:
            path = os.path.join(analysis_dir, required)
            if not os.path.isdir(path):
                errors.append(f"Missing required directory: {path}")

        mdx_path = os.path.join(analysis_dir, "content.mdx")
        if not os.path.isfile(mdx_path):
            errors.append(f"Missing required file: {mdx_path}")

        readme_path = os.path.join(analysis_dir, "data", "README.md")
        if not os.path.isfile(readme_path):
            warnings.append(f"Missing data README: {readme_path}")

    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        for warn in warnings:
            print(f"WARNING: {warn}", file=sys.stderr)
        return 1

    for warn in warnings:
        print(f"WARNING: {warn}")
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
