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
METADATA_XLSX = DATA_DIR / "metadata-VAR_VAT_SURVIVALS.xlsx"
OUTPUT_METADATA_FILE = RESULTS_DIR / "metadata.json"

DEFAULT_INPUT_URL = "https://statbel.fgov.be/sites/default/files/files/opendata/TF_VAT_SURVIVAL/TF_VAT_SURVIVALS.zip"
DEFAULT_ZIP_NAME = "TF_VAT_SURVIVALS.zip"

COUNT_COLS = [
    "MS_CNT_FIRST_REGISTRATIONS",
    "MS_CNT_SURV_YEAR_1",
    "MS_CNT_SURV_YEAR_2",
    "MS_CNT_SURV_YEAR_3",
    "MS_CNT_SURV_YEAR_4",
    "MS_CNT_SURV_YEAR_5",
]


def update_mdx_frontmatter_date(path: Path, date_str: str) -> bool:
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


def download_input_zip(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
    return dest


def extract_txt_from_zip(zip_path: Path, extract_dir: Path) -> Path:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        members = z.namelist()
        candidates = [m for m in members if m.lower().endswith(".txt")]
        chosen = None
        for m in candidates:
            if "vat" in m.lower() and "surviv" in m.lower():
                chosen = m
                break
        chosen = chosen or (candidates[0] if candidates else None)
        if not chosen:
            raise RuntimeError("No .txt file found in ZIP")
        z.extract(chosen, extract_dir)
        return extract_dir / Path(chosen).name


def build_lookup(df: pd.DataFrame, code_col: str, nl_col: str, en_col: str) -> list[dict]:
    sub = (
        df[[code_col, nl_col, en_col]]
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
                "en": (str(row[en_col]).strip() if pd.notna(row[en_col]) else None),
            }
        )
    return out


def process_data() -> None:
    input_url = os.environ.get("INPUT_URL") or DEFAULT_INPUT_URL
    input_file_path = os.environ.get("INPUT_FILE_PATH")
    input_filename = os.environ.get("INPUT_FILENAME") or DEFAULT_ZIP_NAME

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    txt_path: Path | None = None
    if input_file_path and Path(input_file_path).exists():
        p = Path(input_file_path)
        if p.suffix.lower() == ".zip":
            txt_path = extract_txt_from_zip(p, DATA_DIR)
        else:
            txt_path = p
    else:
        zip_path = DATA_DIR / input_filename
        download_input_zip(input_url, zip_path)
        txt_path = extract_txt_from_zip(zip_path, DATA_DIR)

    df = pd.read_csv(
        txt_path,
        sep="|",
        encoding="utf-8-sig",
        dtype=str,
        low_memory=False,
    )

    def normalize_refnis_region(code: str | None) -> str | None:
        if code is None:
            return None
        s = str(code).strip()
        if not s:
            return None
        if s.isdigit():
            s = s.lstrip("0") or "0"
        return s

    df["CD_RGN_REFNIS"] = df["CD_RGN_REFNIS"].map(normalize_refnis_region)

    for c in COUNT_COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["CD_YEAR"] = pd.to_numeric(df["CD_YEAR"], errors="coerce").astype("Int64")

    max_year = int(df["CD_YEAR"].max())
    update_mdx_frontmatter_date(CONTENT_FILE, f"{max_year}-12-31")

    group_cols = ["CD_YEAR", "CD_RGN_REFNIS", "CD_PROV_REFNIS", "CD_NACE_LVL1"]
    grouped = (
        df[group_cols + COUNT_COLS]
        .groupby(group_cols, dropna=False)[COUNT_COLS]
        .sum(min_count=1)
        .reset_index()
    )

    grouped = grouped.rename(
        columns={
            "CD_YEAR": "y",
            "CD_RGN_REFNIS": "r",
            "CD_PROV_REFNIS": "p",
            "CD_NACE_LVL1": "n1",
            "MS_CNT_FIRST_REGISTRATIONS": "fr",
            "MS_CNT_SURV_YEAR_1": "s1",
            "MS_CNT_SURV_YEAR_2": "s2",
            "MS_CNT_SURV_YEAR_3": "s3",
            "MS_CNT_SURV_YEAR_4": "s4",
            "MS_CNT_SURV_YEAR_5": "s5",
        }
    )

    lookups = {
        "legal_company_type": build_lookup(df, "CD_LGL_CO_TYP", "TX_LGL_CO_TYP_NL", "TX_LGL_CO_TYP_EN"),
        "regions": build_lookup(df, "CD_RGN_REFNIS", "TX_RGN_DESCR_NL", "TX_RGN_DESCR_EN"),
        "provinces": build_lookup(df, "CD_PROV_REFNIS", "TX_PROV_DESCR_NL", "TX_PROV_DESCR_EN"),
        "worker_class": build_lookup(df, "CD_CLS_WRKR", "TX_CLS_WRKR_NL", "TX_CLS_WRKR_EN"),
        "nace_lvl1": build_lookup(df, "CD_NACE_LVL1", "TX_NACE_LVL1_DESCR_NL", "TX_NACE_LVL1_DESCR_EN"),
        "nace_lvl2": build_lookup(df, "CD_NACE_LVL2", "TX_NACE_LVL2_DESCR_NL", "TX_NACE_LVL2_DESCR_EN"),
    }

    def rate(surv: float | None, base: float | None) -> float | None:
        if surv is None or base is None or not base:
            return None
        return float(surv) / float(base)

    grouped["r1"] = grouped.apply(lambda row: rate(row["s1"], row["fr"]), axis=1)
    grouped["r2"] = grouped.apply(lambda row: rate(row["s2"], row["fr"]), axis=1)
    grouped["r3"] = grouped.apply(lambda row: rate(row["s3"], row["fr"]), axis=1)
    grouped["r4"] = grouped.apply(lambda row: rate(row["s4"], row["fr"]), axis=1)
    grouped["r5"] = grouped.apply(lambda row: rate(row["s5"], row["fr"]), axis=1)

    records = json.loads(grouped.to_json(orient="records"))

    (RESULTS_DIR / "vat_survivals.json").write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    (RESULTS_DIR / "lookups.json").write_text(
        json.dumps(lookups, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )

    if METADATA_XLSX.exists():
        meta_df = pd.read_excel(METADATA_XLSX)
        meta_df = meta_df.rename(
            columns={
                "Variable": "Naam/Nom/Name",
                "Omschrijving NL": "Beschrijving",
                "Description FR": "Description",
                "Description EN": "Description EN",
            }
        )
        meta_cols = ["Naam/Nom/Name", "Beschrijving", "Description", "Description EN"]
        for c in meta_cols:
            if c not in meta_df.columns:
                meta_df[c] = None
        meta_records = meta_df[meta_cols].where(pd.notna(meta_df), None).to_dict(orient="records")
        OUTPUT_METADATA_FILE.write_text(
            json.dumps(meta_records, ensure_ascii=False, indent=2, allow_nan=False),
            encoding="utf-8",
        )

    csv_cols = ["y", "r", "p", "n1", "fr", "s1", "s2", "s3", "s4", "s5", "r1", "r2", "r3", "r4", "r5"]
    pd.DataFrame.from_records(records)[csv_cols].to_csv(RESULTS_DIR / "vat_survivals.csv", index=False)


if __name__ == "__main__":
    process_data()
