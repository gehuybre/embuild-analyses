"""
Process bankruptcy data from Statbel.

Data source: https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen/maandelijkse-faillissementen

Downloads the most recent year's data and processes it for the dashboard.
Focuses on construction sector (NACE section F) but includes all sectors for comparison.
"""

import io
import json
import os
import zipfile
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
REPO_ROOT = APP_DIR.parent.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "public" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Statbel URL pattern
BASE_URL = "https://statbel.fgov.be/sites/default/files/files/opendata/BRI_Nace"

# NACE sector mapping (section code -> Dutch name)
SECTOR_NAMES = {
    "A": "Landbouw, bosbouw en visserij",
    "B": "Winning van delfstoffen",
    "C": "Industrie",
    "D": "Productie en distributie van elektriciteit, gas, stoom",
    "E": "Distributie van water; afval- en afvalwaterbeheer",
    "F": "Bouwnijverheid",
    "G": "Groot- en detailhandel; reparatie van auto's",
    "H": "Vervoer en opslag",
    "I": "Verschaffen van accommodatie en maaltijden",
    "J": "Informatie en communicatie",
    "K": "Financiële activiteiten en verzekeringen",
    "L": "Exploitatie van en handel in onroerend goed",
    "M": "Vrije beroepen en wetenschappelijke activiteiten",
    "N": "Administratieve en ondersteunende diensten",
    "O": "Openbaar bestuur en defensie",
    "P": "Onderwijs",
    "Q": "Menselijke gezondheidszorg en maatschappelijke dienstverlening",
    "R": "Kunst, amusement en recreatie",
    "S": "Overige diensten",
    "T": "Huishoudens als werkgever",
    "U": "Extraterritoriale organisaties",
    "?": "Onbekend",
}

# Load Belgian province codes from shared JSON file
# Note: Brussels (21000) is technically an arrondissement, not a province, but is treated
# as a province-equivalent for visualization purposes since Brussels Capital Region has no
# province-level administrative division in the NIS hierarchy.
SHARED_DATA_DIR = REPO_ROOT / "packages" / "embuild-shared" / "src" / "data"
with open(SHARED_DATA_DIR / "belgian-provinces.json", "r") as f:
    BELGIAN_PROVINCES = {int(k): v for k, v in json.load(f).items()}


def _load_remote_metadata_url():
    metadata_path = DATA_DIR / ".remote_metadata.json"
    if not metadata_path.exists():
        return None

    try:
        metadata = json.loads(metadata_path.read_text())
    except json.JSONDecodeError as exc:
        print(f"Failed to parse {metadata_path}: {exc}")
        return None

    url = metadata.get("url")
    if url:
        return url
    return None


