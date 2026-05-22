"""
Process Price Revision Index I 2021 data from FOD Economie.

Data source: https://economie.fgov.be/sites/default/files/Files/Entreprises/prix-construction-Indice-I-2021.xlsx

Downloads the Excel file and processes monthly index data for the dashboard.
"""

import json
import os
import re
import sys
import time
import zipfile
from datetime import datetime
from hashlib import sha256
from html import unescape
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
RESULTS_DIR = SCRIPT_DIR.parent / "public" / "data"
DATA_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Data URL
DATA_URL = "https://economie.fgov.be/sites/default/files/Files/Entreprises/prix-construction-Indice-I-2021.xlsx"
SOURCE_PAGE_URL = "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen/mercuriale-index-i-2021"
REMOTE_METADATA_FILE = DATA_DIR / ".remote_metadata.json"
EXCEL_FILENAME = "prix-construction-Indice-I-2021.xlsx"
EXPECTED_SHEET_NAME = "I_2021 (Nl)"
MIN_VALID_XLSX_BYTES = 10_000
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
}

# Component name simplification mapping
COMPONENT_NAMES = {
    "Diesel": "Diesel",
    "Bitumen": "Bitumen",
    "Staal": "Staal",
    "Cement": "Cement",
    "Hout": "Hout",
    "Lonen": "Lonen",
    "Index I": "Index I",
}


class SourceUnavailable(RuntimeError):
    """Raised when the official source is temporarily unavailable or invalid."""


def _preview_bytes(content: bytes, limit: int = 300) -> str:
    text = content[:limit].decode("utf-8", errors="replace")
    return " ".join(text.split())


def _validate_xlsx_response(url: str, response: requests.Response, content: bytes) -> None:
    content_type = response.headers.get("content-type", "")
    details = (
        f"url={url}, status={response.status_code}, content_type={content_type!r}, "
        f"bytes={len(content)}"
    )

    if len(content) < MIN_VALID_XLSX_BYTES:
        raise SourceUnavailable(f"Downloaded file is too small to be a valid workbook ({details}).")

    if "text/html" in content_type.lower() or not content.startswith(b"PK\x03\x04"):
        raise SourceUnavailable(
            "Downloaded content is not an XLSX workbook "
            f"({details}, preview={_preview_bytes(content)!r})."
        )

    if not zipfile.is_zipfile(BytesIO(content)):
        raise SourceUnavailable(f"Downloaded XLSX is not a valid zip container ({details}).")


def _write_remote_metadata(url: str, response: requests.Response, content: bytes) -> None:
    payload = {
        "url": url,
        "etag": response.headers.get("etag"),
        "last_modified": response.headers.get("last-modified"),
        "sha256": sha256(content).hexdigest(),
    }
    REMOTE_METADATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _find_source_page_workbook_url() -> str | None:
    response = requests.get(SOURCE_PAGE_URL, headers=REQUEST_HEADERS, timeout=120)
    response.raise_for_status()
    html = response.text
    candidates = re.findall(r"""href=["']([^"']+\.xlsx(?:\?[^"']*)?)["']""", html, flags=re.I)
    for candidate in candidates:
        url = urljoin(SOURCE_PAGE_URL, unescape(candidate))
        if "Indice-I-2021" in url or "index-i-2021" in url.lower():
            return url
    return urljoin(SOURCE_PAGE_URL, unescape(candidates[0])) if candidates else None


def _download_candidate(url: str) -> tuple[requests.Response, bytes]:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=120)
    response.raise_for_status()
    content = response.content
    _validate_xlsx_response(url, response, content)
    return response, content


