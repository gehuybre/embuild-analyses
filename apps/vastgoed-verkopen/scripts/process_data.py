"""
Vastgoed verkopen data processor.

Loads the Statbel real-estate open-data workbook or the formatted Statbel
publication downloads, prepares compact JSON/CSV artifacts for the dashboard,
and mirrors the generated files to:
- analyses/<slug>/results
- public/data/<slug>
- the split data repo (if present in the workspace)
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote, urlparse

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent

DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
CONTENT_FILE = BASE_DIR / "content.mdx"
REMOTE_METADATA_FILE = DATA_DIR / ".remote_metadata.json"

DATA_REPO_DIR: Path | None = None
DATA_REPO_RESULTS_DIRS: list[Path] = []
DATA_REPO_PUBLIC_DIRS: list[Path] = []

SOURCE_PAGE_URL = "https://statbel.fgov.be/nl/themas/bouwen-wonen/vastgoedprijzen"
OPEN_DATA_PAGE_URL = "https://statbel.fgov.be/nl/open-data/verkopen-vastgoed-volgens-aard-de-verkoopsakte-belgie"
DEFAULT_INPUT_URL = "https://statbel.fgov.be/sites/default/files/files/opendata/immo/vastgoed_2010_9999.xlsx"
DIRECT_MUNICIPALITY_XLSX_URL = (
    "https://statbel.fgov.be/sites/default/files/files/documents/"
    "Bouwen%20%26%20wonen/2.1%20Vastgoedprijzen/NM/NL_immo_statbel_kwartaal_per_gemeente.xlsx"
)
STATBEL_DOCUMENT_BASE_URL = (
    "https://statbel.fgov.be/sites/default/files/files/documents/"
    "Bouwen%20%26%20wonen/2.1%20Vastgoedprijzen/NM"
)
STATBEL_DOCUMENT_EXPORT_FILENAMES = (
    "NL_immo_statbel_jaar.xlsx",
    "NL_immo_statbel_kwartaal_Belgie.xlsx",
    "NL_immo_statbel_kwartaal_per_gewest.xlsx",
    "NL_immo_statbel_kwartaal_per_provincie.xlsx",
    "NL_immo_statbel_kwartaal_per_gemeente.xlsx",
)
DEFAULT_INPUT_FILENAME = Path(DEFAULT_INPUT_URL).name

TARGET_CHUNK_SIZE_MB = 3
BYTES_PER_MB = 1024 * 1024
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

# Property types mapping (short codes)
PROPERTY_TYPES = {
    "Huizen met 2 of 3 gevels (gesloten + halfopen bebouwing)": "huizen_23",
    "Huizen met 4 of meer gevels (open bebouwing)": "huizen_4plus",
    "Alle huizen met 2, 3, 4 of meer gevels (excl. appartementen)": "alle_huizen",
    "Appartementen": "appartementen",
}

# NIS code levels
# 1 = Belgium, 2 = Region, 3 = Province, 4 = Arrondissement, 5 = Municipality
LEVEL_BELGIUM = 1
LEVEL_REGION = 2
LEVEL_PROVINCE = 3
LEVEL_MUNICIPALITY = 5

TOTAL_SURFACE_LABEL = "totaal / total"
PRESENTATION_SHEET_LEVELS = {
    "belgie": LEVEL_BELGIUM,
    "belgië": LEVEL_BELGIUM,
    "per gewest": LEVEL_REGION,
    "per provincie": LEVEL_PROVINCE,
    "per gemeente": LEVEL_MUNICIPALITY,
}
PRESENTATION_METRIC_COLUMNS = {
    "aantal transacties": "MS_TOTAL_TRANSACTIONS",
    "mediaan prijs(€)": "MS_P_50_median",
    "eerste kwartiel prijs(€)": "MS_P_25",
    "derde kwartiel prijs(€)": "MS_P_75",
}
OPEN_DATA_REQUIRED_COLUMNS = (
    "CD_YEAR",
    "CD_TYPE_NL",
    "CD_REFNIS",
    "CD_REFNIS_NL",
    "CD_PERIOD",
    "CD_CLASS_SURFACE",
    "MS_TOTAL_TRANSACTIONS",
    "MS_P_25",
    "MS_P_50_median",
    "MS_P_75",
    "CD_niveau_refnis",
)


def unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    ordered: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        ordered.append(path)
    return ordered


RESULT_TARGET_DIRS = unique_paths(
    [RESULTS_DIR, *DATA_REPO_RESULTS_DIRS]
)
PUBLIC_TARGET_DIRS = unique_paths(
    [PUBLIC_DATA_DIR, *DATA_REPO_PUBLIC_DIRS]
)


def update_mdx_frontmatter_date(path: Path, date_str: str) -> bool:
    """Update the date field in MDX frontmatter."""
    if not path.exists():
        return False

    text = path.read_text(encoding="utf-8")
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")

    if not text.startswith("---"):
        return False

    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return False

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return False

    fm_lines = lines[1:end_idx]
    body_lines = lines[end_idx + 1 :]

    updated = False
    seen_date = False
    new_fm_lines = []
    for line in fm_lines:
        if re.match(r"^date:\s*.*$", line):
            if not seen_date:
                new_fm_lines.append(f"date: {date_str}{newline}")
                updated = True
                seen_date = True
            else:
                updated = True
        else:
            new_fm_lines.append(line)

    if not seen_date:
        inserted = False
        new2 = []
        for line in new_fm_lines:
            new2.append(line)
            if not inserted and re.match(r"^title:\s*.*$", line):
                new2.append(f"date: {date_str}{newline}")
                inserted = True
        if not inserted:
            new2.append(f"date: {date_str}{newline}")
        new_fm_lines = new2
        updated = True

    new_text = "".join([f"---{newline}", *new_fm_lines, f"---{newline}", *body_lines])
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    return updated


def clean_label(value: object) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()


def url_filename(url: str) -> str:
    parsed = urlparse(url)
    return Path(unquote(parsed.path)).name


def statbel_document_url(filename: str, base_url: str = STATBEL_DOCUMENT_BASE_URL) -> str:
    return f"{base_url.rstrip('/')}/{filename}"


def statbel_document_base_url(primary_url: str) -> str:
    parsed = urlparse(primary_url)
    if parsed.scheme and parsed.netloc:
        return primary_url.rsplit("/", 1)[0]
    return STATBEL_DOCUMENT_BASE_URL


def is_statbel_document_export_url(url: str) -> bool:
    return url_filename(url).startswith("NL_immo_statbel_")


def reset_generated_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def fetch_remote_headers(url: str) -> dict[str, str]:
    result = subprocess.run(
        [
            "curl",
            "-sSIL",
            "--fail",
            "--connect-timeout",
            "20",
            "--max-time",
            "60",
            "--retry",
            "3",
            "--retry-delay",
            "3",
            "-A",
            USER_AGENT,
            url,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    headers: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        if key in {"etag", "last-modified"}:
            headers[key] = value.strip()
    return headers


def write_remote_metadata(url: str, headers: dict[str, str], content: bytes) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "url": url,
        "etag": headers.get("etag"),
        "last_modified": headers.get("last-modified"),
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    REMOTE_METADATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def download_input_file(url: str, dest: Path, *, update_metadata: bool = True) -> Path:
    """Download an input file from the given URL."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cookie_file = dest.parent / ".statbel_cookies.txt"
    subprocess.run(
        [
            "curl",
            "-sSIL",
            "--fail",
            "--connect-timeout",
            "20",
            "--max-time",
            "60",
            "--retry",
            "3",
            "--retry-delay",
            "3",
            "-A",
            USER_AGENT,
            "-c",
            str(cookie_file),
            url,
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    subprocess.run(
        [
            "curl",
            "-sSL",
            "--fail",
            "--compressed",
            "--connect-timeout",
            "20",
            "--max-time",
            "180",
            "--retry",
            "3",
            "--retry-delay",
            "3",
            "-A",
            USER_AGENT,
            "-H",
            "Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
            "-b",
            str(cookie_file),
            "-c",
            str(cookie_file),
            "-o",
            str(dest),
            url,
        ],
        check=True,
        timeout=240,
    )
    content = dest.read_bytes()
    if not content:
        raise RuntimeError(f"Downloaded empty source file: {url}")
    if dest.suffix.lower() == ".xlsx" and not content.startswith(b"PK"):
        sample = content[:120].decode("utf-8", errors="replace")
        raise RuntimeError(f"Downloaded source is not an XLSX file: {url} ({sample!r})")
    if update_metadata:
        write_remote_metadata(url, fetch_remote_headers(url), content)
    return dest


def extract_txt_from_zip(zip_path: Path, extract_dir: Path) -> Path:
    """Extract the main TXT file from the ZIP archive."""
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as archive:
        candidates = [member for member in archive.namelist() if member.lower().endswith(".txt")]
        if not candidates:
            raise RuntimeError("No .txt file found in ZIP archive")
        chosen = candidates[0]
        archive.extract(chosen, extract_dir)
        return extract_dir / Path(chosen).name


def normalize_nis_code(code: str | int | float | None) -> str | None:
    """Normalize NIS codes to consistent zero-padded string format."""
    if code is None or pd.isna(code):
        return None

    raw = str(code).strip()
    if not raw:
        return None

    if re.fullmatch(r"\d+(\.0+)?", raw):
        raw = str(int(float(raw)))

    if raw.isdigit():
        return raw.zfill(5)

    return raw


def clean_for_json(records: list[dict]) -> list[dict]:
    cleaned: list[dict] = []
    for record in records:
        clean_record = {}
        for key, value in record.items():
            if pd.isna(value):
                clean_record[key] = None
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                clean_record[key] = int(value) if float(value).is_integer() else float(value)
            else:
                clean_record[key] = value
        cleaned.append(clean_record)
    return cleaned


def serialize_json(payload, *, compact: bool) -> bytes:
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
    return text.encode("utf-8")


def write_json_to_dirs(relative_path: Path, payload, dirs: Iterable[Path], *, compact: bool = True) -> None:
    data = serialize_json(payload, compact=compact)
    for root in dirs:
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def write_text_to_dirs(relative_path: Path, text: str, dirs: Iterable[Path]) -> None:
    for root in dirs:
        target = root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")


def load_opendata_workbook(workbook_path: Path) -> pd.DataFrame:
    """Load the Statbel open-data workbook (one sheet per year)."""
    excel_file = pd.ExcelFile(workbook_path)
    frames: list[pd.DataFrame] = []

    for sheet_name in excel_file.sheet_names:
        frame = pd.read_excel(workbook_path, sheet_name=sheet_name)
        if set(OPEN_DATA_REQUIRED_COLUMNS).issubset(frame.columns):
            frames.append(frame[list(OPEN_DATA_REQUIRED_COLUMNS)].copy())

    if not frames:
        raise ValueError(
            "Unsupported XLSX structure. Expected the Statbel open-data workbook "
            f"({DEFAULT_INPUT_URL}), but got {workbook_path.name}."
        )

    return pd.concat(frames, ignore_index=True)


def find_presentation_header_row(frame: pd.DataFrame) -> int:
    for idx in range(min(10, len(frame))):
        labels = [clean_label(frame.iat[idx, col]).lower() for col in range(min(4, frame.shape[1]))]
        if labels == ["refnis", "lokaliteit", "jaar", "periode"]:
            return idx
    raise ValueError("Could not find Statbel presentation header row")


def presentation_level_for_sheet(sheet_name: str) -> int | None:
    normalized = clean_label(sheet_name).lower()
    return PRESENTATION_SHEET_LEVELS.get(normalized)


def parse_presentation_sheet(frame: pd.DataFrame, sheet_name: str) -> pd.DataFrame | None:
    level = presentation_level_for_sheet(sheet_name)
    if level is None:
        return None

    header_row = find_presentation_header_row(frame)
    property_row = header_row - 1
    if property_row < 0:
        raise ValueError(f"Could not find property labels in sheet {sheet_name}")

    groups: list[tuple[str, dict[str, int]]] = []
    for col in range(frame.shape[1]):
        property_label = clean_label(frame.iat[property_row, col])
        if property_label not in PROPERTY_TYPES:
            continue

        metric_columns: dict[str, int] = {}
        for metric_col in range(col, min(col + 4, frame.shape[1])):
            metric_label = clean_label(frame.iat[header_row, metric_col]).lower()
            target_column = PRESENTATION_METRIC_COLUMNS.get(metric_label)
            if target_column:
                metric_columns[target_column] = metric_col

        if set(PRESENTATION_METRIC_COLUMNS.values()).issubset(metric_columns):
            groups.append((property_label, metric_columns))

    if not groups:
        raise ValueError(f"Could not find Statbel property metric groups in sheet {sheet_name}")

    data_rows = frame.iloc[header_row + 1 :].copy()
    data_rows = data_rows[
        data_rows.iloc[:, 0].notna()
        & data_rows.iloc[:, 1].notna()
        & data_rows.iloc[:, 2].notna()
        & data_rows.iloc[:, 3].notna()
    ]

    frames: list[pd.DataFrame] = []
    for property_label, metric_columns in groups:
        parsed = pd.DataFrame(
            {
                "CD_YEAR": data_rows.iloc[:, 2],
                "CD_TYPE_NL": property_label,
                "CD_REFNIS": data_rows.iloc[:, 0],
                "CD_REFNIS_NL": data_rows.iloc[:, 1],
                "CD_PERIOD": data_rows.iloc[:, 3],
                "CD_CLASS_SURFACE": TOTAL_SURFACE_LABEL,
                "MS_TOTAL_TRANSACTIONS": data_rows.iloc[:, metric_columns["MS_TOTAL_TRANSACTIONS"]],
                "MS_P_25": data_rows.iloc[:, metric_columns["MS_P_25"]],
                "MS_P_50_median": data_rows.iloc[:, metric_columns["MS_P_50_median"]],
                "MS_P_75": data_rows.iloc[:, metric_columns["MS_P_75"]],
                "CD_niveau_refnis": level,
            }
        )
        frames.append(parsed)

    return pd.concat(frames, ignore_index=True)


def load_presentation_workbook(workbook_path: Path) -> pd.DataFrame:
    """Load the formatted Statbel XLSX downloads from the publication page."""
    excel_file = pd.ExcelFile(workbook_path)
    frames: list[pd.DataFrame] = []

    for sheet_name in excel_file.sheet_names:
        level = presentation_level_for_sheet(sheet_name)
        if level is None:
            continue

        frame = pd.read_excel(workbook_path, sheet_name=sheet_name, header=None, dtype=object)
        parsed = parse_presentation_sheet(frame, sheet_name)
        if parsed is not None:
            frames.append(parsed)

    if not frames:
        raise ValueError(f"Unsupported XLSX structure: {workbook_path.name}")

    return pd.concat(frames, ignore_index=True)


def load_pipe_text(path: Path) -> pd.DataFrame:
    """Load the Statbel pipe-delimited TXT export."""
    return pd.read_csv(
        path,
        sep="|",
        encoding="latin-1",
        dtype=str,
        low_memory=False,
    )


def load_source_dataframe(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".xlsx":
        try:
            return load_opendata_workbook(path)
        except ValueError:
            try:
                return load_presentation_workbook(path)
            except ValueError as presentation_error:
                raise ValueError(
                    "Unsupported XLSX structure. Expected either the Statbel open-data "
                    f"workbook ({DEFAULT_INPUT_URL}) or the formatted Statbel download workbook."
                ) from presentation_error
    if suffix == ".zip":
        extracted = extract_txt_from_zip(path, DATA_DIR)
        return load_pipe_text(extracted)
    if suffix in {".txt", ".csv"}:
        return load_pipe_text(path)
    raise ValueError(f"Unsupported input file format: {path.name}")


def prepare_source_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize, filter, and type-cast the raw Statbel dataframe."""
    working = df.copy()

    if "CD_CLASS_SURFACE" in working.columns:
        working = working[
            working["CD_CLASS_SURFACE"].fillna(TOTAL_SURFACE_LABEL).astype(str).str.lower() == TOTAL_SURFACE_LABEL
        ].copy()

    working["CD_REFNIS"] = working["CD_REFNIS"].apply(normalize_nis_code)
    working["CD_niveau_refnis"] = pd.to_numeric(working["CD_niveau_refnis"], errors="coerce").astype("Int64")
    working["CD_YEAR"] = pd.to_numeric(working["CD_YEAR"], errors="coerce").astype("Int64")
    working["CD_PERIOD"] = working["CD_PERIOD"].astype(str).str.strip()

    for column in ["MS_TOTAL_TRANSACTIONS", "MS_P_25", "MS_P_50_median", "MS_P_75"]:
        working[column] = pd.to_numeric(working[column], errors="coerce")

    working["property_type"] = working["CD_TYPE_NL"].map(PROPERTY_TYPES)
    working = working[working["property_type"].notna()].copy()
    working = working[
        working["CD_niveau_refnis"].isin([LEVEL_BELGIUM, LEVEL_REGION, LEVEL_PROVINCE, LEVEL_MUNICIPALITY])
    ].copy()

    return working


def build_datasets(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict, str]:
    """Build yearly, quarterly, municipality and lookup datasets."""
    max_year = int(df["CD_YEAR"].max())
    latest_year_data = df[df["CD_YEAR"] == max_year]
    quarters = sorted({str(period) for period in latest_year_data["CD_PERIOD"].dropna() if str(period).startswith("Q")})
    if quarters:
        latest_quarter = max(quarters)
        quarter_num = int(latest_quarter[1])
        quarter_months = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
        latest_date = f"{max_year}-{quarter_months.get(quarter_num, '12-31')}"
    else:
        latest_date = f"{max_year}-12-31"

    yearly_df = df[
        (df["CD_PERIOD"] == "Y")
        & (df["CD_niveau_refnis"].isin([LEVEL_BELGIUM, LEVEL_REGION, LEVEL_PROVINCE, LEVEL_MUNICIPALITY]))
    ].copy()

    yearly_agg = (
        yearly_df.groupby(["CD_YEAR", "CD_niveau_refnis", "CD_REFNIS", "property_type"], dropna=False)
        .agg(
            {
                "MS_TOTAL_TRANSACTIONS": "sum",
                "MS_P_50_median": "mean",
                "CD_REFNIS_NL": "first",
            }
        )
        .reset_index()
        .rename(
            columns={
                "CD_YEAR": "y",
                "CD_niveau_refnis": "lvl",
                "CD_REFNIS": "nis",
                "property_type": "type",
                "MS_TOTAL_TRANSACTIONS": "n",
                "MS_P_50_median": "p50",
                "CD_REFNIS_NL": "name",
            }
        )
    )
    yearly_agg["p50"] = yearly_agg["p50"].round(0)

    quarterly_df = df[
        (df["CD_PERIOD"].str.startswith("Q", na=False))
        & (df["CD_niveau_refnis"].isin([LEVEL_BELGIUM, LEVEL_REGION, LEVEL_PROVINCE, LEVEL_MUNICIPALITY]))
    ].copy()
    quarterly_df["quarter"] = quarterly_df["CD_PERIOD"].str.extract(r"Q(\d)").astype("Int64")

    quarterly_agg = (
        quarterly_df.groupby(["CD_YEAR", "quarter", "CD_niveau_refnis", "CD_REFNIS", "property_type"], dropna=False)
        .agg(
            {
                "MS_TOTAL_TRANSACTIONS": "sum",
                "MS_P_50_median": "mean",
                "MS_P_25": "mean",
                "MS_P_75": "mean",
                "CD_REFNIS_NL": "first",
            }
        )
        .reset_index()
        .rename(
            columns={
                "CD_YEAR": "y",
                "quarter": "q",
                "CD_niveau_refnis": "lvl",
                "CD_REFNIS": "nis",
                "property_type": "type",
                "MS_TOTAL_TRANSACTIONS": "n",
                "MS_P_50_median": "p50",
                "MS_P_25": "p25",
                "MS_P_75": "p75",
                "CD_REFNIS_NL": "name",
            }
        )
    )
    for column in ["p50", "p25", "p75"]:
        quarterly_agg[column] = quarterly_agg[column].round(0)

    municipalities = (
        yearly_agg[yearly_agg["lvl"] == LEVEL_MUNICIPALITY][["nis", "name", "y", "type", "n", "p50"]]
        .sort_values(["y", "name", "type"])
        .reset_index(drop=True)
    )

    geo_lookup = df[
        df["CD_niveau_refnis"].isin([LEVEL_REGION, LEVEL_PROVINCE, LEVEL_MUNICIPALITY])
    ][["CD_REFNIS", "CD_REFNIS_NL", "CD_niveau_refnis"]].drop_duplicates()

    lookups = {
        "property_types": [{"code": code, "nl": label} for label, code in PROPERTY_TYPES.items()],
        "regions": [
            {"code": normalize_nis_code(row["CD_REFNIS"]), "name": row["CD_REFNIS_NL"]}
            for _, row in geo_lookup[geo_lookup["CD_niveau_refnis"] == LEVEL_REGION].sort_values("CD_REFNIS").iterrows()
        ],
        "provinces": [
            {"code": normalize_nis_code(row["CD_REFNIS"]), "name": row["CD_REFNIS_NL"]}
            for _, row in geo_lookup[geo_lookup["CD_niveau_refnis"] == LEVEL_PROVINCE].sort_values("CD_REFNIS").iterrows()
        ],
        "municipalities": [
            {"code": normalize_nis_code(row["CD_REFNIS"]), "name": row["CD_REFNIS_NL"]}
            for _, row in geo_lookup[geo_lookup["CD_niveau_refnis"] == LEVEL_MUNICIPALITY].sort_values("CD_REFNIS_NL").iterrows()
        ],
    }

    return yearly_agg, quarterly_agg, municipalities, lookups, latest_date


def chunk_quarterly_records(records: list[dict]) -> tuple[list[dict], int]:
    total_records = len(records)
    if total_records == 0:
        return [], 1

    estimated_size = len(serialize_json(records, compact=True))
    avg_record_size = max(1, estimated_size / total_records)
    records_per_chunk = max(1, int((TARGET_CHUNK_SIZE_MB * BYTES_PER_MB) / avg_record_size))
    num_chunks = max(1, math.ceil(total_records / records_per_chunk))

    chunks: list[dict] = []
    for index in range(num_chunks):
        start_idx = index * records_per_chunk
        end_idx = min((index + 1) * records_per_chunk, total_records)
        chunk_records = records[start_idx:end_idx]
        chunk_bytes = serialize_json(chunk_records, compact=True)
        chunk_path = Path(f"quarterly_chunk_{index}.json")
        write_json_to_dirs(chunk_path, chunk_records, PUBLIC_TARGET_DIRS, compact=True)
        chunks.append(
            {
                "index": index,
                "filename": chunk_path.name,
                "records": len(chunk_records),
                "size_mb": len(chunk_bytes) / BYTES_PER_MB,
            }
        )

    return chunks, records_per_chunk


def export_results(yearly_agg: pd.DataFrame, quarterly_agg: pd.DataFrame, municipalities: pd.DataFrame, lookups: dict, input_url: str, latest_date: str) -> None:
    yearly_records = clean_for_json(yearly_agg.to_dict(orient="records"))
    quarterly_records = clean_for_json(quarterly_agg.to_dict(orient="records"))
    municipalities_records = clean_for_json(municipalities.to_dict(orient="records"))

    for directory in RESULT_TARGET_DIRS:
        directory.mkdir(parents=True, exist_ok=True)
    for directory in PUBLIC_TARGET_DIRS:
        reset_generated_dir(directory)

    years = sorted(int(year) for year in yearly_agg["y"].dropna().unique().tolist())
    chunks_metadata, records_per_chunk = chunk_quarterly_records(quarterly_records)

    metadata = {
        "source_url": input_url,
        "source_page_url": SOURCE_PAGE_URL,
        "source_open_data_url": DEFAULT_INPUT_URL,
        "source_direct_municipality_url": DIRECT_MUNICIPALITY_XLSX_URL,
        "source_document_export_urls": [
            statbel_document_url(filename, statbel_document_base_url(input_url))
            for filename in STATBEL_DOCUMENT_EXPORT_FILENAMES
        ],
        "open_data_page_url": OPEN_DATA_PAGE_URL,
        "latest_year": years[-1] if years else None,
        "latest_date": latest_date,
        "property_types": list(PROPERTY_TYPES.values()),
        "years": years,
        "quarterly_chunks": len(chunks_metadata),
        "total_records": len(quarterly_records),
        "records_per_chunk": records_per_chunk,
        "chunks": chunks_metadata,
    }

    write_json_to_dirs(Path("yearly.json"), yearly_records, RESULT_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("quarterly.json"), quarterly_records, RESULT_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("municipalities.json"), municipalities_records, RESULT_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("lookups.json"), lookups, RESULT_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("metadata.json"), metadata, RESULT_TARGET_DIRS, compact=False)

    write_json_to_dirs(Path("yearly.json"), yearly_records, PUBLIC_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("quarterly.json"), quarterly_records, PUBLIC_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("municipalities.json"), municipalities_records, PUBLIC_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("lookups.json"), lookups, PUBLIC_TARGET_DIRS, compact=True)
    write_json_to_dirs(Path("metadata.json"), metadata, PUBLIC_TARGET_DIRS, compact=False)

    yearly_csv = yearly_agg.to_csv(index=False)
    quarterly_csv = quarterly_agg.to_csv(index=False)
    write_text_to_dirs(Path("yearly.csv"), yearly_csv, RESULT_TARGET_DIRS)
    write_text_to_dirs(Path("quarterly.csv"), quarterly_csv, RESULT_TARGET_DIRS)
    write_text_to_dirs(Path("yearly.csv"), yearly_csv, PUBLIC_TARGET_DIRS)
    write_text_to_dirs(Path("quarterly.csv"), quarterly_csv, PUBLIC_TARGET_DIRS)

    print(f"Yearly records: {len(yearly_records)}")
    print(f"Quarterly records: {len(quarterly_records)}")
    print(f"Municipality map records: {len(municipalities_records)}")
    print(f"Quarterly chunks: {len(chunks_metadata)}")


def load_statbel_document_exports(primary_url: str) -> pd.DataFrame:
    primary_filename = url_filename(primary_url)
    base_url = statbel_document_base_url(primary_url)
    frames: list[pd.DataFrame] = []

    for filename in STATBEL_DOCUMENT_EXPORT_FILENAMES:
        url = statbel_document_url(filename, base_url)
        path = download_input_file(
            url,
            DATA_DIR / filename,
            update_metadata=filename == primary_filename,
        )
        frames.append(load_presentation_workbook(path))

    if primary_filename not in STATBEL_DOCUMENT_EXPORT_FILENAMES:
        path = download_input_file(primary_url, DATA_DIR / primary_filename, update_metadata=True)
        frames.append(load_presentation_workbook(path))

    return pd.concat(frames, ignore_index=True)


def resolve_source_dataframe() -> tuple[pd.DataFrame, str]:
    input_url = os.environ.get("INPUT_URL") or DEFAULT_INPUT_URL
    input_file_path = os.environ.get("INPUT_FILE_PATH")
    input_filename = os.environ.get("INPUT_FILENAME") or Path(input_url).name or DEFAULT_INPUT_FILENAME
    source_mode = os.environ.get("STATBEL_SOURCE_MODE", "").strip().lower()

    if input_file_path:
        path = Path(input_file_path)
        if not path.exists():
            raise FileNotFoundError(f"INPUT_FILE_PATH does not exist: {input_file_path}")
        return load_source_dataframe(path), input_url

    if source_mode in {"document_exports", "statbel_documents"} or is_statbel_document_export_url(input_url):
        return load_statbel_document_exports(input_url), input_url

    download_path = DATA_DIR / input_filename
    input_path = download_input_file(input_url, download_path)
    return load_source_dataframe(input_path), input_url


def process_data() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    raw_df, input_url = resolve_source_dataframe()
    prepared_df = prepare_source_dataframe(raw_df)
    yearly_agg, quarterly_agg, municipalities, lookups, latest_date = build_datasets(prepared_df)

    update_mdx_frontmatter_date(CONTENT_FILE, latest_date)
    export_results(yearly_agg, quarterly_agg, municipalities, lookups, input_url, latest_date)

    print(f"Processed {len(prepared_df)} Statbel rows from {input_url}")
    print(f"Latest data: {latest_date}")
    print(f"Output written to: {RESULTS_DIR}")
    if DATA_REPO_DIR is not None and DATA_REPO_DIR.exists():
        print(f"Mirrored to split data repo: {DATA_REPO_DIR}")


if __name__ == "__main__":
    process_data()
