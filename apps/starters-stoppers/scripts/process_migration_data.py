"""Migratie van btw-plichtige ondernemingen tussen de gewesten (Statbel move_nl.xlsx).

Het werkboek bevat vier kruistabellen (jaar x oorspronkelijk gewest x bestemmingsgewest):
totaal, per werknemersklasse, per sector en per rechtsvorm. Het script combineert ze tot
één lang bestand en controleert dat elke uitsplitsing optelt tot het totaal.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "public" / "data"
SUMMARY_FILE = RESULTS_DIR / "summary.json"
REMOTE_METADATA_FILE = DATA_DIR / ".remote_metadata.json"
OUTPUT_FILE = RESULTS_DIR / "vat_migration.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_URL = (
    "https://statbel.fgov.be/sites/default/files/files/documents/Ondernemingen/"
    "7.4%20BTW-plichtige%20ondernemers/7.4.1%20Jaarevolutie/Migratie/move_nl.xlsx"
)
SOURCE_FILENAME = "move_nl.xlsx"
INPUT_ENV_VAR = "MIGRATION_INPUT_PATH"

REGION_CODES = {
    "Vlaams gewest": "2000",
    "Waals gewest": "3000",
    "Brussels Hoofdstedelijk gewest": "4000",
    "": "0000",  # oorspronkelijk gewest onbekend
}
DESTINATION_COLUMNS = {
    "Naar Vlaanderen": "2000",
    "Naar Wallonië": "3000",
    "Naar Brussel": "4000",
}

# Per tabblad: de uitsplitsingsdimensie en de kolom met de categorie.
SHEETS: list[tuple[str, str, str | None]] = [
    ("MOVE_REG", "tot", None),
    ("MOVE_REG_CLASSE", "cls", "CLASSE"),
    ("MOVE_REG_NACE", "nace", "Originele nace"),
    ("MOVE_REG_TYPE", "type", "Type onderneming"),
]

CLASS_LABELS = {
    "00": "Geen werknemers",
    "01": "1 - 49 werknemers",
    "02": "50 - 499 werknemers",
    "03": "500 - 1000 werknemers",
    "04": "Meer dan 1000 werknemers",
}
TYPE_CODES = {"Natuurlijke persoon": "NP", "Rechtspersoon": "RP"}
TYPE_LABELS = {"NP": "Natuurlijke persoon", "RP": "Rechtspersoon"}
UNKNOWN_SECTOR_LABEL = "Onbekende economische activiteit"


def resolve_source() -> Path:
    override = os.environ.get(INPUT_ENV_VAR)
    if override and Path(override).exists():
        return Path(override)

    destination = DATA_DIR / SOURCE_FILENAME
    with requests.get(SOURCE_URL, stream=True, timeout=180) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    handle.write(chunk)
    return destination


def parse_sector(label: str) -> tuple[str, str]:
    text = label.strip()
    if text == UNKNOWN_SECTOR_LABEL:
        return "X", text
    code, _, name = text.partition(" ")
    return code, name.strip()


def read_sheet(workbook: pd.ExcelFile, sheet: str) -> pd.DataFrame:
    frame = workbook.parse(sheet, dtype=str, keep_default_na=False)
    for column in DESTINATION_COLUMNS:
        # Lege cellen zijn nul: ze komen enkel voor bij de diagonaal (zelfde gewest) of bij geen verhuizingen.
        frame[column] = pd.to_numeric(frame[column].replace("", "0")).astype(int)
    frame["Originele regio"] = frame["Originele regio"].str.strip()
    unexpected = set(frame["Originele regio"]) - set(REGION_CODES)
    if unexpected:
        raise ValueError(f"Onverwachte regio's in {sheet}: {sorted(unexpected)}")
    frame["Jaar"] = frame["Jaar"].astype(int)
    return frame


def to_records(frame: pd.DataFrame, dim: str, category_column: str | None) -> tuple[list[dict[str, Any]], dict[str, str]]:
    labels: dict[str, str] = {}
    records: list[dict[str, Any]] = []

    for _, row in frame.iterrows():
        if dim == "tot":
            key = "ALL"
        elif dim == "cls":
            key = str(row[category_column]).strip()
            labels[key] = CLASS_LABELS[key]
        elif dim == "nace":
            key, name = parse_sector(str(row[category_column]))
            labels[key] = name
        else:
            key = TYPE_CODES[str(row[category_column]).strip()]
            labels[key] = TYPE_LABELS[key]

        origin = REGION_CODES[row["Originele regio"]]
        for column, destination in DESTINATION_COLUMNS.items():
            value = int(row[column])
            if value:
                records.append({"y": int(row["Jaar"]), "dim": dim, "k": key, "o": origin, "d": destination, "n": value})

    return records, labels


def validate_totals(frames: dict[str, pd.DataFrame]) -> None:
    """Elke uitsplitsing moet per jaar, herkomst en bestemming optellen tot het totaalblad."""
    keys = ["Jaar", "Originele regio"]
    destinations = list(DESTINATION_COLUMNS)
    base = frames["tot"].groupby(keys)[destinations].sum()
    for dim, frame in frames.items():
        if dim == "tot":
            continue
        grouped = frame.groupby(keys)[destinations].sum()
        difference = grouped.reindex(base.index, fill_value=0) - base
        if (difference != 0).any(axis=None):
            raise ValueError(f"Uitsplitsing '{dim}' telt niet op tot het totaal van Statbel")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def main() -> None:
    source = resolve_source()
    workbook = pd.ExcelFile(source)

    frames: dict[str, pd.DataFrame] = {}
    records: list[dict[str, Any]] = []
    lookups: dict[str, dict[str, str]] = {}

    for sheet, dim, category_column in SHEETS:
        frame = read_sheet(workbook, sheet)
        frames[dim] = frame
        sheet_records, labels = to_records(frame, dim, category_column)
        records.extend(sheet_records)
        lookups[dim] = labels

    validate_totals(frames)

    records.sort(key=lambda item: (item["dim"], item["k"], item["y"], item["o"], item["d"]))
    years = sorted({int(item["y"]) for item in records})
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "latestYear": max(years),
        "years": years,
        "sourceUrl": SOURCE_URL,
        "classes": [{"code": code, "nl": label} for code, label in sorted(lookups["cls"].items())],
        "sectors": [{"code": code, "nl": label} for code, label in sorted(lookups["nace"].items())],
        "types": [{"code": code, "nl": label} for code, label in sorted(lookups["type"].items())],
        "records": records,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    summary = read_json(SUMMARY_FILE)
    note = "Migratie tussen de gewesten komt uit het jaarlijkse Statbel-bestand move_nl.xlsx: het bestand telt enkel verhuizingen van de maatschappelijke zetel tussen de gewesten, niet binnen een gewest."
    notes = [item for item in summary.get("notes", []) if not item.startswith("Migratie tussen de gewesten")]
    summary["notes"] = [*notes, note]
    summary["migration"] = {"latestYear": max(years), "years": years, "sourceUrl": SOURCE_URL, "updatedAt": now}
    SUMMARY_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    remote_metadata = read_json(REMOTE_METADATA_FILE)
    remote_metadata["migration"] = {"latest_year": max(years), "source_url": SOURCE_URL, "updated_at": now}
    REMOTE_METADATA_FILE.write_text(json.dumps(remote_metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Migratie: {len(records)} records, {years[0]}-{years[-1]}")


if __name__ == "__main__":
    main()
