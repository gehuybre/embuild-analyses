"""
Process energiekaart premies data from PowerBI CSV exports to JSON format.

This script transforms the CSV files from the PowerBI dashboard into JSON files
suitable for visualization in the Next.js blog.
"""

import json
import pandas as pd
from pathlib import Path

# Paths
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
OUTPUT_DIR = APP_DIR / "public" / "data"
AANTAL_CSV = DATA_DIR / "premies-res-tijdreeks-algemeen__default__Algemene Totalen__pivottable__Matrix__Aantal.csv"
BEDRAG_CSV = DATA_DIR / "premies-res-tijdreeks-algemeen__default__Algemene Totalen__pivottable__Matrix__Totaal bedrag.csv"
AANTAL_BESCHERMD_CSV = DATA_DIR / "premies-res-tijdreeks-algemeen__default__Totalen Beschermde Afnemers__pivottable__Matrix__Aantal.csv"
BEDRAG_BESCHERMD_CSV = DATA_DIR / "premies-res-tijdreeks-algemeen__default__Totalen Beschermde Afnemers__pivottable__Matrix__Totaal bedrag.csv"

OUTPUT_YEARLY_JSON = OUTPUT_DIR / "data_yearly.json"
OUTPUT_MEASURES_JSON = OUTPUT_DIR / "measures.json"
OUTPUT_METADATA_JSON = OUTPUT_DIR / "processed_metadata.json"