def download_data() -> pd.DataFrame:
    """Download bankruptcy data from Statbel.

    Tries configured URL, then falls back to the static dataset URL.
    Returns DataFrame with all bankruptcy records.
    """
    input_url = os.environ.get("INPUT_URL")
    metadata_url = _load_remote_metadata_url()

    if input_url:
        # Use provided URL from environment
        print(f"Using INPUT_URL: {input_url}")
        urls_to_try = [input_url]
    else:
        urls_to_try = []
        if metadata_url:
            print(f"Using metadata URL: {metadata_url}")
            urls_to_try.append(metadata_url)
        # Use the static Statbel URL (no year parameter needed)
        urls_to_try.append(f"{BASE_URL}/TF_BANKRUPTCIES.zip")

    for url in urls_to_try:
        print(f"Trying URL: {url}")
        try:
            response = requests.get(url, timeout=120)
            if response.status_code == 200:
                print(f"Successfully downloaded from: {url}")

                # Save zip to data directory for reference
                from pathlib import Path as PathLib
                zip_filename = PathLib(url).name or "TF_BANKRUPTCIES.zip"
                zip_path = DATA_DIR / zip_filename
                with open(zip_path, "wb") as f:
                    f.write(response.content)

                # Extract and read data file (xlsx or txt)
                if not zipfile.is_zipfile(io.BytesIO(response.content)):
                    raise ValueError("Downloaded file is not a valid zip archive")

                with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
                    names = zf.namelist()
                    file_names = [
                        n for n in names
                        if n and not n.endswith("/") and not n.endswith("\\")
                    ]
                    excel_names = [
                        n for n in file_names
                        if Path(n).suffix.lower() in {".xlsx", ".xls"}
                    ]
                    text_names = [
                        n for n in file_names
                        if Path(n).suffix.lower() in {".txt", ".csv"}
                    ]

                    if excel_names:
                        excel_name = excel_names[0]
                        with zf.open(excel_name) as excel_file:
                            df = pd.read_excel(excel_file)
                            print(f"Loaded {len(df)} records from {excel_name}")
                            return df

                    if text_names:
                        text_name = text_names[0]
                        with zf.open(text_name) as text_file:
                            # Read first line to detect delimiter
                            first_line = text_file.readline().decode("utf-8-sig")
                            text_file.seek(0)

                            # Detect delimiter (pipe, semicolon, comma, or tab)
                            delimiter = "|"
                            if ";" in first_line and first_line.count(";") > first_line.count("|"):
                                delimiter = ";"
                            elif "," in first_line and first_line.count(",") > first_line.count("|"):
                                delimiter = ","
                            elif "\t" in first_line:
                                delimiter = "\t"

                            print(f"Detected delimiter: {repr(delimiter)}")
                            df = pd.read_csv(
                                text_file,
                                sep=delimiter,
                                encoding="utf-8-sig",
                                low_memory=False,
                            )
                            print(f"Loaded {len(df)} records from {text_name}")
                            return df

                    raise ValueError(
                        f"No supported data files found in zip. Entries: {names}"
                    )
        except Exception as e:
            print(f"Failed to download from {url}: {e}")
            continue

    raise RuntimeError("Could not download data from any URL")


