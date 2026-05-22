import pandas as pd
import json
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = APP_DIR / "data" / "SILC_module2023_HEE_PUBLICATION_NL.xlsx"
OUTPUT_FILE = APP_DIR / "public" / "data" / "processed_data.json"
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

# Load the Excel file
sheets_to_process = [
    "Overzicht",
    "Verwarmingssysteem",
    "Belangrijkste energiebron",
    "Isolatie verbeterd",
]

results = {}

for sheet in sheets_to_process:
    df = pd.read_excel(DATA_FILE, sheet_name=sheet, header=None)
    # For simplicity, assume the data starts after some rows
    # This needs manual inspection per sheet, but for now, export raw
    results[sheet] = df.to_dict(orient="records")

# Save to results
with open(OUTPUT_FILE, "w") as f:
    json.dump(results, f, indent=2)

print("Data processed.")
