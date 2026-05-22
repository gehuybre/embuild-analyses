#!/usr/bin/env python3
"""
Consolidate arrondissement data into unified CSV files for the betaalbaar-arr blog post.

This script reads all municipality CSV files from data/nis/ and creates two consolidated files:
1. municipalities.csv - All municipality-level data
2. arrondissements.csv - Aggregated arrondissement-level data

Usage:
    python src/consolidate_data.py
"""

import pandas as pd
import glob
import os
from pathlib import Path

# Paths
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / 'data' / 'nis'
RESULTS_DIR = APP_DIR / 'public' / 'data'
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Expected numeric columns
NUMERIC_COLS = [
    'Huizen_totaal_2025', 'Appartementen_2025',
    'Woningen_Nieuwbouw_2019sep-2022aug', 'Woningen_Nieuwbouw_2022sep-2025aug',
    'Woningen_Nieuwbouw_pct_verschil_36m',
    'Gebouwen_Renovatie_2019sep-2022aug', 'Gebouwen_Renovatie_2022sep-2025aug',
    'Gebouwen_Renovatie_pct_verschil_36m',
    'hh_1_2025', 'hh_2_2025', 'hh_3_2025', 'hh_4+_2025',
    'hh_1_pct_toename', 'hh_2_pct_toename', 'hh_3_pct_toename', 'hh_4+_pct_toename',
    'hh_1_abs_toename', 'hh_2_abs_toename', 'hh_3_abs_toename', 'hh_4+_abs_toename'
]

def load_municipalities():
    """Load all municipality CSVs and concatenate them."""
    csv_files = [p for p in glob.glob(str(DATA_DIR / '*.csv'))
                 if os.path.basename(p) not in ('refnis.csv', 'fusies-2025.csv')]

    if not csv_files:
        raise FileNotFoundError(f'No CSV files found in {DATA_DIR} (excluding refnis)')

    print(f"Found {len(csv_files)} arrondissement files")

    dfs = []
    for path in csv_files:
        try:
            df = pd.read_csv(path, dtype={'CD_REFNIS': str, 'CD_SUP_REFNIS': str})
            # Drop entirely empty columns
            df = df.dropna(axis=1, how='all')
            dfs.append(df)
            print(f"  Loaded {os.path.basename(path)}: {len(df)} municipalities")
        except Exception as e:
            print(f"  Warning: Could not load {path}: {e}")

    if not dfs:
        raise ValueError("No dataframes loaded")

    # Concatenate all dataframes
    df_all = pd.concat(dfs, ignore_index=True, sort=False)

    # Remove duplicates based on CD_REFNIS (keep first occurrence)
    print(f"  Total rows before deduplication: {len(df_all)}")
    df_all = df_all.drop_duplicates(subset=['CD_REFNIS'], keep='first')
    print(f"  Total rows after deduplication: {len(df_all)}")

    # Ensure numeric columns are properly typed
    for col in NUMERIC_COLS:
        if col in df_all.columns:
            df_all[col] = pd.to_numeric(df_all[col], errors='coerce')

    # Handle HH_available flag
    if 'HH_available' in df_all.columns:
        df_all['HH_available'] = df_all['HH_available'].fillna(False).astype(bool)

    print(f"\nTotal unique municipalities loaded: {len(df_all)}")
    return df_all

