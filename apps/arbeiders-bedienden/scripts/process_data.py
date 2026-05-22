#!/usr/bin/env python3
"""
Process RSZ employment data for construction sector (arbeiders vs bedienden).
Extracts data from Excel files (2013-2024) and generates time series data.
"""

import pandas as pd
import json
from pathlib import Path
import re

# Define paths
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "public" / "data"

# Sheet mapping based on excel-mapping.md
SHEETS = {
    "tabel8": {"type": "arbeiders", "gender": "mannen"},
    "tabel9": {"type": "arbeiders", "gender": "vrouwen"},
    "tabel10": {"type": "bedienden", "gender": "mannen"},
    "tabel11": {"type": "bedienden", "gender": "vrouwen"},
}

# Only keep province-level rows (exclude region totals and "niet nader bepaald")
PROVINCE_NAMES = {
    "Antwerpen",
    "Brussels Hoofdst. Gew.",
    "Henegouwen",
    "Limburg",
    "Luik",
    "Luxemburg",
    "Namen",
    "Oost-Vlaanderen",
    "Vlaams-Brabant",
    "Waals-Brabant",
    "West-Vlaanderen",
}

def extract_year_from_filename(filename):
    """Extract year from filename like 'localunit-val-nl-20134.xlsx'"""
    match = re.search(r'(\d{4})', filename)
    if match:
        return int(match.group(1))
    return None

def process_excel_file(file_path):
    """Process a single Excel file and extract construction sector data."""
    year = extract_year_from_filename(file_path.name)
    if not year:
        print(f"Could not extract year from {file_path.name}")
        return None

    results = []

    for sheet_name, metadata in SHEETS.items():
        try:
            # Read sheet, skip first 6 rows (merged cells with title)
            df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

            # Column U (index 20) contains "Bouwnijverheid" data
            # Row 7 (index 6) is header, data starts at row 8 (index 7)
            # Stop at row 37 (index 36) to exclude total at row 38

            # Extract province/region data (column A has provinces, B has arrondissements)
            # We'll focus on province-level data (where column A is not empty)

            # Scan all data rows and keep province-level entries only
            for idx in range(7, len(df)):  # Data starts at row 8 (0-indexed: 7)
                if idx >= len(df):
                    break

                province = df.iloc[idx, 0]  # Column A
                arrondissement = df.iloc[idx, 1]  # Column B

                # Skip if it's an arrondissement row (province is NaN/empty)
                if pd.isna(province) or str(province).strip() == '':
                    continue
                province = str(province).strip()
                if province not in PROVINCE_NAMES:
                    continue

                # Get construction sector value from column U (index 20)
                if 20 < len(df.columns):
                    value = df.iloc[idx, 20]  # Column U

                    # Clean and convert value
                    if pd.notna(value) and value != '':
                        try:
                            value = float(value)
                            results.append({
                                "year": year,
                                "province": province,
                                "type": metadata["type"],
                                "gender": metadata["gender"],
                                "count": int(value) if value == int(value) else value
                            })
                        except (ValueError, TypeError):
                            # Skip invalid values
                            pass

        except Exception as e:
            print(f"Error processing {file_path.name}, sheet {sheet_name}: {e}")
            continue

    return results

def aggregate_time_series(all_data):
    """Aggregate data into time series by year, type, and gender."""
    df = pd.DataFrame(all_data)

    # Group by year, type, and gender
    grouped = df.groupby(['year', 'type', 'gender'])['count'].sum().reset_index()

    # Create separate series for each combination
    time_series = []
    for _, row in grouped.iterrows():
        time_series.append({
            "year": int(row['year']),
            "type": row['type'],
            "gender": row['gender'],
            "count": int(row['count'])
        })

    return sorted(time_series, key=lambda x: (x['year'], x['type'], x['gender']))

