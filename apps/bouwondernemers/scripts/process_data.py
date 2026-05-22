import json
import os
import re
import zipfile
from pathlib import Path

import pandas as pd
import requests

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "public" / "data"
CONTENT_FILE = BASE_DIR / "content.mdx"

# Data spans from 2017 to 2022 (and potentially newer years)
MIN_YEAR = 2017
MAX_YEAR = 2022  # We'll check for newer years


def update_mdx_frontmatter_date(path: Path, date_str: str) -> bool:
    """Update the sourcePublicationDate in MDX frontmatter."""
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
        if re.match(r"^sourcePublicationDate:\s*.*$", line):
            if not seen_date:
                new_fm_lines.append(f"sourcePublicationDate: {date_str}{newline}")
                updated = True
                seen_date = True
            else:
                updated = True
        else:
            new_fm_lines.append(line)

    if not seen_date:
        new_fm_lines.append(f"sourcePublicationDate: {date_str}{newline}")
        updated = True

    new_text = "".join([f"---{newline}", *new_fm_lines, f"---{newline}", *body_lines])
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    return updated


def download_and_extract_year(year: int) -> pd.DataFrame | None:
    """Download and extract data for a specific year.

    The Statbel files sometimes use different prefixes (TF_ vs VF_). Try both.
    """
    prefixes = ["TF", "VF"]

    print(f"Checking for year {year}...")

    for prefix in prefixes:
        url = f"https://statbel.fgov.be/sites/default/files/files/opendata/Datalab%20-%20ondernemers/{prefix}_ENTREP_NACE_{year}.zip"
        zip_path = DATA_DIR / f"{prefix}_ENTREP_NACE_{year}.zip"

        try:
            # Download
            with requests.get(url, stream=True, timeout=180) as r:
                r.raise_for_status()
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                with open(zip_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)

            # Extract
            with zipfile.ZipFile(zip_path, "r") as z:
                members = z.namelist()
                # Find the pipe-delimited file (should be .txt or similar)
                txt_file = None
                for m in members:
                    if m.endswith(".txt") or "ENTREP" in m.upper():
                        txt_file = m
                        break

                if not txt_file:
                    print(f"  No data file found in {year} archive (prefix={prefix})")
                    return None

                z.extract(txt_file, DATA_DIR)
                extracted_path = DATA_DIR / txt_file

                # Read the pipe-delimited file
                try:
                    df = pd.read_csv(
                        extracted_path,
                        sep="|",
                        encoding="utf-8-sig",
                        dtype=str,
                        low_memory=False,
                    )
                except UnicodeDecodeError:
                    df = pd.read_csv(
                        extracted_path,
                        sep="|",
                        encoding="latin-1",
                        dtype=str,
                        low_memory=False,
                    )

                # Add year column
                df["YEAR"] = year

                print(f"  Found {len(df)} rows for {year} (prefix={prefix})")
                return df

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"  Try next prefix: {prefix} not available (404)")
                continue
            raise
        except Exception as e:
            print(f"  Error processing {year} with prefix={prefix}: {e}")
            return None

    # If we get here, none of the prefixes worked
    print(f"  Year {year} not available (no matching prefix)")
    return None


def normalize_refnis_region(code: str | None) -> str | None:
    """Normalize REFNIS region codes."""
    if code is None:
        return None
    s = str(code).strip()
    if not s:
        return None
    if s.isdigit():
        s = s.lstrip("0") or "0"
    return s


def build_lookup(df: pd.DataFrame, code_col: str, nl_col: str, en_col: str) -> list[dict]:
    """Build lookup table from dataframe columns."""
    if code_col not in df.columns or nl_col not in df.columns:
        return []

    sub = (
        df[[code_col, nl_col, en_col] if en_col in df.columns else [code_col, nl_col]]
        .dropna(subset=[code_col])
        .drop_duplicates()
        .sort_values(code_col, kind="stable")
    )
    out = []
    for _, row in sub.iterrows():
        code = str(row[code_col]).strip()
        if not code:
            continue
        out.append(
            {
                "code": code,
                "nl": (str(row[nl_col]).strip() if pd.notna(row[nl_col]) else None),
                "en": (str(row[en_col]).strip() if en_col in df.columns and pd.notna(row[en_col]) else None),
            }
        )
    return out