def parse_number(num_str):
    """Parse Belgian number format '1.234' to float."""
    if pd.isna(num_str) or num_str == "" or num_str == 0:
        return 0.0
    # Remove dots (thousand separators), keep comma as decimal
    cleaned = str(num_str).replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_bedrag(bedrag_str):
    """Parse Belgian currency format '€ 1.234.567' to float."""
    if pd.isna(bedrag_str) or bedrag_str == "" or bedrag_str == "€ 0":
        return 0.0
    # Remove '€ ' and dots, convert to float
    cleaned = str(bedrag_str).replace("€ ", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def load_and_process_general_data():
    """Load and process general subsidies data (all citizens)."""
    # Load aantal
    df_aantal = pd.read_csv(AANTAL_CSV)
    df_aantal.columns = df_aantal.columns.str.strip()

    # Parse aantal column
    df_aantal["Aantal"] = df_aantal["Aantal"].apply(parse_number)

    # Load bedrag
    df_bedrag = pd.read_csv(BEDRAG_CSV)
    df_bedrag.columns = df_bedrag.columns.str.strip()

    # Parse bedrag column
    df_bedrag["Totaal bedrag"] = df_bedrag["Totaal bedrag"].apply(parse_bedrag)

    # Merge on Maatregel, Submaatregel, Jaar
    df = pd.merge(
        df_aantal,
        df_bedrag,
        on=["Maatregel", "Submaatregel", "Jaar"],
        suffixes=("_aantal", "_bedrag")
    )

    # Rename columns
    df = df.rename(columns={
        "Maatregel": "maatregel",
        "Submaatregel": "submaatregel",
        "Jaar": "jaar",
        "Aantal": "aantal",
        "Totaal bedrag": "bedrag"
    })

    # Convert to yearly totals (sum by year and maatregel)
    df_yearly = df.groupby(["jaar", "maatregel"]).agg({
        "aantal": "sum",
        "bedrag": "sum"
    }).reset_index()

    # Also create total across all measures
    df_total = df.groupby("jaar").agg({
        "aantal": "sum",
        "bedrag": "sum"
    }).reset_index()
    df_total["maatregel"] = "Totaal"

    # Combine
    df_combined = pd.concat([df_yearly, df_total], ignore_index=True)

    return df, df_combined


def load_and_process_protected_data():
    """Load and process protected consumers subsidies data."""
    # Load aantal
    df_aantal = pd.read_csv(AANTAL_BESCHERMD_CSV)
    df_aantal.columns = df_aantal.columns.str.strip()

    # Parse aantal column
    df_aantal["Aantal"] = df_aantal["Aantal"].apply(parse_number)

    # Load bedrag
    df_bedrag = pd.read_csv(BEDRAG_BESCHERMD_CSV)
    df_bedrag.columns = df_bedrag.columns.str.strip()

    # Parse bedrag column
    df_bedrag["Totaal bedrag"] = df_bedrag["Totaal bedrag"].apply(parse_bedrag)

    # Merge
    df = pd.merge(
        df_aantal,
        df_bedrag,
        on=["Maatregel", "Submaatregel", "Jaar"],
        suffixes=("_aantal", "_bedrag")
    )

    # Rename columns
    df = df.rename(columns={
        "Maatregel": "maatregel",
        "Submaatregel": "submaatregel",
        "Jaar": "jaar",
        "Aantal": "aantal_beschermd",
        "Totaal bedrag": "bedrag_beschermd"
    })

    # Sum by year and maatregel
    df_yearly = df.groupby(["jaar", "maatregel"]).agg({
        "aantal_beschermd": "sum",
        "bedrag_beschermd": "sum"
    }).reset_index()

    # Total across all measures
    df_total = df.groupby("jaar").agg({
        "aantal_beschermd": "sum",
        "bedrag_beschermd": "sum"
    }).reset_index()
    df_total["maatregel"] = "Totaal"

    # Combine
    df_combined = pd.concat([df_yearly, df_total], ignore_index=True)

    return df, df_combined


def main():
    """Main processing function."""
    print("Processing energiekaart premies data...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load general data
    print("  Loading general subsidies data...")
    df_general_detailed, df_general_yearly = load_and_process_general_data()

    # Load protected consumers data
    print("  Loading protected consumers data...")
    df_protected_detailed, df_protected_yearly = load_and_process_protected_data()

    # Merge general and protected yearly data
    df_yearly = pd.merge(
        df_general_yearly,
        df_protected_yearly,
        on=["jaar", "maatregel"],
        how="outer"
    ).fillna(0)

    # Sort by year and measure
    df_yearly = df_yearly.sort_values(["jaar", "maatregel"])

    # Convert to JSON-friendly format
    yearly_data = df_yearly.to_dict(orient="records")

    # Get unique measures
    measures = sorted([m for m in df_yearly["maatregel"].unique() if m != "Totaal"])

    # Add "Totaal" at the beginning
    measures = ["Totaal"] + measures

    # Save outputs
    print(f"  Saving yearly data to {OUTPUT_YEARLY_JSON}...")
    with open(OUTPUT_YEARLY_JSON, "w", encoding="utf-8") as f:
        json.dump(yearly_data, f, ensure_ascii=False, indent=2)

    print(f"  Saving measures to {OUTPUT_MEASURES_JSON}...")
    with open(OUTPUT_MEASURES_JSON, "w", encoding="utf-8") as f:
        json.dump(measures, f, ensure_ascii=False, indent=2)

    # Create metadata
    metadata = {
        "processed_at": pd.Timestamp.now().isoformat(),
        "year_range": {
            "min": int(df_yearly["jaar"].min()),
            "max": int(df_yearly["jaar"].max())
        },
        "measures_count": len(measures),
        "measures": measures,
        "total_records": len(yearly_data),
        "totals": {
            "aantal_total": int(df_yearly[df_yearly["maatregel"] == "Totaal"]["aantal"].sum()),
            "bedrag_total": float(df_yearly[df_yearly["maatregel"] == "Totaal"]["bedrag"].sum()),
            "aantal_beschermd_total": int(df_yearly[df_yearly["maatregel"] == "Totaal"]["aantal_beschermd"].sum()),
            "bedrag_beschermd_total": float(df_yearly[df_yearly["maatregel"] == "Totaal"]["bedrag_beschermd"].sum()),
        }
    }

    print(f"  Saving metadata to {OUTPUT_METADATA_JSON}...")
    with open(OUTPUT_METADATA_JSON, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print("\nProcessing complete!")
    print(f"  Years: {metadata['year_range']['min']} - {metadata['year_range']['max']}")
    print(f"  Measures: {metadata['measures_count']}")
    print(f"  Total subsidies: {metadata['totals']['aantal_total']:,}")
    print(f"  Total amount: €{metadata['totals']['bedrag_total']:,.0f}")
    print(f"  Protected consumers subsidies: {metadata['totals']['aantal_beschermd_total']:,}")
    print(f"  Protected consumers amount: €{metadata['totals']['bedrag_beschermd_total']:,.0f}")


if __name__ == "__main__":
    main()
