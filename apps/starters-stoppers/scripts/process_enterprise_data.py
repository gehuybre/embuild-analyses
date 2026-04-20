from __future__ import annotations

import json
import os
import re
import sqlite3
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
BASE_EXPORT_FILE = DATA_DIR / "export-10.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DOWNLOAD_URL_TEMPLATE = "https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.zip"
DEFAULT_INPUT_URL = DOWNLOAD_URL_TEMPLATE.format(year=2024)
ENTERPRISE_REFERENCE_URL = "https://wiki.statbel.fgov.be/wiki/OpenData_Q21733_nl"
LOOKBACK_YEARS = 20

PROVINCE_TO_REGION = {
    "10000": "2000",
    "70000": "2000",
    "40000": "2000",
    "20001": "2000",
    "30000": "2000",
    "20002": "3000",
    "50000": "3000",
    "60000": "3000",
    "80000": "3000",
    "90000": "3000",
    "21000": "4000",
}

REGION_LABEL_TO_CODE = {
    None: "1000",
    "Vlaams Gewest": "2000",
    "Waals Gewest": "3000",
    "Brussels Hoofdstedelijk Gewest": "4000",
}

WORKER_CLASS_LABEL_TO_CODE = {
    "Geen werknemer": "00",
    "1-4 werknemers": "01",
    "5-9 werknemers": "02",
    "10-19 werknemers": "03",
    "20-49 werknemers": "04",
    "50-99 werknemers": "05",
    "100-199 werknemers": "06",
    "200-249 werknemers": "07",
    "250-499 werknemers": "08",
    "500-999 werknemers": "09",
    "1000-1999 werknemers": "10",
    "2000-2999 werknemers": "11",
    "3000-3999 werknemers": "12",
    "4000-4999 werknemers": "13",
    "5000-9999 werknemers": "14",
    "+ 10000 werknemers": "15",
}

DISCOVERED_NOTE = "De sectie ondernemingen gebruikt het meest recente Statbel-jaarbestand per werknemersklasse dat via de maandelijkse GitHub Action wordt gecontroleerd."