def download_data() -> str:
    """Download price revision index Excel from FOD Economie.

    Returns path to downloaded file.
    """
    configured_url = os.environ.get("INPUT_URL", DATA_URL)
    candidate_urls = [configured_url]
    if not os.environ.get("INPUT_URL"):
        try:
            discovered_url = _find_source_page_workbook_url()
        except requests.RequestException as exc:
            discovered_url = None
            print(f"Could not inspect source page for fallback workbook URL: {exc}")
        if discovered_url and discovered_url not in candidate_urls:
            candidate_urls.append(discovered_url)

    last_error: Exception | None = None
    for attempt in range(1, 4):
        for input_url in candidate_urls:
            print(f"Downloading from: {input_url} (attempt {attempt})")
            try:
                response, content = _download_candidate(input_url)
            except (requests.RequestException, SourceUnavailable) as exc:
                last_error = exc
                print(f"Download did not yield a valid workbook: {exc}")
                continue

            excel_path = DATA_DIR / EXCEL_FILENAME
            tmp_path = excel_path.with_suffix(".xlsx.tmp")
            tmp_path.write_bytes(content)
            tmp_path.replace(excel_path)
            _write_remote_metadata(input_url, response, content)
            os.environ["RESOLVED_INPUT_URL"] = input_url

            print(f"Downloaded {len(content)} bytes to {excel_path}")
            return str(excel_path)

        if attempt < 3:
            time.sleep(10 * attempt)

    raise SourceUnavailable(f"No valid workbook could be downloaded. Last error: {last_error}")


def _has_existing_public_outputs() -> bool:
    return all(
        (RESULTS_DIR / filename).exists()
        for filename in (
            "components.json",
            "metadata.json",
            "monthly_indices.json",
            "prijsherziening_data.csv",
        )
    )


def _warn_and_skip_unavailable_source(exc: Exception) -> None:
    message = (
        "Official source did not return a valid Excel workbook. "
        "Keeping existing generated data instead of overwriting it."
    )
    print(f"::warning::{message} {exc}")
    print(message)
    print(f"Reason: {exc}")


def _normalize_code(value) -> str | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (int,)):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)

    s = str(value).strip()
    s = re.sub(r"\.0$", "", s)
    return s or None


def _normalize_month_column(value) -> pd.Timestamp | None:
    if value is None or pd.isna(value):
        return None

    if isinstance(value, (datetime, pd.Timestamp)):
        ts = pd.Timestamp(value)
    elif isinstance(value, str):
        s = value.strip()
        ts = pd.to_datetime(s, errors="coerce", dayfirst=True)
        if pd.isna(ts):
            ts = pd.to_datetime(s, errors="coerce", format="%b-%y")
    else:
        ts = pd.to_datetime(value, errors="coerce")

    if pd.isna(ts):
        return None
    if ts.year < 2020 or ts.year > datetime.now().year + 1:
        return None
    return ts.to_period("M").to_timestamp()


def _simplify_component_id(code: str | None, description: str | None) -> str | None:
    if code and "CEMENT" in code.upper():
        return "Cement"
    if description:
        d = str(description).strip()
        if d.upper().startswith("INDEX I-2021"):
            return "Index I-2021"
        if d.upper() == "INDEX I+":
            return "Index I+"
    if code:
        return code
    if description and not pd.isna(description):
        return str(description).strip() or None
    return None


