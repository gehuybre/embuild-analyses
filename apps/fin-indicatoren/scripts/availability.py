"""Bepaal het 'data beschikbaar tot'-label van de blog uit de drie bronnen.

Schrijft `data_availability_label` in public/data/metadata.json; scripts/update_analysis_data_status.py
neemt dat label over in page.tsx.
"""

from __future__ import annotations

import json
from pathlib import Path

PUBLIC_DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"


def _read(name: str) -> dict:
    path = PUBLIC_DATA_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def build_label() -> str | None:
    metadata = _read("metadata.json")
    eurostat = _read("eurostat-sbs.json")
    marktwerking = _read("marktwerking.json")
    parts = []
    if eurostat.get("bouw", {}).get("years"):
        parts.append(f"{max(eurostat['bouw']['years'])} voor Eurostat")
    if marktwerking.get("marginYears"):
        parts.append(f"{max(marktwerking['marginYears'])} voor FOD Economie")
    if metadata.get("latest_year"):
        parts.append(f"{metadata['latest_year']} voor de NBB")
    if not parts:
        return None
    return ", ".join(parts[:-1]) + " en " + parts[-1] if len(parts) > 1 else parts[0]


def refresh_availability_label() -> None:
    label = build_label()
    if not label:
        return
    path = PUBLIC_DATA_DIR / "metadata.json"
    metadata = _read("metadata.json")
    metadata["data_availability_label"] = label
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
