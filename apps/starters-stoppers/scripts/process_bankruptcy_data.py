"""Faillissementen (Statbel TF_BANKRUPTCIES) in dezelfde geografische structuur als de rest van starters-stoppers.

Bron: https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen/maandelijkse-faillissementen
Het ruwe bestand bevat gemeente, arrondissement, provincie en gewest. Brussel heeft geen provincie (CD_PROV_REFNIS leeg)
en wordt als gewest 4000 bewaard, zoals de rest van de app.

Uitvoer (public/data):
  bankruptcies_monthly.json     maandcijfers per geo (1000/gewest/provincie) en sector, incl. sector "ALL"
  bankruptcies_breakdown.json   jaarcijfers per geo en sector, uitgesplitst naar leeftijd van de onderneming en werknemersklasse
  bankruptcies_lookups.json     labels en volgorde van de uitsplitsingen, laatste maand
"""

from __future__ import annotations

import io
import json
import os
import zipfile
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
SIBLING_DATA_DIR = APP_DIR.parent / "faillissementen" / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://statbel.fgov.be/sites/default/files/files/opendata/BRI_Nace"
STATIC_URL = f"{BASE_URL}/TF_BANKRUPTCIES.zip"
PUBLICATION_URL = "https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen/maandelijkse-faillissementen"
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; data-blog-u/1.0)", "Accept": "application/zip,*/*;q=0.8"}

BELGIUM = "1000"
UNKNOWN_SECTOR = "X"  # de rest van de app gebruikt X voor "onbekende activiteit"; Statbel levert hier geen waarde


def find_local_zip() -> Path | None:
    candidates = [*DATA_DIR.glob("TF_BANKRUPTCIES*.zip"), *SIBLING_DATA_DIR.glob("TF_BANKRUPTCIES*.zip")]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


def read_zip(content: bytes | Path) -> pd.DataFrame:
    handle = zipfile.ZipFile(io.BytesIO(content) if isinstance(content, bytes) else content)
    with handle as archive:
        members = [name for name in archive.namelist() if name.lower().endswith((".txt", ".csv"))]
        if not members:
            raise RuntimeError(f"Geen txt/csv in archief: {archive.namelist()}")
        with archive.open(members[0]) as file:
            return pd.read_csv(file, sep="|", encoding="utf-8-sig", low_memory=False)


def load_source() -> pd.DataFrame:
    override = os.environ.get("BANKRUPTCIES_INPUT_PATH")
    if override and Path(override).exists():
        return read_zip(Path(override))

    # In CI: INPUT_URL komt van scripts/resolve_statbel_bankruptcies_url.py (nieuwste jaarbestand)
    url = os.environ.get("INPUT_URL")
    if url:
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=180)
        response.raise_for_status()
        (DATA_DIR / Path(url).name).write_bytes(response.content)
        return read_zip(response.content)

    local = find_local_zip()
    if local:
        return read_zip(local)

    response = requests.get(STATIC_URL, headers=REQUEST_HEADERS, timeout=180)
    response.raise_for_status()
    return read_zip(response.content)


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "y": df["CD_YEAR"].astype(int),
            "m": df["CD_MONTH"].astype(int),
            "n1": df["TX_NACE_REV2_SECTION"].fillna(UNKNOWN_SECTOR).astype(str).str.strip().replace({"": UNKNOWN_SECTOR, "?": UNKNOWN_SECTOR}),
            "region": df["CD_RGN_REFNIS"].astype(int).astype(str),
            "province": df["CD_PROV_REFNIS"].map(lambda value: None if pd.isna(value) else str(int(value))),
            "dur": df["CD_COMPANY_DURATION"].astype(int),
            "dur_label": df["TX_COMPANY_DURATION_NL"].astype(str).str.strip(),
            "cls": df["CD_EMPLOYMENT_CLASS"].astype(int),
            "cls_label": df["TX_EMPLOYMENT_CLASS_DESCR_NL"].astype(str).str.strip(),
            "n": df["MS_COUNTOF_BANKRUPTCIES"].astype(int),
            "w": df["MS_COUNTOF_WORKERS"].astype(int),
        }
    )
    return frame


def geo_levels(frame: pd.DataFrame) -> list[pd.DataFrame]:
    """Dezelfde cijfers op elk geografisch niveau: België, gewest en provincie (Brussel enkel als gewest)."""
    national = frame.assign(g=BELGIUM)
    regions = frame.assign(g=frame["region"])
    provinces = frame[frame["province"].notna()].assign(g=lambda f: f["province"])
    return [national, regions, provinces]


def aggregate(levels: list[pd.DataFrame], keys: list[str]) -> pd.DataFrame:
    """Som per sleutel, per sector en voor alle sectoren samen (n1 = ALL)."""
    parts: list[pd.DataFrame] = []
    for level in levels:
        by_sector = level.groupby([*keys, "g", "n1"], as_index=False)[["n", "w"]].sum()
        total = level.groupby([*keys, "g"], as_index=False)[["n", "w"]].sum().assign(n1="ALL")
        parts.extend([by_sector, total])
    return pd.concat(parts, ignore_index=True)


def to_records(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    ordered = frame.sort_values(columns, kind="stable")[[*columns, "n", "w"]]
    return json.loads(ordered.to_json(orient="records"))


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def main() -> None:
    frame = prepare(load_source())
    levels = geo_levels(frame)

    monthly = aggregate(levels, ["y", "m"])
    monthly_records = to_records(monthly, ["y", "m", "g", "n1"])

    breakdown_parts: list[pd.DataFrame] = []
    for dim, key in (("dur", "dur"), ("cls", "cls")):
        part = aggregate(levels, ["y", key]).rename(columns={key: "k"})
        part["d"] = dim
        breakdown_parts.append(part)
    breakdown = pd.concat(breakdown_parts, ignore_index=True)
    breakdown_records = to_records(breakdown, ["d", "k", "y", "g", "n1"])

    latest = frame.sort_values(["y", "m"]).iloc[-1]
    lookups = {
        "latestYear": int(latest["y"]),
        "latestMonth": int(latest["m"]),
        "latestPeriod": f"{int(latest['y'])}-{int(latest['m']):02d}",
        "minYear": int(frame["y"].min()),
        "durations": [
            {"code": int(code), "nl": label}
            for code, label in frame[["dur", "dur_label"]].drop_duplicates().sort_values("dur").itertuples(index=False)
        ],
        "classes": [
            {"code": int(code), "nl": label}
            for code, label in frame[["cls", "cls_label"]].drop_duplicates().sort_values("cls").itertuples(index=False)
        ],
        "sourceUrl": PUBLICATION_URL,
    }

    dump = lambda data: json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (RESULTS_DIR / "bankruptcies_monthly.json").write_text(dump(monthly_records), encoding="utf-8")
    (RESULTS_DIR / "bankruptcies_breakdown.json").write_text(dump(breakdown_records), encoding="utf-8")
    (RESULTS_DIR / "bankruptcies_lookups.json").write_text(dump(lookups), encoding="utf-8")

    now = datetime.now(timezone.utc).isoformat()
    summary = read_json(SUMMARY_FILE)
    summary["bankruptcies"] = {"latestPeriod": lookups["latestPeriod"], "minYear": lookups["minYear"], "sourceUrl": PUBLICATION_URL, "updatedAt": now}
    SUMMARY_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    remote = read_json(REMOTE_METADATA_FILE)
    remote["bankruptcies"] = {"latest_period": lookups["latestPeriod"], "source_url": PUBLICATION_URL, "updated_at": now}
    REMOTE_METADATA_FILE.write_text(json.dumps(remote, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Faillissementen: {len(monthly_records)} maandrijen, {len(breakdown_records)} uitsplitsingsrijen, laatste maand {lookups['latestPeriod']}")


if __name__ == "__main__":
    main()
