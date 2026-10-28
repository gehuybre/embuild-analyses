"""Build per-boekjaar deflators (prijspeil februari 2026) for the inflation-corrected investment chart.

Monthly CPI (base 2025=100) is assembled from three sources:
1. Statbel actuals up to the last published month;
2. the latest Federaal Planbureau forecast (as used on the nbb-rente page), chained month on month
   from the last Statbel actual so that no level jump occurs;
3. beyond the forecast horizon, a constant annual inflation rate equal to the average year-on-year
   inflation of the last four forecast months.
Each boekjaar is deflated with its own annual average CPI.
"""

import json
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
REPO_ROOT = APP.parents[3]
CPI_FILE = REPO_ROOT / "data/gemeentelijke-investeringen/versions/2026-09/raw/CPI All base years.txt"
FORECASTS = REPO_ROOT / "apps/nbb-rente/results/inflation_forecasts.json"
FORECASTS_METADATA = REPO_ROOT / "apps/nbb-rente/results/inflation_forecasts_metadata.json"
OUTPUT = APP / "public/data/inflation_factors.json"
CPI_BASE_YEAR = 2025
REFERENCE_PERIOD = "2026-02"
FIRST_YEAR, LAST_YEAR = 2014, 2031
EXTRAPOLATION_MONTHS = 4


def previous_period(period):
    year, month = int(period[:4]), int(period[5:])
    return f"{year - 1}-12" if month == 1 else f"{year}-{month - 1:02d}"


def load_actuals():
    frame = pd.read_csv(CPI_FILE, sep="|", dtype=str, encoding="utf-8-sig")
    frame = frame[frame.NM_BASE_YR == str(CPI_BASE_YEAR)]
    return {
        f"{int(row.NM_YR)}-{int(row.NM_MTH):02d}": float(row.MS_CPI_IDX)
        for row in frame.itertuples()
    }


def load_forecast():
    forecasts = json.loads(FORECASTS.read_text(encoding="utf-8"))
    latest = max(forecasts, key=lambda item: item["forecastSortValue"])
    assert latest["cpiIndexLabel"] == f"Index ({CPI_BASE_YEAR}=100)", latest["cpiIndexLabel"]
    points = {point["period"]: point for point in latest["monthlyPoints"]}
    return latest, points


def main():
    actuals = load_actuals()
    latest, forecast = load_forecast()
    last_actual = max(period for period in actuals if period >= "2026-01")
    assert last_actual in forecast, "forecast must overlap the last actual month"

    monthly = {period: value for period, value in actuals.items() if period <= last_actual}
    source = {period: "statbel" for period in monthly}
    for period in sorted(forecast):
        if period <= last_actual:
            continue
        previous = previous_period(period)
        monthly[period] = monthly[previous] * forecast[period]["cpiIndex"] / forecast[previous]["cpiIndex"]
        source[period] = "planbureau"

    horizon = max(forecast)
    tail = sorted(forecast)[-EXTRAPOLATION_MONTHS:]
    annual_rate = sum(forecast[period]["cpiGrowthRate"] for period in tail) / len(tail) / 100
    monthly_growth = (1 + annual_rate) ** (1 / 12)
    for year in range(int(horizon[:4]), LAST_YEAR + 1):
        for month in range(1, 13):
            period = f"{year}-{month:02d}"
            if period <= horizon:
                continue
            previous = previous_period(period)
            monthly[period] = monthly[previous] * monthly_growth
            source[period] = "extrapolatie"

    reference = monthly[REFERENCE_PERIOD]
    years = {}
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        periods = [f"{year}-{month:02d}" for month in range(1, 13)]
        average = sum(monthly[period] for period in periods) / 12
        kinds = {source[period] for period in periods}
        years[str(year)] = {
            "average_cpi": round(average, 4),
            "factor": reference / average,
            "basis": "statbel" if kinds == {"statbel"} else "planbureau" if "extrapolatie" not in kinds else "extrapolatie",
            "months": {name: sum(source[p] == name for p in periods) for name in ("statbel", "planbureau", "extrapolatie")},
        }

    metadata = json.loads(FORECASTS_METADATA.read_text(encoding="utf-8"))
    result = {
        "cpi_base_year": CPI_BASE_YEAR,
        "price_level_period": REFERENCE_PERIOD,
        "price_level_label": "februari 2026",
        "reference_cpi": reference,
        "method": "Elk boekjaar wordt gedeflateerd met het gemiddelde van de twaalf maandelijkse consumptieprijsindexen van dat jaar, naar het prijspeil van februari 2026.",
        "last_statbel_month": last_actual,
        "forecast_vintage": latest["forecastMonth"],
        "forecast_publication_date": latest["sourcePublicationDate"],
        "forecast_horizon": horizon,
        "forecast_source_url": metadata["sourceUrl"],
        "extrapolation": {
            "from": horizon,
            "months_averaged": tail,
            "annual_inflation": annual_rate,
        },
        "years": years,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"last Statbel month {last_actual}; forecast vintage {latest['forecastMonth']} to {horizon}; "
          f"extrapolated inflation {annual_rate:.4%}")
    for year, entry in years.items():
        print(year, f"{entry['average_cpi']:.2f}", f"{entry['factor']:.4f}", entry["basis"])


if __name__ == "__main__":
    main()
