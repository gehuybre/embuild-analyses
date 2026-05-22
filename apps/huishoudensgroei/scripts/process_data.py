"""
Huishoudensgroei data processor.

Processes household projection data from Statistiek Vlaanderen into
aggregated JSON/CSV files for the blog dashboard.

Data source: https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei
"""

import json
import os
from pathlib import Path

import pandas as pd
import requests

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "public" / "data"
SHARED_DATA_DIR = REPO_ROOT / "packages" / "embuild-shared" / "src" / "data"

INPUT_FILE = DATA_DIR / "huishoudens.csv"
SOURCE_URL = "https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei"
DATA_URL = "https://assets.vlaanderen.be/raw/upload/v1716295326/aantal_huishoudens_naar_huishoudgrootte_zwfmvn.csv"

# Mapping household size categories (Dutch labels)
HOUSEHOLD_SIZE_LABELS = {
    "1": "1 persoon",
    "2": "2 personen",
    "3": "3 personen",
    "4+": "4+ personen",
}

# Province mapping based on NIS code prefix
PROVINCE_MAP = {
    11: {"code": "10000", "name": "Antwerpen"},
    12: {"code": "10000", "name": "Antwerpen"},
    13: {"code": "10000", "name": "Antwerpen"},
    23: {"code": "20001", "name": "Vlaams-Brabant"},
    24: {"code": "20001", "name": "Vlaams-Brabant"},
    31: {"code": "30000", "name": "West-Vlaanderen"},
    32: {"code": "30000", "name": "West-Vlaanderen"},
    33: {"code": "30000", "name": "West-Vlaanderen"},
    34: {"code": "30000", "name": "West-Vlaanderen"},
    35: {"code": "30000", "name": "West-Vlaanderen"},
    36: {"code": "30000", "name": "West-Vlaanderen"},
    37: {"code": "30000", "name": "West-Vlaanderen"},
    38: {"code": "30000", "name": "West-Vlaanderen"},
    41: {"code": "40000", "name": "Oost-Vlaanderen"},
    42: {"code": "40000", "name": "Oost-Vlaanderen"},
    43: {"code": "40000", "name": "Oost-Vlaanderen"},
    44: {"code": "40000", "name": "Oost-Vlaanderen"},
    45: {"code": "40000", "name": "Oost-Vlaanderen"},
    46: {"code": "40000", "name": "Oost-Vlaanderen"},
    71: {"code": "70000", "name": "Limburg"},
    72: {"code": "70000", "name": "Limburg"},
    73: {"code": "70000", "name": "Limburg"},
}


def get_province_from_nis(nis: int) -> dict | None:
    """Get province info from NIS code."""
    prefix = nis // 1000
    return PROVINCE_MAP.get(prefix)


def load_municipality_names() -> dict[str, str]:
    """Load municipality names from shared data."""
    refnis_file = SHARED_DATA_DIR / "nis" / "refnis.csv"
    if not refnis_file.exists():
        return {}

    df = pd.read_csv(refnis_file)
    # Level 4 = municipalities
    muni = df[df["LVL_REFNIS"] == 4][["CD_REFNIS", "TX_REFNIS_NL"]].copy()
    muni["CD_REFNIS"] = muni["CD_REFNIS"].astype(str)
    return dict(zip(muni["CD_REFNIS"], muni["TX_REFNIS_NL"]))


def clean_for_json(records: list[dict]) -> list[dict]:
    """Clean records for JSON serialization (handle NaN values)."""
    cleaned = []
    for r in records:
        clean_r = {}
        for k, v in r.items():
            if pd.isna(v):
                clean_r[k] = None
            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                if v != v:  # NaN check
                    clean_r[k] = None
                else:
                    clean_r[k] = int(v) if float(v).is_integer() else float(v)
            else:
                clean_r[k] = v
        cleaned.append(clean_r)
    return cleaned


def ensure_input_file() -> Path:
    """Download the CSV if it is not already present in the app-local data folder."""
    if INPUT_FILE.exists():
        return INPUT_FILE

    input_url = os.environ.get("INPUT_URL", DATA_URL)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading household projections from {input_url}")

    response = requests.get(input_url, timeout=120)
    response.raise_for_status()
    INPUT_FILE.write_bytes(response.content)
    return INPUT_FILE


