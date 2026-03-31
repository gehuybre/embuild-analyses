#!/usr/bin/env python3
import argparse
import os
import re
import sys
from typing import List, Set


SECTION_ID_RE = re.compile(r"sectionId\s*=\s*(?:\{)?[\"']([^\"']+)[\"']")


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def extract_section_ids(components_dir: str) -> Set[str]:
    ids: Set[str] = set()
    if not os.path.isdir(components_dir):
        return ids
    for entry in os.listdir(components_dir):
        if not entry.endswith(".tsx"):
            continue
        path = os.path.join(components_dir, entry)
        text = read_file(path)
        for match in SECTION_ID_RE.finditer(text):
            ids.add(match.group(1))
    return ids


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    text = re.sub(r"//.*", "", text)
    return text


def extract_sections_block(text: str, slug: str) -> str:
    slug_re = re.compile(rf"slug\\s*:\\s*['\"]{re.escape(slug)}['\"]")
    match = slug_re.search(text)
    if not match:
        return ""
    sections_idx = text.find("sections", match.end())
    if sections_idx == -1:
        return ""
    brace_start = text.find("{", sections_idx)
    if brace_start == -1:
        return ""

    depth = 0
    for idx in range(brace_start, len(text)):
        char = text[idx]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[brace_start + 1 : idx]
    return ""


def extract_top_level_keys(block: str) -> List[str]:
    keys: List[str] = []
    i = 0
    depth = 0
    length = len(block)
    while i < length:
        char = block[i]
        if char == "{":
            depth += 1
            i += 1
            continue
        if char == "}":
            depth -= 1
            i += 1
            continue
        if depth != 0:
            i += 1
            continue
        if char.isspace() or char in ",\n\r\t":
            i += 1
            continue
        if char in "\"'":
            quote = char
            i += 1
            start = i
            while i < length and block[i] != quote:
                if block[i] == "\\":
                    i += 2
                else:
                    i += 1
            key = block[start:i]
            i += 1
        else:
            start = i
            while i < length and re.match(r"[A-Za-z0-9_-]", block[i]):
                i += 1
            key = block[start:i]

        while i < length and block[i].isspace():
            i += 1
        if i < length and block[i] == ":" and key:
            keys.append(key)
        i += 1
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description="Check embed-config entries for section IDs.")
    parser.add_argument("--slug", required=True, help="Analysis slug.")
    parser.add_argument(
        "--embed-config",
        default=os.path.join("embuild-analyses", "src", "lib", "embed-config.ts"),
        help="Path to embed-config.ts.",
    )
    parser.add_argument(
        "--components-dir",
        default=None,
        help="Components directory (defaults to embuild-analyses/src/components/analyses/<slug>).",
    )
    args = parser.parse_args()

    components_dir = args.components_dir or os.path.join(
        "embuild-analyses", "src", "components", "analyses", args.slug
    )
    embed_text = read_file(args.embed_config)
    embed_text = strip_comments(embed_text)
    sections_block = extract_sections_block(embed_text, args.slug)

    if not sections_block:
        print(f"ERROR: No embed-config entry found for slug '{args.slug}'.", file=sys.stderr)
        return 1

    embed_sections = set(extract_top_level_keys(sections_block))
    component_sections = extract_section_ids(components_dir)

    if not component_sections:
        print("WARNING: No sectionId values found in components; skipping validation.")
        return 0

    missing = sorted(section for section in component_sections if section not in embed_sections)
    if missing:
        print("ERROR: Missing embed-config entries for sectionId(s):", file=sys.stderr)
        for section in missing:
            print(f"ERROR: {section}", file=sys.stderr)
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