def process_data(excel_path: str) -> None:
    """Process price revision index data and save results."""

    # Read all sheets to find the data
    xl_file = pd.ExcelFile(excel_path, engine="openpyxl")
    print(f"Excel sheets: {xl_file.sheet_names}")
    if EXPECTED_SHEET_NAME not in xl_file.sheet_names:
        raise RuntimeError(
            f"Expected sheet {EXPECTED_SHEET_NAME!r} not found. Available sheets: {xl_file.sheet_names}"
        )

    # Read the Dutch data sheet (I_2021 (Nl)).
    # This sheet is a wide table: rows = components, columns = months.
    df = pd.read_excel(excel_path, sheet_name=EXPECTED_SHEET_NAME, header=1, engine="openpyxl")
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")
    if len(df.columns) < 4:
        raise RuntimeError(f"Expected at least 4 columns in {EXPECTED_SHEET_NAME!r}, got {len(df.columns)}")

    df.columns = [c.strip() if isinstance(c, str) else c for c in df.columns]

    code_col, desc_col, weight_col = df.columns[:3]
    df = df.rename(columns={code_col: "code", desc_col: "description", weight_col: "weight"})

    month_cols_raw = list(df.columns[3:])
    month_col_map: dict[object, pd.Timestamp] = {}
    for col in month_cols_raw:
        ts = _normalize_month_column(col)
        if ts is not None:
            month_col_map[col] = ts

    df = df.rename(columns=month_col_map)
    month_cols = [month_col_map.get(c) for c in month_cols_raw]
    month_cols = [c for c in month_cols if c is not None]
    if not month_cols:
        raise RuntimeError("No valid monthly columns found in the workbook.")

    monthly_data: list[dict] = []
    for month_col in month_cols:
        date = pd.Timestamp(month_col)
        subset = df.loc[df[month_col].notna(), ["code", "description", month_col]]

        for row in subset.itertuples(index=False, name=None):
            raw_code, raw_description, raw_value = row
            code = _normalize_code(raw_code)
            description = None if pd.isna(raw_description) else str(raw_description).strip()
            component_id = _simplify_component_id(code, description)
            if not component_id:
                continue

            try:
                value = float(raw_value)
            except (ValueError, TypeError):
                continue

            monthly_data.append(
                {
                    "year": int(date.year),
                    "month": int(date.month),
                    "component": component_id,
                    "component_orig": description or code or component_id,
                    "value": value,
                }
            )

    if not monthly_data:
        raise RuntimeError("No monthly records were extracted from the workbook.")

    components = sorted(set(item["component"] for item in monthly_data))
    required_components = {"Index I-2021", "Index I+"}
    missing_components = required_components - set(components)
    if missing_components:
        raise RuntimeError(f"Missing expected components in extracted data: {sorted(missing_components)}")

    # Save monthly indices
    with open(RESULTS_DIR / "monthly_indices.json", "w") as f:
        json.dump(monthly_data, f, ensure_ascii=False, indent=2)

    # Create components list (unique components)
    components_data = []
    for comp in components:
        original = next((item["component_orig"] for item in monthly_data if item["component"] == comp), comp)
        components_data.append({"code": comp, "name": comp, "original": original})

    with open(RESULTS_DIR / "components.json", "w") as f:
        json.dump(components_data, f, ensure_ascii=False, indent=2)

    # Create CSV export
    df_export = pd.DataFrame(monthly_data)
    df_pivot = df_export.pivot_table(
        index=['year', 'month'],
        columns='component',
        values='value',
        aggfunc='first'
    ).reset_index()

    csv_path = RESULTS_DIR / "prijsherziening_data.csv"
    df_pivot.to_csv(csv_path, index=False)

    # Metadata
    latest_date = max(month_cols) if month_cols else None
    metadata = {
        'last_updated': datetime.now().isoformat(),
        'data_source': os.environ.get("RESOLVED_INPUT_URL") or os.environ.get("INPUT_URL", DATA_URL),
        'latest_data_date': latest_date.isoformat() if latest_date is not None else None,
        'total_records': len(monthly_data),
        'components': components,
        'date_range': {
            'min_year': int(min(month_cols).year) if month_cols else None,
            'max_year': int(max(month_cols).year) if month_cols else None,
            'min_month': int(min(month_cols).month) if month_cols else None,
            'max_month': int(max(month_cols).month) if month_cols else None,
        }
    }

    with open(RESULTS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nProcessing complete!")
    print(f"Total monthly records: {len(monthly_data)}")
    print(f"Components: {components}")
    print(f"Latest data: {latest_date}")
    print(f"Output files saved to: {RESULTS_DIR}")


if __name__ == "__main__":
    try:
        excel_path = download_data()
    except SourceUnavailable as exc:
        if _has_existing_public_outputs():
            _warn_and_skip_unavailable_source(exc)
            sys.exit(0)
        raise

    process_data(excel_path)