def process_data() -> None:
    """Main data processing function."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Load data
    input_file = ensure_input_file()
    df = pd.read_csv(input_file, encoding="utf-8-sig")

    # Ensure proper types
    df["jaar"] = pd.to_numeric(df["jaar"], errors="coerce").astype("Int64")
    df["niscode"] = df["niscode"].astype(str)
    df["aantal"] = pd.to_numeric(df["aantal"], errors="coerce").astype("Int64")

    # Add province code
    df["province_code"] = df["niscode"].apply(
        lambda x: get_province_from_nis(int(x))["code"] if get_province_from_nis(int(x)) else None
    )

    # Load municipality names
    muni_names = load_municipality_names()

    # ============================================================
    # 1. Municipality-level data (gemeente niveau)
    # ============================================================

    # Aggregate by municipality, year, and household size
    muni_detail = (
        df.groupby(["jaar", "niscode", "aantal_huishoudleden"])["aantal"]
        .sum()
        .reset_index()
    )
    muni_detail = muni_detail.rename(
        columns={
            "jaar": "y",
            "niscode": "nis",
            "aantal_huishoudleden": "hh",
            "aantal": "n",
        }
    )

    # Add municipality names
    muni_detail["name"] = muni_detail["nis"].map(muni_names)

    # Municipality totals (sum all household sizes)
    muni_totals = (
        df.groupby(["jaar", "niscode"])["aantal"].sum().reset_index()
    )
    muni_totals = muni_totals.rename(
        columns={"jaar": "y", "niscode": "nis", "aantal": "n"}
    )
    muni_totals["name"] = muni_totals["nis"].map(muni_names)

    # Add province code to municipality totals
    muni_totals["p"] = muni_totals["nis"].apply(
        lambda x: get_province_from_nis(int(x))["code"] if get_province_from_nis(int(x)) else None
    )

    # ============================================================
    # 2. Province-level aggregates
    # ============================================================

    prov_detail = (
        df.groupby(["jaar", "province_code", "aantal_huishoudleden"])["aantal"]
        .sum()
        .reset_index()
    )
    prov_detail = prov_detail.rename(
        columns={
            "jaar": "y",
            "province_code": "p",
            "aantal_huishoudleden": "hh",
            "aantal": "n",
        }
    )

    prov_totals = (
        df.groupby(["jaar", "province_code"])["aantal"].sum().reset_index()
    )
    prov_totals = prov_totals.rename(
        columns={"jaar": "y", "province_code": "p", "aantal": "n"}
    )

    # ============================================================
    # 3. Flanders-level aggregates (regio)
    # ============================================================

    region_detail = (
        df.groupby(["jaar", "aantal_huishoudleden"])["aantal"].sum().reset_index()
    )
    region_detail = region_detail.rename(
        columns={"jaar": "y", "aantal_huishoudleden": "hh", "aantal": "n"}
    )
    region_detail["r"] = "2000"  # Vlaanderen

    region_totals = df.groupby(["jaar"])["aantal"].sum().reset_index()
    region_totals = region_totals.rename(columns={"jaar": "y", "aantal": "n"})
    region_totals["r"] = "2000"

    # ============================================================
    # 4. Calculate growth rates (compared to base year 2023)
    # ============================================================

    # Base year for comparison
    BASE_YEAR = 2023

    def add_growth_rate(df_totals: pd.DataFrame, group_col: str | None = None) -> pd.DataFrame:
        """Add growth rate column compared to base year."""
        df = df_totals.copy()

        if group_col:
            # Get base values per group
            base = df[df["y"] == BASE_YEAR].set_index(group_col)["n"]
            df["base_n"] = df[group_col].map(base)
        else:
            # Single group (region level)
            base_val = df[df["y"] == BASE_YEAR]["n"].iloc[0] if len(df[df["y"] == BASE_YEAR]) > 0 else None
            df["base_n"] = base_val

        # Calculate growth rate as percentage
        df["gr"] = ((df["n"] - df["base_n"]) / df["base_n"] * 100).round(2)
        df = df.drop(columns=["base_n"])
        return df

    muni_totals = add_growth_rate(muni_totals, "nis")
    prov_totals = add_growth_rate(prov_totals, "p")
    region_totals = add_growth_rate(region_totals, None)

    # ============================================================
    # 5. Create lookups
    # ============================================================

    provinces = [
        {"code": "10000", "name": "Antwerpen"},
        {"code": "20001", "name": "Vlaams-Brabant"},
        {"code": "30000", "name": "West-Vlaanderen"},
        {"code": "40000", "name": "Oost-Vlaanderen"},
        {"code": "70000", "name": "Limburg"},
    ]

    household_sizes = [
        {"code": k, "nl": v} for k, v in HOUSEHOLD_SIZE_LABELS.items()
    ]

    # Get unique municipalities
    municipalities = (
        muni_totals[["nis", "name"]]
        .drop_duplicates()
        .dropna()
        .sort_values("name")
        .rename(columns={"nis": "code"})
        .to_dict(orient="records")
    )

    lookups = {
        "provinces": provinces,
        "household_sizes": household_sizes,
        "municipalities": municipalities,
    }

    # ============================================================
    # 6. Write output files
    # ============================================================

    # Detailed data by household size
    muni_detail_records = clean_for_json(muni_detail.to_dict(orient="records"))
    prov_detail_records = clean_for_json(prov_detail.to_dict(orient="records"))
    region_detail_records = clean_for_json(region_detail.to_dict(orient="records"))

    # Total data with growth rates
    muni_records = clean_for_json(muni_totals.to_dict(orient="records"))
    prov_records = clean_for_json(prov_totals.to_dict(orient="records"))
    region_records = clean_for_json(region_totals.to_dict(orient="records"))

    # Write JSON files
    (RESULTS_DIR / "municipalities.json").write_text(
        json.dumps(muni_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "municipalities_by_size.json").write_text(
        json.dumps(muni_detail_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "provinces.json").write_text(
        json.dumps(prov_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "provinces_by_size.json").write_text(
        json.dumps(prov_detail_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "region.json").write_text(
        json.dumps(region_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "region_by_size.json").write_text(
        json.dumps(region_detail_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    (RESULTS_DIR / "lookups.json").write_text(
        json.dumps(lookups, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Write CSV files
    muni_totals.to_csv(RESULTS_DIR / "municipalities.csv", index=False)
    prov_totals.to_csv(RESULTS_DIR / "provinces.csv", index=False)
    region_totals.to_csv(RESULTS_DIR / "region.csv", index=False)

    # Metadata
    years = sorted(df["jaar"].dropna().unique().tolist())
    metadata = {
        "source_url": SOURCE_URL,
        "data_url": os.environ.get("INPUT_URL", DATA_URL),
        "base_year": BASE_YEAR,
        "min_year": int(min(years)),
        "max_year": int(max(years)),
        "years": [int(y) for y in years],
        "n_municipalities": len(municipalities),
        "n_provinces": len(provinces),
    }
    (RESULTS_DIR / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Processed {len(df)} rows")
    print(f"Years: {min(years)} - {max(years)}")
    print(f"Municipalities: {len(municipalities)}")
    print(f"Provinces: {len(provinces)}")


if __name__ == "__main__":
    process_data()