def parse_year_from_text(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(20\d{2})", value)
    if not match:
        return None
    return int(match.group(1))


def url_exists(url: str) -> bool:
    try:
        response = requests.head(url, allow_redirects=True, timeout=30)
        if response.status_code == 200:
            return True
        if response.status_code in {403, 405}:
            with requests.get(url, stream=True, timeout=30) as fallback:
                return fallback.status_code == 200
        return False
    except requests.RequestException:
        return False


def candidate_urls_for_year(year: int) -> list[str]:
    if year >= 2024:
        return [
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.zip",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.xlsx",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_SQ_{year}.zip",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/VF_VAT_NACE_EMPL_{year}.zip",
        ]
    if year == 2023:
        return [
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.xlsx",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.zip",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_SQ_{year}.zip",
        ]
    if year == 2019:
        return [
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/VF_VAT_NACE_EMPL_{year}.zip",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_SQ_{year}.zip",
            f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.zip",
        ]
    return [
        f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_SQ_{year}.zip",
        f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/VF_VAT_NACE_EMPL_{year}.zip",
        f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.xlsx",
        f"https://statbel.fgov.be/sites/default/files/files/opendata/btw-plichtige/werknemersklasse/TF_VAT_NACE_EMPL_{year}.zip",
    ]


def discover_available_inputs() -> list[tuple[str, int]]:
    current_year = datetime.now(timezone.utc).year
    matches: list[tuple[str, int]] = []
    for year in range(current_year, current_year - LOOKBACK_YEARS - 1, -1):
        for candidate in candidate_urls_for_year(year):
            if url_exists(candidate):
                matches.append((candidate, year))
                break
    if matches:
        return matches
    return [(DEFAULT_INPUT_URL, 2024)]


def download_input_file(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    handle.write(chunk)
    return destination


def extract_txt_from_zip(zip_path: Path, extract_dir: Path) -> Path:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as archive:
        txt_members = [member for member in archive.namelist() if member.lower().endswith(".txt")]
        if not txt_members:
            raise RuntimeError("No TXT file found in enterprise ZIP")
        chosen = txt_members[0]
        archive.extract(chosen, extract_dir)
        return extract_dir / Path(chosen).name


def extract_supported_member(zip_path: Path, extract_dir: Path) -> Path:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as archive:
        members = archive.namelist()
        for suffix in (".txt", ".sqlite", ".xlsx"):
            candidates = [member for member in members if member.lower().endswith(suffix)]
            if candidates:
                chosen = candidates[0]
                archive.extract(chosen, extract_dir)
                return extract_dir / Path(chosen).name
    raise RuntimeError("No supported data file found in enterprise archive")


def parse_sector_label(value: Any) -> tuple[str | None, str | None]:
    if value is None or pd.isna(value):
        return None, None

    text = str(value).strip()
    if not text:
        return None, None
    if text == "Onbekende economische activiteit":
        return "X", text

    match = re.match(r"^([A-Z])\s+(.+)$", text)
    if not match:
        return None, text

    return match.group(1), match.group(2).strip()


def normalize_arrondissement(code: Any) -> str | None:
    if code is None or pd.isna(code):
        return None

    text = str(code).strip()
    if len(text) != 5 or not text.isdigit():
        return None
    return text


def arrondissement_to_province(code: str | None) -> str | None:
    if not code:
        return None
    if code == "21000":
        return "21000"

    prefix2 = code[:2]
    first = code[0]

    if prefix2 in {"23", "24"}:
        return "20001"
    if prefix2 == "25":
        return "20002"

    return {
        "1": "10000",
        "3": "30000",
        "4": "40000",
        "5": "50000",
        "6": "60000",
        "7": "70000",
        "8": "80000",
        "9": "90000",
    }.get(first)


def read_existing_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def build_lookup(df: pd.DataFrame, code_col: str, label_col: str) -> list[dict[str, str]]:
    subset = (
        df[[code_col, label_col]]
        .dropna(subset=[code_col, label_col])
        .drop_duplicates()
        .sort_values(code_col, kind="stable")
    )
    records: list[dict[str, str]] = []
    for _, row in subset.iterrows():
        code = str(row[code_col]).strip()
        label = str(row[label_col]).strip()
        if not code or not label:
            continue
        records.append({"code": code, "nl": label})
    return records


def load_base_export_records() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not BASE_EXPORT_FILE.exists():
        return pd.DataFrame(columns=["y", "g", "n1", "w", "vat"]), pd.DataFrame()

    payload = json.loads(BASE_EXPORT_FILE.read_text(encoding="utf-8"))
    facts = payload.get("facts") if isinstance(payload, dict) else None
    if not isinstance(facts, list):
        return pd.DataFrame(columns=["y", "g", "n1", "w", "vat"]), pd.DataFrame()

    frame = pd.DataFrame(facts)
    if frame.empty:
        return pd.DataFrame(columns=["y", "g", "n1", "w", "vat"]), pd.DataFrame()

    frame["y"] = pd.to_numeric(frame["Jaar"], errors="coerce").astype("Int64")
    frame["g"] = frame["Gewest"].map(REGION_LABEL_TO_CODE)
    frame["n1"] = frame["Sectie"].map(lambda value: "ALL" if value is None or pd.isna(value) else parse_sector_label(value)[0])
    frame["n1_label"] = frame["Sectie"].map(
        lambda value: "Alle activiteiten" if value is None or pd.isna(value) else parse_sector_label(value)[1]
    )
    frame["w"] = frame["NIS werknemersklasse"].map(WORKER_CLASS_LABEL_TO_CODE)
    frame["w_label"] = frame["NIS werknemersklasse"]
    frame["vat"] = pd.to_numeric(frame["Aantal btw-plichtige"], errors="coerce")

    filtered = frame[
        frame["y"].notna()
        & frame["g"].notna()
        & frame["w"].notna()
        & frame["n1"].notna()
        & frame["vat"].notna()
    ].copy()

    records = filtered[["y", "g", "n1", "w", "vat"]].copy()
    records["y"] = records["y"].astype(int)
    records["vat"] = records["vat"].round().astype(int)

    return records, filtered


def build_enterprise_records(frame: pd.DataFrame, dataset_year: int) -> pd.DataFrame:
    frame["arr"] = frame["CD_ADM_DSTR_REFNIS"].map(normalize_arrondissement)
    frame["p"] = frame["arr"].map(arrondissement_to_province)
    frame["g"] = frame["p"].map(PROVINCE_TO_REGION)
    frame = frame[frame["g"].notna()].copy()

    parsed_sector = frame["TX_NACE_NL_LVL1"].map(parse_sector_label)
    frame["n1"] = parsed_sector.map(lambda item: item[0])
    frame["n1_label"] = parsed_sector.map(lambda item: item[1])
    frame["w"] = frame["CD_NIS_STAT_UNT_CLS"].astype(str).str.strip().str.zfill(2)
    frame["w_label"] = frame["TX_NIS_STAT_UNT_CLS_NL_LVL1"].astype(str).str.strip()
    frame["vat"] = pd.to_numeric(frame["MS_NUM_VAT"], errors="coerce").fillna(0).astype(int)

    frame = frame[frame["n1"].notna() & frame["w"].ne("")].copy()

    regional = (
        frame.groupby(["g", "n1", "w"], dropna=False)["vat"]
        .sum()
        .reset_index()
    )
    regional["y"] = dataset_year

    regional_totals = (
        frame.groupby(["g", "w"], dropna=False)["vat"]
        .sum()
        .reset_index()
    )
    regional_totals["n1"] = "ALL"
    regional_totals["y"] = dataset_year

    belgium = (
        frame.groupby(["n1", "w"], dropna=False)["vat"]
        .sum()
        .reset_index()
    )
    belgium["g"] = "1000"
    belgium["y"] = dataset_year

    belgium_totals = (
        frame.groupby(["w"], dropna=False)["vat"]
        .sum()
        .reset_index()
    )
    belgium_totals["g"] = "1000"
    belgium_totals["n1"] = "ALL"
    belgium_totals["y"] = dataset_year

    return pd.concat([regional, regional_totals, belgium, belgium_totals], ignore_index=True)


def read_enterprise_txt(path: Path) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(
                path,
                sep="|",
                encoding=encoding,
                dtype=str,
                low_memory=False,
            )
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("utf-8", b"", 0, 1, f"Unsupported encoding for {path}")


def read_enterprise_sqlite(path: Path) -> pd.DataFrame:
    connection = sqlite3.connect(path)
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type IN ('table', 'view') AND name LIKE 'VF_VAT_NACE_EMPL_%'
            ORDER BY name DESC
            LIMIT 1
            """
        )
        row = cursor.fetchone()
        if not row:
            raise RuntimeError(f"Could not resolve enterprise view in {path.name}")
        return pd.read_sql_query(f"SELECT * FROM {row[0]}", connection)
    finally:
        connection.close()


def read_enterprise_xlsx(path: Path) -> pd.DataFrame:
    workbook = pd.ExcelFile(path)
    sheet_name = next((name for name in workbook.sheet_names if "VAT_NACE_EMPL" in name), workbook.sheet_names[0])
    return pd.read_excel(path, sheet_name=sheet_name, dtype=str)


def read_enterprise_source(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return read_enterprise_txt(path)
    if suffix == ".sqlite":
        return read_enterprise_sqlite(path)
    if suffix == ".xlsx":
        return read_enterprise_xlsx(path)
    raise RuntimeError(f"Unsupported enterprise source format: {path.name}")


def process_data() -> None:
    input_file_path = os.environ.get("INPUT_FILE_PATH")
    input_url = os.environ.get("INPUT_URL")
    dataset_year = parse_year_from_text(os.environ.get("DATASET_YEAR"))
    base_records, base_lookup_frame = load_base_export_records()
    records_by_year: list[pd.DataFrame] = [base_records] if not base_records.empty else []
    source_urls: list[str] = []
    lookup_frames: list[pd.DataFrame] = [base_lookup_frame] if not base_lookup_frame.empty else []
    base_years = set(base_records["y"].astype(int).tolist()) if not base_records.empty else set()

    if input_file_path:
        source_path = Path(input_file_path)
        if not source_path.exists():
            raise FileNotFoundError(f"INPUT_FILE_PATH points to missing file: {source_path}")
        resolved_url = input_url or DEFAULT_INPUT_URL
        dataset_year = dataset_year or parse_year_from_text(source_path.name) or parse_year_from_text(resolved_url) or 2024
        inputs = [(source_path, resolved_url, dataset_year)]
    elif input_url:
        resolved_year = dataset_year or parse_year_from_text(input_url) or 2024
        zip_path = DATA_DIR / Path(input_url).name
        download_input_file(input_url, zip_path)
        inputs = [(zip_path, input_url, resolved_year)]
    else:
        discovered_inputs = discover_available_inputs()
        inputs = []
        for discovered_url, discovered_year in discovered_inputs:
            if discovered_year in base_years:
                continue
            source_file = DATA_DIR / Path(discovered_url).name
            download_input_file(discovered_url, source_file)
            inputs.append((source_file, discovered_url, discovered_year))

    for source_file, resolved_url, current_year in inputs:
        if source_file.suffix.lower() == ".zip":
            try:
                source_path = extract_supported_member(source_file, DATA_DIR / str(current_year))
            except RuntimeError as exc:
                if "No supported data file found" in str(exc):
                    continue
                raise
        else:
            source_path = source_file
        frame = read_enterprise_source(source_path)
        records_by_year.append(build_enterprise_records(frame.copy(), current_year))
        lookup_frames.append(frame)
        source_urls.append(resolved_url)

    if not records_by_year:
        raise RuntimeError("No enterprise datasets could be processed")

    combined = pd.concat(records_by_year, ignore_index=True)
    combined = combined[["y", "g", "n1", "w", "vat"]].sort_values(["y", "g", "n1", "w"], kind="stable")
    lookup_frame = pd.concat(lookup_frames, ignore_index=True)
    available_years = sorted({int(value["y"]) for value in json.loads(combined[["y"]].drop_duplicates().to_json(orient="records"))})
    latest_year = max(available_years)

    records = json.loads(combined.to_json(orient="records"))
    sector_lookup_frame = lookup_frame
    if "n1" not in sector_lookup_frame.columns:
        sector_lookup_frame = sector_lookup_frame.assign(
            n1=sector_lookup_frame["TX_NACE_NL_LVL1"].map(lambda value: parse_sector_label(value)[0]),
            n1_label=sector_lookup_frame["TX_NACE_NL_LVL1"].map(lambda value: parse_sector_label(value)[1]),
        )
    worker_lookup_frame = lookup_frame
    if "w" not in worker_lookup_frame.columns:
        worker_lookup_frame = worker_lookup_frame.assign(
            w=worker_lookup_frame["CD_NIS_STAT_UNT_CLS"].astype(str).str.strip().str.zfill(2),
            w_label=worker_lookup_frame["TX_NIS_STAT_UNT_CLS_NL_LVL1"].astype(str).str.strip(),
        )
    lookups = {
        "latestYear": latest_year,
        "years": available_years,
        "sourceUrl": source_urls[0] if source_urls else ENTERPRISE_REFERENCE_URL,
        "sourceUrls": source_urls,
        "sectors": build_lookup(sector_lookup_frame, "n1", "n1_label"),
        "workerClasses": build_lookup(worker_lookup_frame, "w", "w_label"),
    }

    (RESULTS_DIR / "vat_enterprises_worker_class.json").write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (RESULTS_DIR / "vat_enterprises_lookups.json").write_text(
        json.dumps(lookups, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    summary = read_existing_json(SUMMARY_FILE)
    notes = list(summary.get("notes") or [])
    if DISCOVERED_NOTE not in notes:
        notes.append(DISCOVERED_NOTE)
    summary["notes"] = notes
    summary["enterpriseCounts"] = {
        "latestYear": latest_year,
        "availableYears": available_years,
        "sourceUrl": source_urls[0] if source_urls else ENTERPRISE_REFERENCE_URL,
        "sourceUrls": source_urls,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    SUMMARY_FILE.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    remote_metadata = read_existing_json(REMOTE_METADATA_FILE)
    remote_metadata["enterprise_counts"] = {
        "latest_year": latest_year,
        "available_years": available_years,
        "source_url": source_urls[0] if source_urls else ENTERPRISE_REFERENCE_URL,
        "source_urls": source_urls,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    REMOTE_METADATA_FILE.write_text(
        json.dumps(remote_metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    process_data()
