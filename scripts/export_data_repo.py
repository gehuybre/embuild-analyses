#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def iter_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


def iter_app_dirs(source_root: Path) -> list[Path]:
    apps_root = source_root / "apps"
    if not apps_root.exists():
        return []
    return sorted([path for path in apps_root.iterdir() if path.is_dir()])


def collect_public_assets(source_root: Path) -> list[tuple[Path, Path, str]]:
    items: list[tuple[Path, Path, str]] = []

    for app_dir in iter_app_dirs(source_root):
        slug = app_dir.name
        public_root = app_dir / "public"
        public_data = public_root / "data"
        public_maps = public_root / "maps"
        public_press = public_root / "press-references"

        for src in iter_files(public_data):
            rel = Path(slug) / src.relative_to(public_data)
            items.append((src, rel, "data"))
            items.append((src, rel, "docs/data"))

        for src in iter_files(public_maps):
            rel = src.relative_to(public_maps) if slug == "portal" else Path(slug) / src.relative_to(public_maps)
            items.append((src, rel, "maps"))
            items.append((src, rel, "docs/maps"))

        for src in iter_files(public_press):
            rel = Path(slug) / src.relative_to(public_press)
            items.append((src, rel, "press-references"))
            items.append((src, rel, "docs/press-references"))

    return items


def collect_analysis_results(source_root: Path) -> list[tuple[Path, Path, str]]:
    items: list[tuple[Path, Path, str]] = []
    for app_dir in iter_app_dirs(source_root):
        results_dir = app_dir / "results"
        for src in iter_files(results_dir):
            rel = Path(app_dir.name) / "results" / src.relative_to(results_dir)
            items.append((src, rel, "analyses"))
            items.append((src, rel, "docs/analyses"))
    return items


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def copy_items(items: list[tuple[Path, Path, str]], dest_root: Path, dry_run: bool) -> set[Path]:
    expected: set[Path] = set()
    for src, rel, dest_prefix in items:
        dest = dest_root / dest_prefix / rel
        expected.add(dest)
        if dry_run:
            continue
        ensure_parent(dest)
        shutil.copy2(src, dest)
    return expected


def remove_stale(dest_root: Path, dest_prefix: str, expected: set[Path], dry_run: bool) -> None:
    base = dest_root / dest_prefix
    if not base.exists():
        return
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if path.name == ".gitkeep":
            continue
        if path not in expected:
            if dry_run:
                continue
            path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export runtime JSON outputs into the data repo for static hosting."
    )
    parser.add_argument(
        "--source-root",
        default=".",
        help="Path to the monorepo root containing apps/ (default: current directory)",
    )
    parser.add_argument(
        "--data-repo",
        default="../data",
        help="Path to the data repo (default: ../data)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove files in the data repo that are no longer produced",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended changes without copying",
    )

    args = parser.parse_args()
    source_root = Path(args.source_root).resolve()
    data_repo = Path(args.data_repo).resolve()

    if not source_root.exists():
        raise SystemExit(f"Source root not found: {source_root}")
    if not data_repo.exists():
        raise SystemExit(f"Data repo not found: {data_repo}")

    public_items = collect_public_assets(source_root)
    results_items = collect_analysis_results(source_root)

    expected_public = copy_items(public_items, data_repo, args.dry_run)
    expected_results = copy_items(results_items, data_repo, args.dry_run)

    if args.clean:
        remove_stale(data_repo, "data", expected_public, args.dry_run)
        remove_stale(data_repo, "maps", expected_public, args.dry_run)
        remove_stale(data_repo, "press-references", expected_public, args.dry_run)
        remove_stale(data_repo, "docs/data", expected_public, args.dry_run)
        remove_stale(data_repo, "docs/maps", expected_public, args.dry_run)
        remove_stale(data_repo, "docs/press-references", expected_public, args.dry_run)
        remove_stale(data_repo, "docs/analyses", expected_results, args.dry_run)
        remove_stale(data_repo, "public", expected_public, args.dry_run)
        remove_stale(data_repo, "analyses", expected_results, args.dry_run)

    print(f"Copied {len(public_items)} public files and {len(results_items)} result files.")
    if args.dry_run:
        print("Dry run: no files were written.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