def process_data() -> None:
    """Main processing function."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Try to download all years from MIN_YEAR to MAX_YEAR + 5 (check for new years)
    all_dfs = []
    latest_year = MIN_YEAR

    for year in range(MIN_YEAR, MAX_YEAR + 6):  # Check up to 5 years beyond known max
        df = download_and_extract_year(year)
        if df is not None:
            all_dfs.append(df)
            latest_year = max(latest_year, year)
        elif year > MAX_YEAR + 2:  # Stop if we don't find data for 3 consecutive years beyond MAX_YEAR
            break

    if not all_dfs:
        raise RuntimeError("No data files could be downloaded")

    # Combine all years
    df = pd.concat(all_dfs, ignore_index=True)
    print(f"\nTotal combined rows: {len(df)}")

    # Column mapping based on the header provided:
    # CD_NACE|TX_NACE_FR_LVL1|TX_NACE_NL_LVL1|TX_NACE_EN_LVL1|CD_RGN_REFNIS|TX_RGN_DESCR_FR|TX_RGN_DESCR_NL|TX_RGN_DESCR_EN|
    # CD_GENDER|TX_GENDER_DESCR_FR|TX_GENDER_DESCR_NL|TX_GENDER_DESCR_EN|CD_AGE_RANGE|AGE_RANGE_DESCR_FR|AGE_RANGE_DESCR_NL|
    # AGE_RANGE_DESCR_EN|MS_ENTREP_NUM

    # Normalize region codes
    if "CD_RGN_REFNIS" in df.columns:
        df["CD_RGN_REFNIS"] = df["CD_RGN_REFNIS"].map(normalize_refnis_region)

    # Convert numeric columns
    if "MS_ENTREP_NUM" in df.columns:
        df["MS_ENTREP_NUM"] = pd.to_numeric(df["MS_ENTREP_NUM"], errors="coerce")

    if "CD_NACE" not in df.columns:
        print("Warning: CD_NACE column not found, using all sectors")

    df_all = df.copy()
    print(f"Total rows for all sectors: {len(df_all)}")

    # Update frontmatter with latest year
    update_mdx_frontmatter_date(CONTENT_FILE, f"{latest_year}-12-31")

    # Build lookups
    lookups = {}
    if "CD_NACE" in df.columns and "TX_NACE_NL_LVL1" in df.columns:
        lookups["nace"] = build_lookup(df, "CD_NACE", "TX_NACE_NL_LVL1", "TX_NACE_EN_LVL1")
    if "CD_RGN_REFNIS" in df.columns and "TX_RGN_DESCR_NL" in df.columns:
        lookups["regions"] = build_lookup(df, "CD_RGN_REFNIS", "TX_RGN_DESCR_NL", "TX_RGN_DESCR_EN")
    if "CD_GENDER" in df.columns and "TX_GENDER_DESCR_NL" in df.columns:
        lookups["gender"] = build_lookup(df, "CD_GENDER", "TX_GENDER_DESCR_NL", "TX_GENDER_DESCR_EN")
    if "CD_AGE_RANGE" in df.columns and "AGE_RANGE_DESCR_NL" in df.columns:
        lookups["age_range"] = build_lookup(df, "CD_AGE_RANGE", "AGE_RANGE_DESCR_NL", "AGE_RANGE_DESCR_EN")

    # Aggregate data by different dimensions
    # 0. By year + region + sector + gender + age (full grain for cross-filters)
    group_cols_all = ["YEAR", "CD_RGN_REFNIS", "CD_NACE", "CD_GENDER", "CD_AGE_RANGE"]
    if all(col in df_all.columns for col in group_cols_all + ["MS_ENTREP_NUM"]):
        grouped_all = (
            df_all[group_cols_all + ["MS_ENTREP_NUM"]]
            .groupby(group_cols_all, dropna=False)["MS_ENTREP_NUM"]
            .sum(min_count=1)
            .reset_index()
        )
        grouped_all = grouped_all.rename(
            columns={
                "YEAR": "y",
                "CD_RGN_REFNIS": "r",
                "CD_NACE": "s",
                "CD_GENDER": "g",
                "CD_AGE_RANGE": "a",
                "MS_ENTREP_NUM": "v",
            }
        )
    else:
        grouped_all = pd.DataFrame()

    # 1. By year + region + sector
    group_cols_sector = ["YEAR", "CD_RGN_REFNIS", "CD_NACE"]
    if all(col in df_all.columns for col in group_cols_sector + ["MS_ENTREP_NUM"]):
        grouped_sector = (
            df_all[group_cols_sector + ["MS_ENTREP_NUM"]]
            .groupby(group_cols_sector, dropna=False)["MS_ENTREP_NUM"]
            .sum(min_count=1)
            .reset_index()
        )
        grouped_sector = grouped_sector.rename(
            columns={
                "YEAR": "y",
                "CD_RGN_REFNIS": "r",
                "CD_NACE": "s",
                "MS_ENTREP_NUM": "v",
            }
        )
    else:
        grouped_sector = pd.DataFrame()

    # 2. By year + region + gender
    group_cols_gender = ["YEAR", "CD_RGN_REFNIS", "CD_GENDER"]
    if all(col in df_all.columns for col in group_cols_gender + ["MS_ENTREP_NUM"]):
        grouped_gender = (
            df_all[group_cols_gender + ["MS_ENTREP_NUM"]]
            .groupby(group_cols_gender, dropna=False)["MS_ENTREP_NUM"]
            .sum(min_count=1)
            .reset_index()
        )
        grouped_gender = grouped_gender.rename(
            columns={
                "YEAR": "y",
                "CD_RGN_REFNIS": "r",
                "CD_GENDER": "g",
                "MS_ENTREP_NUM": "v",
            }
        )
    else:
        grouped_gender = pd.DataFrame()

    # 3. By year + region (for region comparison)
    group_cols_region = ["YEAR", "CD_RGN_REFNIS"]
    if all(col in df_all.columns for col in group_cols_region + ["MS_ENTREP_NUM"]):
        grouped_region = (
            df_all[group_cols_region + ["MS_ENTREP_NUM"]]
            .groupby(group_cols_region, dropna=False)["MS_ENTREP_NUM"]
            .sum(min_count=1)
            .reset_index()
        )
        grouped_region = grouped_region.rename(
            columns={
                "YEAR": "y",
                "CD_RGN_REFNIS": "r",
                "MS_ENTREP_NUM": "v",
            }
        )
    else:
        grouped_region = pd.DataFrame()

    # 4. By year + region + age
    group_cols_age = ["YEAR", "CD_RGN_REFNIS", "CD_AGE_RANGE"]
    if all(col in df_all.columns for col in group_cols_age + ["MS_ENTREP_NUM"]):
        grouped_age = (
            df_all[group_cols_age + ["MS_ENTREP_NUM"]]
            .groupby(group_cols_age, dropna=False)["MS_ENTREP_NUM"]
            .sum(min_count=1)
            .reset_index()
        )
        grouped_age = grouped_age.rename(
            columns={
                "YEAR": "y",
                "CD_RGN_REFNIS": "r",
                "CD_AGE_RANGE": "a",
                "MS_ENTREP_NUM": "v",
            }
        )
    else:
        grouped_age = pd.DataFrame()

    # Save all datasets
    if not grouped_all.empty:
        records_all = json.loads(grouped_all.to_json(orient="records"))
        (RESULTS_DIR / "by_all.json").write_text(
            json.dumps(records_all, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        grouped_all.to_csv(RESULTS_DIR / "by_all.csv", index=False)

    if not grouped_sector.empty:
        records_sector = json.loads(grouped_sector.to_json(orient="records"))
        (RESULTS_DIR / "by_sector.json").write_text(
            json.dumps(records_sector, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        grouped_sector.to_csv(RESULTS_DIR / "by_sector.csv", index=False)

    if not grouped_gender.empty:
        records_gender = json.loads(grouped_gender.to_json(orient="records"))
        (RESULTS_DIR / "by_gender.json").write_text(
            json.dumps(records_gender, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        grouped_gender.to_csv(RESULTS_DIR / "by_gender.csv", index=False)

    if not grouped_region.empty:
        records_region = json.loads(grouped_region.to_json(orient="records"))
        (RESULTS_DIR / "by_region.json").write_text(
            json.dumps(records_region, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        grouped_region.to_csv(RESULTS_DIR / "by_region.csv", index=False)

    if not grouped_age.empty:
        records_age = json.loads(grouped_age.to_json(orient="records"))
        (RESULTS_DIR / "by_age.json").write_text(
            json.dumps(records_age, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        grouped_age.to_csv(RESULTS_DIR / "by_age.csv", index=False)

    # Save lookups
    (RESULTS_DIR / "lookups.json").write_text(
        json.dumps(lookups, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )

    print("\nProcessing complete!")
    print(f"  - by_all: {len(records_all) if not grouped_all.empty else 0} records")
    print(f"  - by_sector: {len(records_sector) if not grouped_sector.empty else 0} records")
    print(f"  - by_gender: {len(records_gender) if not grouped_gender.empty else 0} records")
    print(f"  - by_region: {len(records_region) if not grouped_region.empty else 0} records")
    print(f"  - by_age: {len(records_age) if not grouped_age.empty else 0} records")


if __name__ == "__main__":
    process_data()
