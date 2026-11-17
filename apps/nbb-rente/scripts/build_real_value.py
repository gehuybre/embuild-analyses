"""Build annual-average CPI (Statbel, base 2025=100) for the 'reële waarde van 1 miljoen' chart.

Months after the last Statbel month come from the latest Federaal Planbureau forecast (public/data/inflation_forecasts.json),
chained month on month from the last Statbel actual so that no level jump occurs. Years containing forecast months are
flagged through "forecastMonths". Re-run when a newer Statbel CPI file or a newer forecast is available.
"""

import json
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
CPI_FILE = APP.parents[1] / "data/gemeentelijke-investeringen/versions/2026-09/raw/CPI All base years.txt"
FORECASTS = APP / "public/data/inflation_forecasts.json"
OUTPUT = APP / "public/data/cpi_annual.json"
BASE_YEAR = 2025
FIRST_YEAR = 2000


def main():
    frame = pd.read_csv(CPI_FILE, sep="|", dtype=str, encoding="utf-8-sig")
    frame = frame[frame.NM_BASE_YR == str(BASE_YEAR)]
    monthly = {(int(r.NM_YR), int(r.NM_MTH)): float(r.MS_CPI_IDX) for r in frame.itertuples()}
    last_year, last_month = max(monthly)
    forecasts = json.loads(FORECASTS.read_text(encoding="utf-8"))
    latest = max(forecasts, key=lambda item: item["forecastSortValue"])
    assert latest["cpiIndexLabel"] == f"Index ({BASE_YEAR}=100)", latest["cpiIndexLabel"]
    points = {p["period"]: p["cpiIndex"] for p in latest["monthlyPoints"]}
    last_actual = f"{last_year}-{last_month:02d}"
    assert last_actual in points, "forecast must overlap the last actual month"
    horizon = max(points)
    chained = dict(monthly)
    year, month = last_year, last_month
    while f"{year}-{month:02d}" < horizon:
        prev = f"{year}-{month:02d}"
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        chained[(year, month)] = chained[(year if month > 1 else year - 1, month - 1 if month > 1 else 12)] * points[f"{year}-{month:02d}"] / points[prev]
    horizon_year = int(horizon[:4])
    assert int(horizon[5:]) == 12, "forecast horizon must end in december"
    years = []
    for year in range(FIRST_YEAR, horizon_year + 1):
        values = [chained[(year, m)] for m in range(1, 13)]
        years.append({
            "year": year,
            "averageCpi": round(sum(values) / 12, 4),
            "forecastMonths": sum((year, m) not in monthly for m in range(1, 13)),
        })
    OUTPUT.write_text(json.dumps({
        "source": "Statbel - consumptieprijsindex",
        "sourceUrl": "https://statbel.fgov.be/nl/themas/consumptieprijzen/consumptieprijsindex",
        "baseYear": BASE_YEAR,
        "lastMonth": last_actual,
        "forecastVintage": latest["forecastMonth"],
        "forecastLabel": latest["forecastLabel"],
        "forecastSourceUrl": "https://www.plan.be/nl/data/indexcijfer-der-consumptieprijzen",
        "forecastHorizon": horizon,
        "years": years,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(years)} years, last Statbel month {last_actual}, forecast {latest['forecastMonth']} to {horizon}")


if __name__ == "__main__":
    main()