def aggregate_by_type_only(all_data):
    """Aggregate data by year and type (arbeiders vs bedienden), summing genders."""
    df = pd.DataFrame(all_data)

    # Group by year and type only
    grouped = df.groupby(['year', 'type'])['count'].sum().reset_index()

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "year": int(row['year']),
            "type": row['type'],
            "count": int(row['count'])
        })

    return sorted(result, key=lambda x: (x['year'], x['type']))

def aggregate_total_by_year(all_data):
    """Aggregate total count by year (all types and genders combined)."""
    df = pd.DataFrame(all_data)

    # Group by year only
    grouped = df.groupby('year')['count'].sum().reset_index()

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "year": int(row['year']),
            "count": int(row['count'])
        })

    return sorted(result, key=lambda x: x['year'])

def aggregate_by_province(all_data):
    """Aggregate latest year data by province."""
    df = pd.DataFrame(all_data)

    # Filter out region-level aggregations (these are not provinces)
    region_names = ['Vlaams Gewest', 'Waals Gewest', 'Brussels Hoofdst. Gew.']
    # Note: Brussels is both a region AND a province, so we keep it
    exclude_regions = ['Vlaams Gewest', 'Waals Gewest']
    df = df[~df['province'].isin(exclude_regions)]

    # Get latest year
    latest_year = df['year'].max()
    df_latest = df[df['year'] == latest_year]

    # Group by province and type
    grouped = df_latest.groupby(['province', 'type'])['count'].sum().reset_index()

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "province": row['province'],
            "type": row['type'],
            "count": int(row['count'])
        })

    return result

def aggregate_time_series_by_province(all_data):
    """Aggregate time series data by year, province, and type."""
    df = pd.DataFrame(all_data)

    # Filter out region-level aggregations (these are not provinces)
    # Note: Brussels is both a region AND a province, so we keep it
    exclude_regions = ['Vlaams Gewest', 'Waals Gewest']
    df = df[~df['province'].isin(exclude_regions)]

    # Group by year, province, and type
    grouped = df.groupby(['year', 'province', 'type'])['count'].sum().reset_index()

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "year": int(row['year']),
            "province": row['province'],
            "type": row['type'],
            "count": int(row['count'])
        })

    return sorted(result, key=lambda x: (x['year'], x['province'], x['type']))

def main():
    """Main processing function."""
    print("Processing RSZ employment data for construction sector...")

    # Get all Excel files
    excel_files = sorted(DATA_DIR.glob("localunit-val-nl-*.xlsx"))
    print(f"Found {len(excel_files)} Excel files")

    all_data = []
    for file_path in excel_files:
        print(f"Processing {file_path.name}...")
        results = process_excel_file(file_path)
        if results:
            all_data.extend(results)

    print(f"Processed {len(all_data)} data points")

    # Generate aggregated datasets
    time_series_detailed = aggregate_time_series(all_data)
    time_series_by_type = aggregate_by_type_only(all_data)
    time_series_total = aggregate_total_by_year(all_data)
    province_data = aggregate_by_province(all_data)
    time_series_by_province = aggregate_time_series_by_province(all_data)

    # Save results
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    output_files = {
        "time_series_detailed.json": time_series_detailed,
        "time_series_by_type.json": time_series_by_type,
        "time_series_total.json": time_series_total,
        "province_latest.json": province_data,
        "time_series_by_province.json": time_series_by_province,
    }

    for filename, data in output_files.items():
        output_path = RESULTS_DIR / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Saved {output_path}")

    # Print summary
    print("\n=== Summary ===")
    print(f"Years covered: {min(d['year'] for d in all_data)} - {max(d['year'] for d in all_data)}")
    print(f"Total records: {len(all_data)}")
    print(f"Time series points (detailed): {len(time_series_detailed)}")
    print(f"Time series points (by type): {len(time_series_by_type)}")
    print(f"Time series points (total): {len(time_series_total)}")
    print(f"Province records (latest year): {len(province_data)}")

if __name__ == "__main__":
    main()