def process_data(df: pd.DataFrame) -> None:
    """Process bankruptcy data and save aggregated results."""

    # Use all Belgian data (no region filter)
    df_be = df.copy()
    print(f"Processing {len(df_be)} Belgian records")

    # Clean up sector code
    df_be["sector"] = df_be["TX_NACE_REV2_SECTION"].fillna("?")

    # Get year range
    min_year = int(df_be["CD_YEAR"].min())
    max_year = int(df_be["CD_YEAR"].max())
    max_month = int(df_be[df_be["CD_YEAR"] == max_year]["CD_MONTH"].max())
    print(f"Data range: {min_year} - {max_year}/{max_month}")

    # =========================================================================
    # AGGREGATE 1: Monthly totals for ALL sectors
    # =========================================================================
    monthly_all = df_be.groupby(["CD_YEAR", "CD_MONTH"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_all.iterrows()
    ]
    monthly_all_json.sort(key=lambda x: (x["y"], x["m"]))

    with open(RESULTS_DIR / "monthly_totals.json", "w") as f:
        json.dump(monthly_all_json, f)

    # =========================================================================
    # AGGREGATE 2: Monthly totals for CONSTRUCTION sector only
    # =========================================================================
    df_bouw = df_be[df_be["sector"] == "F"]

    monthly_bouw = df_bouw.groupby(["CD_YEAR", "CD_MONTH"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_bouw.iterrows()
    ]
    monthly_bouw_json.sort(key=lambda x: (x["y"], x["m"]))

    with open(RESULTS_DIR / "monthly_construction.json", "w") as f:
        json.dump(monthly_bouw_json, f)

    # =========================================================================
    # AGGREGATE 3: Yearly totals for ALL sectors
    # =========================================================================
    yearly_all = df_be.groupby(["CD_YEAR"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    yearly_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in yearly_all.iterrows()
    ]
    yearly_all_json.sort(key=lambda x: x["y"])

    with open(RESULTS_DIR / "yearly_totals.json", "w") as f:
        json.dump(yearly_all_json, f)

    # =========================================================================
    # AGGREGATE 4: Yearly totals for CONSTRUCTION sector only
    # =========================================================================
    yearly_bouw = df_bouw.groupby(["CD_YEAR"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    yearly_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in yearly_bouw.iterrows()
    ]
    yearly_bouw_json.sort(key=lambda x: x["y"])

    with open(RESULTS_DIR / "yearly_construction.json", "w") as f:
        json.dump(yearly_bouw_json, f)

    # =========================================================================
    # AGGREGATE 5: Yearly by sector (for sector comparison)
    # =========================================================================
    yearly_by_sector = df_be.groupby(["CD_YEAR", "sector"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    yearly_sector_json = [
        {
            "y": int(row["CD_YEAR"]),
            "s": row["sector"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in yearly_by_sector.iterrows()
    ]
    yearly_sector_json.sort(key=lambda x: (x["y"], x["s"]))

    with open(RESULTS_DIR / "yearly_by_sector.json", "w") as f:
        json.dump(yearly_sector_json, f)

    # =========================================================================
    # AGGREGATE 6: Monthly by sector (for sector comparison charts)
    # =========================================================================
    monthly_by_sector = df_be.groupby(["CD_YEAR", "CD_MONTH", "sector"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_sector_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "s": row["sector"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_by_sector.iterrows()
    ]
    monthly_sector_json.sort(key=lambda x: (x["y"], x["m"], x["s"]))

    with open(RESULTS_DIR / "monthly_by_sector.json", "w") as f:
        json.dump(monthly_sector_json, f)

    # =========================================================================
    # AGGREGATE 7: By province (construction sector)
    # =========================================================================
    df_bouw_prov = df_bouw[df_bouw["CD_PROV_REFNIS"].notna()].copy()
    df_bouw_prov["CD_PROV_REFNIS"] = df_bouw_prov["CD_PROV_REFNIS"].astype(int)

    provinces_yearly = df_bouw_prov.groupby(["CD_YEAR", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    provinces_json = [
        {
            "y": int(row["CD_YEAR"]),
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in provinces_yearly.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    provinces_json.sort(key=lambda x: (x["y"], x["p"]))

    with open(RESULTS_DIR / "provinces_construction.json", "w") as f:
        json.dump(provinces_json, f)

    # =========================================================================
    # AGGREGATE 8: By province (all sectors)
    # =========================================================================
    df_be_prov = df_be[df_be["CD_PROV_REFNIS"].notna()].copy()
    df_be_prov["CD_PROV_REFNIS"] = df_be_prov["CD_PROV_REFNIS"].astype(int)

    provinces_all_yearly = df_be_prov.groupby(["CD_YEAR", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    provinces_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in provinces_all_yearly.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    provinces_all_json.sort(key=lambda x: (x["y"], x["p"]))

    with open(RESULTS_DIR / "provinces.json", "w") as f:
        json.dump(provinces_all_json, f)

    # =========================================================================
    # AGGREGATE 9: Monthly by province (construction sector)
    # =========================================================================
    monthly_prov_bouw = df_bouw_prov.groupby(["CD_YEAR", "CD_MONTH", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_prov_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_prov_bouw.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    monthly_prov_bouw_json.sort(key=lambda x: (x["y"], x["m"], x["p"]))

    with open(RESULTS_DIR / "monthly_provinces_construction.json", "w") as f:
        json.dump(monthly_prov_bouw_json, f)

    # =========================================================================
    # AGGREGATE 10: Monthly by province (all sectors)
    # =========================================================================
    monthly_prov_all = df_be_prov.groupby(["CD_YEAR", "CD_MONTH", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_prov_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_prov_all.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    monthly_prov_all_json.sort(key=lambda x: (x["y"], x["m"], x["p"]))

    with open(RESULTS_DIR / "monthly_provinces.json", "w") as f:
        json.dump(monthly_prov_all_json, f)

    # =========================================================================
    # AGGREGATE 11: Yearly by sector and province (for geo filter in sector comparison)
    # =========================================================================
    yearly_sector_prov = df_be_prov.groupby(["CD_YEAR", "sector", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    yearly_sector_prov_json = [
        {
            "y": int(row["CD_YEAR"]),
            "s": row["sector"],
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in yearly_sector_prov.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    yearly_sector_prov_json.sort(key=lambda x: (x["y"], x["s"], x["p"]))

    with open(RESULTS_DIR / "yearly_by_sector_province.json", "w") as f:
        json.dump(yearly_sector_prov_json, f)

    # =========================================================================
    # AGGREGATE 11B: Monthly by sector and province (for combined filtering)
    # =========================================================================
    monthly_sector_prov = df_be_prov.groupby(["CD_YEAR", "CD_MONTH", "sector", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    monthly_sector_prov_json = [
        {
            "y": int(row["CD_YEAR"]),
            "m": int(row["CD_MONTH"]),
            "s": row["sector"],
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in monthly_sector_prov.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    monthly_sector_prov_json.sort(key=lambda x: (x["y"], x["m"], x["s"], x["p"]))

    with open(RESULTS_DIR / "monthly_by_sector_province.json", "w") as f:
        json.dump(monthly_sector_prov_json, f)

    # =========================================================================
    # AGGREGATE 12: By company duration (construction sector)
    # =========================================================================
    duration_order = [
        "Minder dan 1 jaar",
        "Van 1 jaar tot minder dan 2 jaar",
        "Van 2 jaar tot minder dan 3 jaar",
        "Van 3 jaar tot minder dan 4 jaar",
        "Van 4 jaar tot minder dan 5 jaar",
        "Van 5 jaar tot minder dan 10 jaar",
        "Van 10 jaar tot minder dan 15 jaar",
        "Van 15 jaar tot minder dan 20 jaar",
        "20 jaar of meer",
    ]
    duration_short = {
        "Minder dan 1 jaar": "<1 jaar",
        "Van 1 jaar tot minder dan 2 jaar": "1-2 jaar",
        "Van 2 jaar tot minder dan 3 jaar": "2-3 jaar",
        "Van 3 jaar tot minder dan 4 jaar": "3-4 jaar",
        "Van 4 jaar tot minder dan 5 jaar": "4-5 jaar",
        "Van 5 jaar tot minder dan 10 jaar": "5-10 jaar",
        "Van 10 jaar tot minder dan 15 jaar": "10-15 jaar",
        "Van 15 jaar tot minder dan 20 jaar": "15-20 jaar",
        "20 jaar of meer": "20+ jaar",
    }

    # Construction by duration
    duration_bouw = df_bouw.groupby(["CD_YEAR", "TX_COMPANY_DURATION_NL"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    duration_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "d": row["TX_COMPANY_DURATION_NL"],
            "ds": duration_short.get(row["TX_COMPANY_DURATION_NL"], row["TX_COMPANY_DURATION_NL"]),
            "do": duration_order.index(row["TX_COMPANY_DURATION_NL"]) if row["TX_COMPANY_DURATION_NL"] in duration_order else 99,
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in duration_bouw.iterrows()
    ]
    duration_bouw_json.sort(key=lambda x: (x["y"], x["do"]))

    with open(RESULTS_DIR / "yearly_by_duration_construction.json", "w") as f:
        json.dump(duration_bouw_json, f)

    # All sectors by duration
    duration_all = df_be.groupby(["CD_YEAR", "TX_COMPANY_DURATION_NL"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    duration_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "d": row["TX_COMPANY_DURATION_NL"],
            "ds": duration_short.get(row["TX_COMPANY_DURATION_NL"], row["TX_COMPANY_DURATION_NL"]),
            "do": duration_order.index(row["TX_COMPANY_DURATION_NL"]) if row["TX_COMPANY_DURATION_NL"] in duration_order else 99,
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in duration_all.iterrows()
    ]
    duration_all_json.sort(key=lambda x: (x["y"], x["do"]))

    with open(RESULTS_DIR / "yearly_by_duration.json", "w") as f:
        json.dump(duration_all_json, f)

    # By duration and province (construction)
    df_bouw_prov_dur = df_bouw[df_bouw["CD_PROV_REFNIS"].notna()].copy()
    df_bouw_prov_dur["CD_PROV_REFNIS"] = df_bouw_prov_dur["CD_PROV_REFNIS"].astype(int)

    duration_prov_bouw = df_bouw_prov_dur.groupby(["CD_YEAR", "TX_COMPANY_DURATION_NL", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    duration_prov_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "d": row["TX_COMPANY_DURATION_NL"],
            "ds": duration_short.get(row["TX_COMPANY_DURATION_NL"], row["TX_COMPANY_DURATION_NL"]),
            "do": duration_order.index(row["TX_COMPANY_DURATION_NL"]) if row["TX_COMPANY_DURATION_NL"] in duration_order else 99,
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in duration_prov_bouw.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    duration_prov_bouw_json.sort(key=lambda x: (x["y"], x["do"], x["p"]))

    with open(RESULTS_DIR / "yearly_by_duration_province_construction.json", "w") as f:
        json.dump(duration_prov_bouw_json, f)

    # By duration and province (all sectors)
    df_be_prov_dur = df_be[df_be["CD_PROV_REFNIS"].notna()].copy()
    df_be_prov_dur["CD_PROV_REFNIS"] = df_be_prov_dur["CD_PROV_REFNIS"].astype(int)

    duration_prov_all = df_be_prov_dur.groupby(["CD_YEAR", "TX_COMPANY_DURATION_NL", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    duration_prov_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "d": row["TX_COMPANY_DURATION_NL"],
            "ds": duration_short.get(row["TX_COMPANY_DURATION_NL"], row["TX_COMPANY_DURATION_NL"]),
            "do": duration_order.index(row["TX_COMPANY_DURATION_NL"]) if row["TX_COMPANY_DURATION_NL"] in duration_order else 99,
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in duration_prov_all.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    duration_prov_all_json.sort(key=lambda x: (x["y"], x["do"], x["p"]))

    with open(RESULTS_DIR / "yearly_by_duration_province.json", "w") as f:
        json.dump(duration_prov_all_json, f)

    # =========================================================================
    # AGGREGATE 13: By worker count class (construction sector)
    # =========================================================================
    # Employment class is already in the data as TX_EMPLOYMENT_CLASS_DESCR_NL
    workers_bouw = df_bouw.groupby(["CD_YEAR", "TX_EMPLOYMENT_CLASS_DESCR_NL"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    workers_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "c": row["TX_EMPLOYMENT_CLASS_DESCR_NL"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in workers_bouw.iterrows()
    ]
    workers_bouw_json.sort(key=lambda x: (x["y"], x["c"]))

    with open(RESULTS_DIR / "yearly_by_workers_construction.json", "w") as f:
        json.dump(workers_bouw_json, f)

    # All sectors by worker class
    workers_all = df_be.groupby(["CD_YEAR", "TX_EMPLOYMENT_CLASS_DESCR_NL"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    workers_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "c": row["TX_EMPLOYMENT_CLASS_DESCR_NL"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in workers_all.iterrows()
    ]
    workers_all_json.sort(key=lambda x: (x["y"], x["c"]))

    with open(RESULTS_DIR / "yearly_by_workers.json", "w") as f:
        json.dump(workers_all_json, f)

    # By worker class and province (construction)
    workers_prov_bouw = df_bouw_prov.groupby(["CD_YEAR", "TX_EMPLOYMENT_CLASS_DESCR_NL", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    workers_prov_bouw_json = [
        {
            "y": int(row["CD_YEAR"]),
            "c": row["TX_EMPLOYMENT_CLASS_DESCR_NL"],
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in workers_prov_bouw.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    workers_prov_bouw_json.sort(key=lambda x: (x["y"], x["c"], x["p"]))

    with open(RESULTS_DIR / "yearly_by_workers_province_construction.json", "w") as f:
        json.dump(workers_prov_bouw_json, f)

    # By worker class and province (all sectors)
    workers_prov_all = df_be_prov.groupby(["CD_YEAR", "TX_EMPLOYMENT_CLASS_DESCR_NL", "CD_PROV_REFNIS"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    workers_prov_all_json = [
        {
            "y": int(row["CD_YEAR"]),
            "c": row["TX_EMPLOYMENT_CLASS_DESCR_NL"],
            "p": str(int(row["CD_PROV_REFNIS"])),
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in workers_prov_all.iterrows()
        if int(row["CD_PROV_REFNIS"]) in BELGIAN_PROVINCES
    ]
    workers_prov_all_json.sort(key=lambda x: (x["y"], x["c"], x["p"]))

    with open(RESULTS_DIR / "yearly_by_workers_province.json", "w") as f:
        json.dump(workers_prov_all_json, f)

    # =========================================================================
    # AGGREGATE 14: By duration and sector (all sectors)
    # =========================================================================
    duration_sector = df_be.groupby(["CD_YEAR", "TX_COMPANY_DURATION_NL", "sector"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    duration_sector_json = [
        {
            "y": int(row["CD_YEAR"]),
            "d": row["TX_COMPANY_DURATION_NL"],
            "ds": duration_short.get(row["TX_COMPANY_DURATION_NL"], row["TX_COMPANY_DURATION_NL"]),
            "do": duration_order.index(row["TX_COMPANY_DURATION_NL"]) if row["TX_COMPANY_DURATION_NL"] in duration_order else 99,
            "s": row["sector"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in duration_sector.iterrows()
    ]
    duration_sector_json.sort(key=lambda x: (x["y"], x["s"], x["do"]))

    with open(RESULTS_DIR / "yearly_by_duration_sector.json", "w") as f:
        json.dump(duration_sector_json, f)

    # =========================================================================
    # AGGREGATE 15: By worker class and sector (all sectors)
    # =========================================================================
    workers_sector = df_be.groupby(["CD_YEAR", "TX_EMPLOYMENT_CLASS_DESCR_NL", "sector"]).agg({
        "MS_COUNTOF_BANKRUPTCIES": "sum",
        "MS_COUNTOF_WORKERS": "sum",
    }).reset_index()

    workers_sector_json = [
        {
            "y": int(row["CD_YEAR"]),
            "c": row["TX_EMPLOYMENT_CLASS_DESCR_NL"],
            "s": row["sector"],
            "n": int(row["MS_COUNTOF_BANKRUPTCIES"]),
            "w": int(row["MS_COUNTOF_WORKERS"]),
        }
        for _, row in workers_sector.iterrows()
    ]
    workers_sector_json.sort(key=lambda x: (x["y"], x["s"], x["c"]))

    with open(RESULTS_DIR / "yearly_by_workers_sector.json", "w") as f:
        json.dump(workers_sector_json, f)

    # =========================================================================
    # LOOKUPS for UI
    # =========================================================================
    # Get all sectors that appear in the data
    sectors_in_data = sorted(df_be["sector"].unique())
    sectors_lookup = [
        {"code": s, "nl": SECTOR_NAMES.get(s, s)}
        for s in sectors_in_data
        if s in SECTOR_NAMES
    ]

    provinces_lookup = [
        {"code": str(code), "name": name}
        for code, name in sorted(BELGIAN_PROVINCES.items(), key=lambda x: x[1])
    ]

    # Duration lookup
    durations_lookup = [
        {"code": d, "short": duration_short[d]}
        for d in duration_order
    ]

    # Worker class lookup (get unique values from data)
    worker_classes = sorted(df_be["TX_EMPLOYMENT_CLASS_DESCR_NL"].dropna().unique())
    worker_classes_lookup = [
        {"code": c, "name": c}
        for c in worker_classes
    ]

    lookups = {
        "sectors": sectors_lookup,
        "provinces": provinces_lookup,
        "years": list(range(min_year, max_year + 1)),
        "construction_sector": "F",
        "durations": durations_lookup,
        "worker_classes": worker_classes_lookup,
    }

    with open(RESULTS_DIR / "lookups.json", "w") as f:
        json.dump(lookups, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # METADATA
    # =========================================================================
    metadata = {
        "min_year": min_year,
        "max_year": max_year,
        "max_month": max_month,
        "last_updated": datetime.now().isoformat(),
        "total_records": len(df_be),
        "construction_records": len(df_bouw),
        "source_url": "https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen",
    }

    with open(RESULTS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nProcessing complete!")
    print(f"Data range: {min_year} - {max_year}/{max_month}")
    print(f"Total Belgian records: {len(df_be)}")
    print(f"Construction sector records: {len(df_bouw)}")
    print(f"Output files saved to: {RESULTS_DIR}")


if __name__ == "__main__":
    df = download_data()
    process_data(df)
