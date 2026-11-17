"""Build annual-average CPI (Statbel, base 2025=100) for the 'reële waarde van 1 miljoen' chart.

The last year contains only the months published so far (year-to-date average) and is flagged as partial.
Re-run when a newer Statbel CPI file is available.
"""

import json
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
CPI_FILE = APP.parents[1] / "data/gemeentelijke-investeringen/versions/2026-09/raw/CPI All base years.txt"
OUTPUT = APP / "public/data/cpi_annual.json"
BASE_YEAR = 2025
FIRST_YEAR = 2000


def main():
    frame = pd.read_csv(CPI_FILE, sep="|", dtype=str, encoding="utf-8-sig")
    frame = frame[frame.NM_BASE_YR == str(BASE_YEAR)]
    monthly = {(int(r.NM_YR), int(r.NM_MTH)): float(r.MS_CPI_IDX) for r in frame.itertuples()}
    last_year, last_month = max(monthly)
    years = []
    for year in range(FIRST_YEAR, last_year + 1):
        values = [monthly[(year, m)] for m in range(1, 13) if (year, m) in monthly]
        if year < last_year:
            assert len(values) == 12, year
        years.append({"year": year, "averageCpi": round(sum(values) / len(values), 4), "months": len(values)})
    OUTPUT.write_text(json.dumps({
        "source": "Statbel - consumptieprijsindex",
        "sourceUrl": "https://statbel.fgov.be/nl/themas/consumptieprijzen/consumptieprijsindex",
        "baseYear": BASE_YEAR,
        "lastMonth": f"{last_year}-{last_month:02d}",
        "years": years,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(years)} years, last month {last_year}-{last_month:02d}")


if __name__ == "__main__":
    main()
