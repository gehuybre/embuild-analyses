"""
Process Price Revision Index I 2021 data from FOD Economie.

Data source: https://economie.fgov.be/sites/default/files/Files/Entreprises/prix-construction-Indice-I-2021.xlsx

Downloads the Excel file and processes monthly index data for the dashboard.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

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


def download_data() -> str:
    """Download price revision index Excel from FOD Economie.

    Returns path to downloaded file.
    """
    input_url = os.environ.get("INPUT_URL", DATA_URL)
    print(f"Downloading from: {input_url}")

    response = requests.get(input_url, timeout=120)
    response.raise_for_status()

    # Save Excel file
    excel_path = DATA_DIR / "prix-construction-Indice-I-2021.xlsx"
    with open(excel_path, "wb") as f:
        f.write(response.content)

    print(f"Downloaded {len(response.content)} bytes to {excel_path}")
    return str(excel_path)


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
    xl_file = pd.ExcelFile(excel_path)
    print(f"Excel sheets: {xl_file.sheet_names}")

    # Read the Dutch data sheet (I_2021 (Nl)).
    # This sheet is a wide table: rows = components, columns = months.
    df = pd.read_excel(excel_path, sheet_name="I_2021 (Nl)", header=1)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

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

    # Save monthly indices
    with open(RESULTS_DIR / "monthly_indices.json", "w") as f:
        json.dump(monthly_data, f, ensure_ascii=False, indent=2)

    # Create components list (unique components)
    components = sorted(set(item["component"] for item in monthly_data))
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
        'data_source': DATA_URL,
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
    excel_path = download_data()
    process_data(excel_path)