def create_arrondissement_aggregates(df_municipalities):
    """Create arrondissement-level aggregates from municipality data."""
    # Load arrondissement reference data
    refnis = pd.read_csv(DATA_DIR / 'refnis.csv', dtype=str)
    arr_map = (refnis[refnis['LVL_REFNIS'] == '3'][['CD_REFNIS', 'TX_REFNIS_NL']]
               .drop_duplicates()
               .rename(columns={'CD_REFNIS': 'CD_ARR', 'TX_REFNIS_NL': 'TX_ARR_NL'}))

    # Columns to aggregate by summing
    agg_cols = [col for col in [
        'Huizen_totaal_2025', 'Appartementen_2025',
        'Woningen_Nieuwbouw_2019sep-2022aug', 'Woningen_Nieuwbouw_2022sep-2025aug',
        'Gebouwen_Renovatie_2019sep-2022aug', 'Gebouwen_Renovatie_2022sep-2025aug',
        'hh_1_2025', 'hh_2_2025', 'hh_3_2025', 'hh_4+_2025',
        'hh_1_abs_toename', 'hh_2_abs_toename', 'hh_3_abs_toename', 'hh_4+_abs_toename'
    ] if col in df_municipalities.columns]

    # Group by arrondissement and sum
    df_agg = (df_municipalities.groupby('CD_SUP_REFNIS', as_index=False)[agg_cols]
              .sum()
              .rename(columns={'CD_SUP_REFNIS': 'CD_ARR'}))

    # Merge with arrondissement names
    df_agg = df_agg.merge(arr_map, on='CD_ARR', how='left')

    # Calculate derived metrics
    if 'Huizen_totaal_2025' in df_agg.columns and 'Appartementen_2025' in df_agg.columns:
        df_agg['Flats_ratio'] = (
            (df_agg['Appartementen_2025'] / df_agg['Huizen_totaal_2025'].replace({0: pd.NA}) * 100)
            .fillna(0)
            .round(2)
        )

    # Calculate percentage changes at arrondissement level
    if all(col in df_agg.columns for col in ['Woningen_Nieuwbouw_2019sep-2022aug', 'Woningen_Nieuwbouw_2022sep-2025aug']):
        old = df_agg['Woningen_Nieuwbouw_2019sep-2022aug'].replace({0: pd.NA})
        new = df_agg['Woningen_Nieuwbouw_2022sep-2025aug']
        df_agg['Woningen_Nieuwbouw_pct_verschil_36m'] = ((new - old) / old * 100).round(2)

    if all(col in df_agg.columns for col in ['Gebouwen_Renovatie_2019sep-2022aug', 'Gebouwen_Renovatie_2022sep-2025aug']):
        old = df_agg['Gebouwen_Renovatie_2019sep-2022aug'].replace({0: pd.NA})
        new = df_agg['Gebouwen_Renovatie_2022sep-2025aug']
        df_agg['Gebouwen_Renovatie_pct_verschil_36m'] = ((new - old) / old * 100).round(2)

    # Calculate weighted average percentage changes for household data
    hh_pct_cols = ['hh_1_pct_toename', 'hh_2_pct_toename', 'hh_3_pct_toename', 'hh_4+_pct_toename']
    hh_2025_cols = ['hh_1_2025', 'hh_2_2025', 'hh_3_2025', 'hh_4+_2025']

    for pct_col, base_col in zip(hh_pct_cols, hh_2025_cols):
        if pct_col in df_municipalities.columns and base_col in df_municipalities.columns:
            # Calculate weighted average: (sum of increases) / (sum of base) * 100
            grouped = df_municipalities.groupby('CD_SUP_REFNIS')
            weighted_avg = (
                grouped.apply(lambda x: (x[pct_col] * x[base_col]).sum() / x[base_col].sum() * 100
                             if x[base_col].sum() > 0 else 0, include_groups=False)
                .reset_index()
                .rename(columns={0: pct_col, 'CD_SUP_REFNIS': 'CD_ARR'})
            )
            df_agg = df_agg.merge(weighted_avg, on='CD_ARR', how='left')

    # Total household increase
    hh_abs_cols = [c for c in ['hh_1_abs_toename', 'hh_2_abs_toename', 'hh_3_abs_toename', 'hh_4+_abs_toename']
                   if c in df_agg.columns]
    if hh_abs_cols:
        df_agg['Totaal_hh_toename'] = df_agg[hh_abs_cols].sum(axis=1)

    # Reorder columns: identifiers first, then data columns
    id_cols = ['CD_ARR', 'TX_ARR_NL']
    other_cols = [c for c in df_agg.columns if c not in id_cols]
    df_agg = df_agg[id_cols + other_cols]

    print(f"Created aggregates for {len(df_agg)} arrondissements")
    return df_agg

def main():
    """Main consolidation routine."""
    print("=== Betaalbaar-Arr Data Consolidation ===\n")

    # Step 1: Load municipality data
    print("Step 1: Loading municipality data...")
    df_municipalities = load_municipalities()

    # Step 2: Save municipality data
    print("\nStep 2: Saving municipalities.csv...")
    output_path = RESULTS_DIR / 'municipalities.csv'
    df_municipalities.to_csv(output_path, index=False)
    print(f"  Saved to {output_path} ({len(df_municipalities)} rows)")

    # Step 3: Create arrondissement aggregates
    print("\nStep 3: Creating arrondissement aggregates...")
    df_arrondissements = create_arrondissement_aggregates(df_municipalities)

    # Step 4: Save arrondissement data
    print("\nStep 4: Saving arrondissements.csv...")
    output_path = RESULTS_DIR / 'arrondissements.csv'
    df_arrondissements.to_csv(output_path, index=False)
    print(f"  Saved to {output_path} ({len(df_arrondissements)} rows)")

    print("\n=== Consolidation Complete ===")
    print(f"Output files in: {RESULTS_DIR}")
    print("  - municipalities.csv")
    print("  - arrondissements.csv")

if __name__ == '__main__':
    main()
