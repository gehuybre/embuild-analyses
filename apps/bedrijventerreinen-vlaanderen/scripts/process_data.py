#!/usr/bin/env python3
"""
Process bedrijventerreinen bezettingsgraad data
"""
import pandas as pd
import json
import numpy as np
from pathlib import Path

# Define paths
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "public" / "data"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Load data
df = pd.read_csv(
    DATA_DIR / "bezettingsgraad.csv",
    sep=";",
    encoding="utf-8"
)

print(f"Loaded {len(df)} rows")
print(f"Columns: {df.columns.tolist()}")
print(f"\nFirst few rows:\n{df.head()}")

# Clean column names
df.columns = df.columns.str.strip()

# Convert numeric columns
df['Bezette oppervlakte bedrijventerreinen'] = pd.to_numeric(
    df['Bezette oppervlakte bedrijventerreinen'].astype(str).str.replace(',', '.'),
    errors='coerce'
)
df['Totale oppervlakte bedrijventerreinen'] = pd.to_numeric(
    df['Totale oppervlakte bedrijventerreinen'].astype(str).str.replace(',', '.'),
    errors='coerce'
)

# Calculate percentage where missing
df['Procent (%)'] = pd.to_numeric(
    df['Procent (%)'].astype(str).str.replace(',', '.'),
    errors='coerce'
)

# Fill missing percentages
mask = df['Procent (%)'].isna()
df.loc[mask, 'Procent (%)'] = (
    100 * df.loc[mask, 'Bezette oppervlakte bedrijventerreinen'] /
    df.loc[mask, 'Totale oppervlakte bedrijventerreinen']
)

print(f"\nData after cleaning:")
print(df.head(20))

# === 1. Time series for Vlaams Gewest ===
vlaanderen_ts = df[df['NIS-code'] == 2000].copy()
vlaanderen_ts = vlaanderen_ts.sort_values('Jaar')
print(f"\nVlaanderen time series: {len(vlaanderen_ts)} rows")

time_series = []
for _, row in vlaanderen_ts.iterrows():
    time_series.append({
        'year': int(row['Jaar']),
        'bezette_oppervlakte': round(float(row['Bezette oppervlakte bedrijventerreinen']), 2) if pd.notna(row['Bezette oppervlakte bedrijventerreinen']) else None,
        'totale_oppervlakte': round(float(row['Totale oppervlakte bedrijventerreinen']), 2) if pd.notna(row['Totale oppervlakte bedrijventerreinen']) else None,
        'bezettingsgraad': round(float(row['Procent (%)']), 2) if pd.notna(row['Procent (%)']) else None,
        'onbezette_oppervlakte': round(
            float(row['Totale oppervlakte bedrijventerreinen']) -
            float(row['Bezette oppervlakte bedrijventerreinen']),
            2
        ) if pd.notna(row['Totale oppervlakte bedrijventerreinen']) and pd.notna(row['Bezette oppervlakte bedrijventerreinen']) else None
    })

with open(RESULTS_DIR / "time_series.json", "w", encoding="utf-8") as f:
    json.dump(time_series, f, indent=2, ensure_ascii=False)

print(f"\n✓ Exported {len(time_series)} time series records")

# === 2. Geographic data for latest year ===
latest_year = df['Jaar'].max()
print(f"\nLatest year: {latest_year}")

latest_data = df[df['Jaar'] == latest_year].copy()

# Filter out regions/provinces (NIS codes > 10000 are municipalities)
municipalities = latest_data[latest_data['NIS-code'].astype(str).str.len() == 5].copy()

geo_data = []
for _, row in municipalities.iterrows():
    nis_code = str(row['NIS-code']).zfill(5)
    bezette = row['Bezette oppervlakte bedrijventerreinen']
    totale = row['Totale oppervlakte bedrijventerreinen']
    percentage = row['Procent (%)']

    geo_data.append({
        'nis_code': nis_code,
        'gemeente': row['Gemeente'],
        'bezette_oppervlakte': round(float(bezette), 2) if pd.notna(bezette) else None,
        'totale_oppervlakte': round(float(totale), 2) if pd.notna(totale) else None,
        'bezettingsgraad': round(float(percentage), 2) if pd.notna(percentage) else None,
        'onbezette_oppervlakte': round(float(totale) - float(bezette), 2) if pd.notna(totale) and pd.notna(bezette) else None,
        'year': int(latest_year)
    })

with open(RESULTS_DIR / "geographic_data.json", "w", encoding="utf-8") as f:
    json.dump(geo_data, f, indent=2, ensure_ascii=False)

print(f"✓ Exported {len(geo_data)} municipality records for {latest_year}")

# === 3. All years geographic data (for time slider) ===
all_years_geo = []
for year in sorted(df['Jaar'].unique()):
    year_data = df[df['Jaar'] == year].copy()
    municipalities_year = year_data[year_data['NIS-code'].astype(str).str.len() == 5].copy()

    for _, row in municipalities_year.iterrows():
        nis_code = str(row['NIS-code']).zfill(5)
        bezette = row['Bezette oppervlakte bedrijventerreinen']
        totale = row['Totale oppervlakte bedrijventerreinen']
        percentage = row['Procent (%)']

        all_years_geo.append({
            'nis_code': nis_code,
            'gemeente': row['Gemeente'],
            'year': int(year),
            'bezette_oppervlakte': round(float(bezette), 2) if pd.notna(bezette) else None,
            'totale_oppervlakte': round(float(totale), 2) if pd.notna(totale) else None,
            'bezettingsgraad': round(float(percentage), 2) if pd.notna(percentage) else None,
            'onbezette_oppervlakte': round(float(totale) - float(bezette), 2) if pd.notna(totale) and pd.notna(bezette) else None
        })

with open(RESULTS_DIR / "all_years_geographic.json", "w", encoding="utf-8") as f:
    json.dump(all_years_geo, f, indent=2, ensure_ascii=False)

print(f"✓ Exported {len(all_years_geo)} municipality-year records")

# === 4. Summary statistics ===
summary = {
    'latest_year': int(latest_year),
    'years_available': [int(y) for y in sorted(df['Jaar'].unique())],
    'total_municipalities': len(geo_data),
}

# Add Vlaanderen data if available
if time_series:
    summary['vlaanderen_latest'] = {
        'bezette_oppervlakte': round(float(time_series[-1]['bezette_oppervlakte']), 2),
        'totale_oppervlakte': round(float(time_series[-1]['totale_oppervlakte']), 2),
        'bezettingsgraad': round(float(time_series[-1]['bezettingsgraad']), 2),
        'onbezette_oppervlakte': round(float(time_series[-1]['onbezette_oppervlakte']), 2)
    }

with open(RESULTS_DIR / "summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

print(f"\n✓ Exported summary statistics")
print(f"\nSummary:")
print(f"  Years: {summary['years_available'][0]} - {summary['years_available'][-1]}")
print(f"  Municipalities: {summary['total_municipalities']}")

if 'vlaanderen_latest' in summary:
    print(f"  Vlaanderen {latest_year}:")
    print(f"    - Bezette oppervlakte: {summary['vlaanderen_latest']['bezette_oppervlakte']} ha")
    print(f"    - Totale oppervlakte: {summary['vlaanderen_latest']['totale_oppervlakte']} ha")
    print(f"    - Bezettingsgraad: {summary['vlaanderen_latest']['bezettingsgraad']}%")
    print(f"    - Onbezette oppervlakte: {summary['vlaanderen_latest']['onbezette_oppervlakte']} ha")

print("\n✅ All data processed successfully!")
