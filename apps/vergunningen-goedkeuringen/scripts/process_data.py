#!/usr/bin/env python3
"""Download and process Statbel building permits data.

Outputs JSON files to public/data/ for the Next.js frontend.
"""

import json
import hashlib
import os
import shutil
import subprocess
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
OUTPUT_DIR = APP_DIR / "public" / "data"

INPUT_URL = os.environ.get("INPUT_URL") or os.environ.get("BV_DATA_URL")
REMOTE_METADATA_PATH = DATA_DIR / ".remote_metadata.json"


def write_remote_metadata(url: str, headers: dict, sha: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {
        "url": url,
        "etag": headers.get("etag") or headers.get("ETag"),
        "last_modified": headers.get("last-modified") or headers.get("Last-Modified"),
        "sha256": sha,
    }
    REMOTE_METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def resolve_downloaded_input(download_path: Path) -> Path:
    if not zipfile.is_zipfile(download_path):
        print(f"Downloaded file {download_path} is not a ZIP; treating as pipe-delimited text.")
        return download_path

    print(f"Extracting ZIP {download_path}...")
    with zipfile.ZipFile(download_path, "r") as archive:
        archive.extractall(DATA_DIR)
        candidates = [p for p in archive.namelist() if p.lower().endswith((".txt", ".csv"))]
        preferred = next(
            (c for c in candidates if "building" in c.lower() or "tf_building" in c.lower()),
            candidates[0] if candidates else None,
        )
        if preferred:
            extracted = DATA_DIR / Path(preferred).name
            print(f"Using extracted file: {extracted}")
            return extracted

    print("No text/csv found inside ZIP; using download path directly.")
    return download_path


def download_file(url: str, dest: Path) -> None:
    """Download with requests, falling back to curl."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for attempt in range(1, 3):
        try:
            print(f"Downloading {url} -> {dest} (attempt {attempt})...")
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            with requests.get(url, headers=headers, stream=True, timeout=120) as r:
                r.raise_for_status()
                ct = r.headers.get("content-type", "")
                if "text/html" in ct:
                    raise ValueError(f"Server returned HTML (content-type: {ct})")
                digest = hashlib.sha256()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            digest.update(chunk)
                write_remote_metadata(url, r.headers, digest.hexdigest())
            return
        except (requests.RequestException, IOError, ValueError) as e:
            print(f"Attempt {attempt} failed: {e}")
            if attempt < 2:
                time.sleep(2)

    # Fallback: curl
    print("Trying curl fallback...")
    result = subprocess.run(
        ["curl", "-L", "-f", "-o", str(dest), "--max-time", "120",
         "-H", "User-Agent: Mozilla/5.0", url],
        capture_output=True, text=True, timeout=130,
    )
    if result.returncode != 0:
        raise RuntimeError(f"All download methods failed. curl: {result.stderr}")
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    write_remote_metadata(url, {}, digest)


def validate_download(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Download not found: {path}")
    size = path.stat().st_size
    print(f"Downloaded file size: {size} bytes")
    with open(path, "rb") as f:
        preview = f.read(1024).decode("utf-8", errors="ignore")
        if any(tag in preview.lower() for tag in ("<html", "<!doctype", "<body")):
            raise ValueError("Server returned HTML instead of data file.")


def process_data() -> None:
    if not INPUT_URL:
        raise RuntimeError("INPUT_URL environment variable is required")

    fname = os.environ.get("INPUT_FILENAME") or Path(INPUT_URL).name or "BV_opendata_latest.zip"
    download_path = DATA_DIR / fname

    download_file(INPUT_URL, download_path)
    validate_download(download_path)
    input_file = resolve_downloaded_input(download_path)

    print(f"Reading {input_file}...")
    try:
        df = pd.read_csv(input_file, encoding="utf-8", sep="|", low_memory=False)
    except Exception:
        df = pd.read_csv(input_file, encoding="latin1", sep="|", low_memory=False)

    # Filter for municipalities (Level 5), exclude yearly totals (Period 0)
    df_mun = df[df["CD_REFNIS_LEVEL"] == 5].copy()
    df_mun = df_mun[df_mun["CD_PERIOD"] != 0]
    df_mun["Quarter"] = (df_mun["CD_PERIOD"] - 1) // 3 + 1

    cols = [
        "CD_YEAR", "Quarter", "CD_REFNIS_MUNICIPALITY", "REFNIS_NL",
        "MS_BUILDING_RES_RENOVATION", "MS_DWELLING_RES_NEW",
        "MS_APARTMENT_RES_NEW", "MS_SINGLE_HOUSE_RES_NEW",
    ]
    df_subset = df_mun[cols]

    # Quarterly aggregation
    print("Aggregating by quarter...")
    df_agg = df_subset.groupby(
        ["CD_YEAR", "Quarter", "CD_REFNIS_MUNICIPALITY", "REFNIS_NL"]
    ).sum().reset_index()

    municipalities = (
        df_agg[["CD_REFNIS_MUNICIPALITY", "REFNIS_NL"]]
        .drop_duplicates()
        .sort_values("REFNIS_NL")
        .rename(columns={"CD_REFNIS_MUNICIPALITY": "code", "REFNIS_NL": "name"})
        .to_dict(orient="records")
    )

    df_agg = df_agg.rename(columns={
        "CD_YEAR": "y", "Quarter": "q", "CD_REFNIS_MUNICIPALITY": "m",
        "MS_BUILDING_RES_RENOVATION": "ren", "MS_DWELLING_RES_NEW": "dwell",
        "MS_APARTMENT_RES_NEW": "apt", "MS_SINGLE_HOUSE_RES_NEW": "house",
    })
    data_quarterly = df_agg[["y", "q", "m", "ren", "dwell", "apt", "house"]].to_dict(orient="records")

    # Monthly aggregation
    print("Aggregating by month...")
    df_month = df_mun.rename(columns={"CD_PERIOD": "mo"})
    df_month = df_month.groupby(["CD_YEAR", "mo", "CD_REFNIS_MUNICIPALITY", "REFNIS_NL"])[
        ["MS_BUILDING_RES_RENOVATION", "MS_DWELLING_RES_NEW", "MS_APARTMENT_RES_NEW", "MS_SINGLE_HOUSE_RES_NEW"]
    ].sum().reset_index()
    df_month = df_month.rename(columns={
        "CD_YEAR": "y", "CD_REFNIS_MUNICIPALITY": "m",
        "MS_BUILDING_RES_RENOVATION": "ren", "MS_DWELLING_RES_NEW": "dwell",
        "MS_APARTMENT_RES_NEW": "apt", "MS_SINGLE_HOUSE_RES_NEW": "house",
    })
    data_monthly = df_month[["y", "mo", "m", "ren", "dwell", "apt", "house"]].to_dict(orient="records")

    # Write output
    print(f"Writing output to {OUTPUT_DIR}...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_DIR / "data_quarterly.json", "w") as f:
        json.dump(data_quarterly, f)
    with open(OUTPUT_DIR / "data_monthly.json", "w") as f:
        json.dump(data_monthly, f)
    with open(OUTPUT_DIR / "municipalities.json", "w") as f:
        json.dump(municipalities, f)

    # Per-year files for map
    yearly_dir = OUTPUT_DIR / "yearly"
    reset_dir(yearly_dir)
    years = sorted(df_agg["y"].unique())
    yearly_index = []
    for year in years:
        df_year = df_agg[df_agg["y"] == year][["y", "m", "ren", "dwell", "apt", "house"]]
        year_file = yearly_dir / f"year_{year}.json"
        df_year.to_json(year_file, orient="records", force_ascii=False)
        yearly_index.append({"year": int(year), "file": f"yearly/year_{year}.json"})
    with open(OUTPUT_DIR / "yearly_index.json", "w") as f:
        json.dump(yearly_index, f)

    # Per-municipality monthly series (2019+)
    mun_dir = OUTPUT_DIR / "municipality"
    reset_dir(mun_dir)
    df_month_recent = df_month[df_month["y"] > 2018]
    municipality_index = []
    for mun_code, grp in df_month_recent.groupby("m"):
        series = grp.sort_values(["y", "mo"])[["y", "mo", "ren", "dwell", "apt", "house"]].to_dict(orient="records")
        code = str(int(mun_code)).zfill(5)
        mun_file = mun_dir / f"{code}.json"
        with open(mun_file, "w") as f:
            json.dump(series, f, ensure_ascii=False)
        municipality_index.append({
            "code": code,
            "file": f"municipality/{code}.json",
            "years": [int(min(r["y"] for r in series)), int(max(r["y"] for r in series))],
        })
    with open(OUTPUT_DIR / "municipality_index.json", "w") as f:
        json.dump(municipality_index, f)

    print("Done.")


if __name__ == "__main__":
    process_data()
