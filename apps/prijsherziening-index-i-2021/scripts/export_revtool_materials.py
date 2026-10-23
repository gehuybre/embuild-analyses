"""Export monthly Revtool material snapshots for the optional calculator basket."""

import argparse
import csv
import json
import math
import re
from datetime import date
from hashlib import sha256
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
OW_START = "2023-12-01"
SOURCE_PAGE = "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen"
GRYMAFER_SOURCE = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vRuVl6lT8nJLp--S9KU_-o14zF5BzoAf8HHwhTpDM7tkjkhuPoOKTmK4xACKXc6BfbRadMLB5Fa_NEk/pub"
    "?gid=1883993854&single=true&output=csv"
)


def build_materials(rows: list[dict], manifest: dict) -> dict:
    match = re.fullmatch(r"revtool-nl-versie-(\d{4}-\d{2}-\d{2})\.xlsm", manifest["source"])
    if not match:
        raise ValueError("A dated Revtool source filename is required to exclude future values")
    snapshot_date = date.fromisoformat(match[1]).isoformat()
    groups = {}
    seen = set()
    skipped = {}
    for row in rows:
        ow = re.match(r"OW (\d+) - ", row["series"])
        is_ow = row["sheet"] == "Materiaalindexen o.w." and ow is not None
        is_grymafer = row["sheet"] == "Grymafer indexen" and row["table"] == "Grymafer_maand"
        if not (is_ow or is_grymafer):
            continue
        identifier = f"ow:{ow[1]}" if is_ow else f"grymafer:{row['series'].split(' - ')[0]}"
        observation_date = date.fromisoformat(row["date"])
        if observation_date.day != 1:
            raise ValueError(f"Non-monthly observation in {identifier}: {row['date']}")
        unique = (identifier, row["date"])
        if unique in seen:
            raise ValueError(f"Duplicate material observation: {unique}")
        seen.add(unique)
        if (is_ow and row["date"] < OW_START) or row["date"] > snapshot_date:
            reason = "outside_supported_period"
        elif row["status"] != "numeric":
            reason = row["status"]
        else:
            reason = None
        if reason:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        value = float(row["value"])
        if not math.isfinite(value) or value <= 0:
            raise ValueError(f"Invalid material value in {identifier}: {row['date']}")
        entry = groups.setdefault(identifier, {
            "id": identifier,
            "label": " ".join(row["series"].split()),
            "group": "O.W. bouwmaterialen" if is_ow else "Grymafer (maand)",
            "source_url": SOURCE_PAGE if is_ow else GRYMAFER_SOURCE,
            "sheet": row["sheet"],
            "table": row["table"],
            "note": (
                "Revtool-momentopname; O.W. alleen vanaf december 2023 wegens de "
                "publicatiewijziging. Geen automatische koppeling aan oudere reeksen."
                if is_ow else
                "Revtool-momentopname van de maandreeks; geen weekprijzen of live update."
            ),
            "observations": [],
        })
        if entry["table"] != row["table"] or entry["label"] != " ".join(row["series"].split()):
            raise ValueError(f"Conflicting definitions for material {identifier}")
        entry["observations"].append({"date": row["date"], "value": value, "cell": row["cell"]})
    if not any(key.startswith("ow:") for key in groups) or not any(key.startswith("grymafer:") for key in groups):
        raise ValueError("Expected both O.W. and monthly Grymafer series; check the workbook schema")
    for entry in groups.values():
        entry["observations"].sort(key=lambda row: row["date"])
    return {
        "source_workbook": manifest["source"],
        "source_sha256": manifest["sha256"],
        "snapshot_date": snapshot_date,
        "status": "saved_workbook_snapshot",
        "note": (
            "Opgeslagen Revtool-waarden, niet onafhankelijk als actuele publicaties bevestigd. "
            "Geen lonen, prognoses, weekreeksen of nulwaarden. Ontbrekende maanden worden niet aangevuld."
        ),
        "skipped_observations": skipped,
        "series": sorted(groups.values(), key=lambda row: row["id"]),
    }


def export(extraction: Path, output: Path) -> dict:
    manifest = json.loads((extraction / "manifest.json").read_text(encoding="utf-8"))
    source = extraction / "index_series.csv"
    expected = next(item["sha256"] for item in manifest["artifacts"] if item["file"] == source.name)
    digest = sha256(source.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError("index_series.csv no longer matches its extraction manifest")
    with source.open(encoding="utf-8", newline="") as handle:
        payload = build_materials(list(csv.DictReader(handle)), manifest)
    payload["extraction_sha256"] = digest
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", type=Path, help="Directory containing the extraction manifest and CSV")
    parser.add_argument("--output", type=Path, default=APP / "public/data/revtool_materials.json")
    args = parser.parse_args()
    extraction = args.extraction
    if extraction is None:
        manifests = sorted((APP / "data/revtool-extracted").glob("revtool-nl-versie-*/manifest.json"))
        if not manifests:
            raise FileNotFoundError("No versioned extraction found; run extract_revtool.py first")
        extraction = manifests[-1].parent
    payload = export(extraction, args.output)
    print(f"Exported {len(payload['series'])} monthly material series from {payload['source_workbook']}")
    print(f"Skipped observations: {payload['skipped_observations']}")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
