"""Archive files from the municipal-investments inbox under a YYYY-MM version."""

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / "data" / "gemeentelijke-investeringen"
INBOX = DATA_ROOT / "inbox"
VERSION_IGNORE = "*\n!.gitignore\n!manifest.json\n!raw/\n"
RAW_IGNORE = "*\n!.gitignore\n"


def file_record(path: Path) -> dict[str, str | int]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"sha256": digest, "size_bytes": path.stat().st_size}


def archive(version: str, source_dir: Path | None = None) -> None:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", version):
        raise ValueError("Version must use YYYY-MM format, for example 2026-10.")

    source_dir = source_dir or INBOX
    if not source_dir.is_dir():
        raise NotADirectoryError(f"Source directory does not exist: {source_dir}")
    sources = sorted(
        path for path in source_dir.iterdir()
        if path.is_file()
        and not path.name.startswith(".")
        and not path.name.startswith("~$")
        and path.name != "README.md"
    )
    if not sources:
        raise FileNotFoundError(f"No source files found in {source_dir}")

    version_dir = DATA_ROOT / "versions" / version
    raw_dir = version_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for ignore_file, contents in (
        (version_dir / ".gitignore", VERSION_IGNORE),
        (raw_dir / ".gitignore", RAW_IGNORE),
    ):
        if not ignore_file.exists():
            ignore_file.write_text(contents, encoding="utf-8")
    manifest_path = version_dir / "manifest.json"
    manifest = {
        "version": version,
        "metadata": {
            "export_date": None,
            "source": None,
            "filters": [],
            "notes": None,
        },
        "files": {},
    }
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("version") != version or not isinstance(manifest.get("files"), dict):
            raise ValueError(f"Invalid manifest: {manifest_path}")
        manifest.setdefault(
            "metadata",
            {"export_date": None, "source": None, "filters": [], "notes": None},
        )

    for source in sources:
        destination = raw_dir / source.name
        source_record = file_record(source)
        if destination.exists():
            if file_record(destination) != source_record:
                raise FileExistsError(
                    f"{destination} already exists with different contents; "
                    "rename the new export before archiving it."
                )
        else:
            shutil.copy2(source, destination)
        manifest["files"][source.name] = source_record

    manifest["archived_at_utc"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Archived {len(sources)} file(s) for {version} in {raw_dir}")
    print(f"Manifest: {manifest_path}")
    if source_dir == INBOX:
        print("Inbox files were kept; clear the inbox manually after checking the archive.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Version date in YYYY-MM format")
    parser.add_argument("--source-dir", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    archive(args.version, args.source_dir.resolve() if args.source_dir else None)


if __name__ == "__main__":
    main()
