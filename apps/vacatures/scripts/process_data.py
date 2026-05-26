#!/usr/bin/env python3
"""Convert VDAB vacancy Excel files to dashboard CSV and JSON files."""

from __future__ import annotations

import calendar
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd


APP_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = APP_DIR / "bronnen"
OUTPUT_DIR = APP_DIR / "public" / "data"

SOURCE_URL = "https://arvastat.vdab.be/"
SOURCE_PROVIDER = "VDAB"
SOURCE_TITLE = "Arvastat - ontvangen vacatures, sector bouw"

MONTH_SHORT_NL = {
    1: "Jan",
    2: "Feb",
    3: "Mrt",
    4: "Apr",
    5: "Mei",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Okt",
    11: "Nov",
    12: "Dec",
}

MONTH_FULL_NL = {
    1: "januari",
    2: "februari",
    3: "maart",
    4: "april",
    5: "mei",
    6: "juni",
    7: "juli",
    8: "augustus",
    9: "september",
    10: "oktober",
    11: "november",
    12: "december",
}

MONTH_EN = {
    "January": 1,
    "February": 2,
    "March": 3,
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12,
}


def period_from_filename(path: Path) -> tuple[int, int, str]:
    match = re.search(r"vacatures_(\d{4})(\d{2})_all\.xlsx$", path.name)
    if not match:
        raise ValueError(f"Unexpected source filename: {path.name}")

    year = int(match.group(1))
    month = int(match.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return year, month, f"{year}-{month:02d}-{last_day:02d}"


def format_period_short(year: int, month: int) -> str:
    return f"{MONTH_SHORT_NL[month]} {year}"


def format_data_availability(year: int, month: int) -> str:
    return f"{MONTH_FULL_NL[month]} {year}"


def format_month_label(year: int, month: int) -> str:
    return f"{MONTH_FULL_NL[month]} {year}"


def read_source(path: Path) -> tuple[list[dict], dict]:
    raw = pd.read_excel(path, sheet_name="Data", header=None)
    header_matches = raw.index[
        (raw[0] == "Hoofdberoepsgroep")
        & (raw[1] == "Beroepsgroep")
        & (raw[2] == "Beroep")
        & (raw[3] == "Totaal")
    ].tolist()
    if not header_matches:
        raise ValueError(f"Could not find data header in {path.name}")

    year, month, period_end = period_from_filename(path)
    period_label = str(raw.iloc[3, 0]).strip()
    period_short = format_period_short(year, month)

    table = raw.iloc[header_matches[0] + 1 :, :4].copy()
    table.columns = ["hoofdberoepsgroep", "beroepsgroep", "beroep", "vacatures"]
    table = table[table["beroep"].notna()].copy()
    table["beroep"] = table["beroep"].astype(str).str.strip()

    total_rows = table[table["beroep"] == "Totaal"]
    if total_rows.empty:
        raise ValueError(f"Could not find total row in {path.name}")
    total = int(total_rows.iloc[-1]["vacatures"])

    table = table[table["beroep"] != "Totaal"].copy()
    table["hoofdberoepsgroep"] = table["hoofdberoepsgroep"].astype(str).str.strip()
    table["beroepsgroep"] = table["beroepsgroep"].astype(str).str.strip()
    table["vacatures"] = pd.to_numeric(table["vacatures"], errors="coerce").fillna(0).astype(int)

    calculated_total = int(table["vacatures"].sum())
    if calculated_total != total:
        raise ValueError(
            f"Total mismatch in {path.name}: rows={calculated_total}, total={total}"
        )

    records = []
    for row in table.to_dict(orient="records"):
        records.append(
            {
                "period_end": period_end,
                "period_year": year,
                "period_month": month,
                "period_label": period_label,
                "period_short": period_short,
                "hoofdberoepsgroep": row["hoofdberoepsgroep"],
                "beroepsgroep": row["beroepsgroep"],
                "beroep": row["beroep"],
                "vacatures": int(row["vacatures"]),
                "source_file": path.name,
            }
        )

    total_record = {
        "period_end": period_end,
        "period_year": year,
        "period_month": month,
        "period_label": period_label,
        "period_short": period_short,
        "vacatures": total,
        "source_file": path.name,
    }
    return records, total_record


def read_monthly_source(path: Path) -> list[dict]:
    raw = pd.read_excel(path, sheet_name="Data", header=None)
    header_matches = raw.index[(raw[1] == "Studies detail") & (raw[2] == "Totaal")].tolist()
    if not header_matches:
        raise ValueError(f"Could not find monthly data header in {path.name}")

    table = raw.iloc[header_matches[0] + 1 :, :3].copy()
    table.columns = ["month_text", "study_detail", "vacatures"]
    table = table[table["month_text"].notna() & table["study_detail"].notna()].copy()
    table["month_text"] = table["month_text"].astype(str).str.strip()
    table["study_detail"] = table["study_detail"].astype(str).str.strip()
    table["vacatures"] = pd.to_numeric(table["vacatures"], errors="coerce").fillna(0).astype(int)

    parsed = table["month_text"].str.extract(r"^([A-Za-z]+)\s+(\d{4})$")
    if parsed.isna().any().any():
        invalid = table.loc[parsed.isna().any(axis=1), "month_text"].unique().tolist()
        raise ValueError(f"Could not parse month labels in {path.name}: {invalid}")

    table["period_month"] = parsed[0].map(MONTH_EN)
    if table["period_month"].isna().any():
        invalid = parsed.loc[table["period_month"].isna(), 0].unique().tolist()
        raise ValueError(f"Unknown month names in {path.name}: {invalid}")
    table["period_month"] = table["period_month"].astype(int)
    table["period_year"] = parsed[1].astype(int)
    table["period_end"] = table.apply(
        lambda row: f"{int(row['period_year'])}-{int(row['period_month']):02d}-"
        f"{calendar.monthrange(int(row['period_year']), int(row['period_month']))[1]:02d}",
        axis=1,
    )
    table["period_label"] = table.apply(
        lambda row: format_month_label(int(row["period_year"]), int(row["period_month"])),
        axis=1,
    )
    table["period_short"] = table.apply(
        lambda row: format_period_short(int(row["period_year"]), int(row["period_month"])),
        axis=1,
    )
    table["source_file"] = path.name

    return table[
        [
            "period_end",
            "period_year",
            "period_month",
            "period_label",
            "period_short",
            "study_detail",
            "vacatures",
            "source_file",
        ]
    ].to_dict(orient="records")


def read_monthly_hierarchy_source(path: Path) -> list[dict]:
    raw = pd.read_excel(path, sheet_name="Data", header=None)
    header_matches = raw.index[
        (raw[1] == "Hoofdberoepsgroep")
        & (raw[2] == "Beroepsgroep")
        & (raw[3] == "Beroep")
        & (raw[4] == "Totaal")
    ].tolist()
    if not header_matches:
        raise ValueError(f"Could not find monthly occupation header in {path.name}")

    table = raw.iloc[header_matches[0] + 1 :, :5].copy()
    table.columns = ["month_text", "hoofdberoepsgroep", "beroepsgroep", "beroep", "vacatures"]
    table = table[
        table["month_text"].notna()
        & table["hoofdberoepsgroep"].notna()
        & table["beroepsgroep"].notna()
        & table["beroep"].notna()
    ].copy()
    table["month_text"] = table["month_text"].astype(str).str.strip()
    table["hoofdberoepsgroep"] = table["hoofdberoepsgroep"].astype(str).str.strip()
    table["beroepsgroep"] = table["beroepsgroep"].astype(str).str.strip()
    table["beroep"] = table["beroep"].astype(str).str.strip()
    table["vacatures"] = pd.to_numeric(table["vacatures"], errors="coerce").fillna(0).astype(int)

    parsed = table["month_text"].str.extract(r"^([A-Za-z]+)\s+(\d{4})$")
    if parsed.isna().any().any():
        invalid = table.loc[parsed.isna().any(axis=1), "month_text"].unique().tolist()
        raise ValueError(f"Could not parse open vacancies month labels in {path.name}: {invalid}")

    table["period_month"] = parsed[0].map(MONTH_EN)
    if table["period_month"].isna().any():
        invalid = parsed.loc[table["period_month"].isna(), 0].unique().tolist()
        raise ValueError(f"Unknown month names in {path.name}: {invalid}")
    table["period_month"] = table["period_month"].astype(int)
    table["period_year"] = parsed[1].astype(int)
    table["period_end"] = table.apply(
        lambda row: f"{int(row['period_year'])}-{int(row['period_month']):02d}-"
        f"{calendar.monthrange(int(row['period_year']), int(row['period_month']))[1]:02d}",
        axis=1,
    )
    table["period_label"] = table.apply(
        lambda row: format_month_label(int(row["period_year"]), int(row["period_month"])),
        axis=1,
    )
    table["period_short"] = table.apply(
        lambda row: format_period_short(int(row["period_year"]), int(row["period_month"])),
        axis=1,
    )
    table["source_file"] = path.name

    return table[
        [
            "period_end",
            "period_year",
            "period_month",
            "period_label",
            "period_short",
            "hoofdberoepsgroep",
            "beroepsgroep",
            "beroep",
            "vacatures",
            "source_file",
        ]
    ].to_dict(orient="records")


def monthly_source_kind(path: Path) -> str:
    raw = pd.read_excel(path, sheet_name="Data", header=None, nrows=12)
    title = str(raw.iloc[0, 0]).strip()
    def column(index: int) -> pd.Series:
        if index in raw.columns:
            return raw[index]
        return pd.Series([None] * len(raw), index=raw.index)

    has_study_header = (
        (column(1) == "Studies detail")
        & (column(2) == "Totaal")
    ).any()
    has_occupation_header = (
        (column(1) == "Hoofdberoepsgroep")
        & (column(2) == "Beroepsgroep")
        & (column(3) == "Beroep")
        & (column(4) == "Totaal")
    ).any()
    if title == "Ontvangen vacatures" and has_study_header:
        return "received_study"
    if title == "Ontvangen vacatures" and has_occupation_header:
        return "received_occupation"
    if title == "Open vacatures":
        return "open_occupation"
    raise ValueError(f"Unknown monthly source type in {path.name}: {title}")


def write_json(path: Path, payload: object) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def frame_to_records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", force_ascii=False))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_files = sorted(
        path
        for path in SOURCE_DIR.glob("vacatures_*_all.xlsx")
        if re.fullmatch(r"vacatures_\d{6}_all\.xlsx", path.name)
    )
    if not source_files:
        raise FileNotFoundError(f"No vacancy Excel files found in {SOURCE_DIR}")
    monthly_source_files = sorted(SOURCE_DIR.glob("vacatures_eoy_since_2011_all*.xlsx"))
    monthly_source_kinds = {path: monthly_source_kind(path) for path in monthly_source_files}
    received_monthly_source_files = [
        path for path, kind in monthly_source_kinds.items() if kind == "received_study"
    ]
    received_monthly_occupation_source_files = [
        path for path, kind in monthly_source_kinds.items() if kind == "received_occupation"
    ]
    open_monthly_source_files = [
        path for path, kind in monthly_source_kinds.items() if kind == "open_occupation"
    ]

    vacancy_records: list[dict] = []
    total_records: list[dict] = []
    monthly_records: list[dict] = []
    received_monthly_occupation_records: list[dict] = []
    open_monthly_records: list[dict] = []

    for source_file in source_files:
        records, total = read_source(source_file)
        vacancy_records.extend(records)
        total_records.append(total)

    for source_file in received_monthly_source_files:
        monthly_records.extend(read_monthly_source(source_file))

    for source_file in received_monthly_occupation_source_files:
        received_monthly_occupation_records.extend(read_monthly_hierarchy_source(source_file))

    for source_file in open_monthly_source_files:
        open_monthly_records.extend(read_monthly_hierarchy_source(source_file))

    vacancies = pd.DataFrame(vacancy_records).sort_values(
        ["period_end", "hoofdberoepsgroep", "beroepsgroep", "beroep"]
    )
    totals = pd.DataFrame(total_records).sort_values("period_end").reset_index(drop=True)
    monthly_by_study = pd.DataFrame(monthly_records).sort_values(
        ["period_end", "study_detail"]
    ).reset_index(drop=True)
    monthly_totals_by_study = (
        monthly_by_study.groupby(
            ["period_end", "period_year", "period_month", "period_label", "period_short"],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values("period_end")
        .reset_index(drop=True)
    )
    received_monthly_hierarchy_series = pd.DataFrame(received_monthly_occupation_records).sort_values(
        ["period_end", "hoofdberoepsgroep", "beroepsgroep", "beroep"]
    ).reset_index(drop=True)
    received_monthly_hierarchy_series = (
        received_monthly_hierarchy_series.groupby(
            [
                "period_end",
                "period_year",
                "period_month",
                "period_label",
                "period_short",
                "hoofdberoepsgroep",
                "beroepsgroep",
                "beroep",
            ],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values(["period_end", "hoofdberoepsgroep", "beroepsgroep", "beroep"])
        .reset_index(drop=True)
    )
    received_monthly_totals = (
        received_monthly_hierarchy_series.groupby(
            ["period_end", "period_year", "period_month", "period_label", "period_short"],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values("period_end")
        .reset_index(drop=True)
    )
    monthly_totals = (
        received_monthly_totals
        if not received_monthly_totals.empty
        else monthly_totals_by_study
    )
    latest_received_month = monthly_totals.iloc[-1] if not monthly_totals.empty else None
    latest_received_period_end = (
        str(latest_received_month["period_end"]) if latest_received_month is not None else None
    )
    latest_received_hierarchy = (
        received_monthly_hierarchy_series[
            received_monthly_hierarchy_series["period_end"] == latest_received_period_end
        ].set_index(["hoofdberoepsgroep", "beroepsgroep", "beroep"])["vacatures"].to_dict()
        if latest_received_period_end is not None and not received_monthly_hierarchy_series.empty
        else {}
    )
    received_hierarchy_options = (
        received_monthly_hierarchy_series.groupby(
            ["hoofdberoepsgroep", "beroepsgroep", "beroep"], as_index=False
        )["vacatures"]
        .sum()
        .rename(columns={"vacatures": "total_vacatures"})
    )
    received_hierarchy_options["latest_vacatures"] = received_hierarchy_options.apply(
        lambda row: int(
            latest_received_hierarchy.get(
                (row["hoofdberoepsgroep"], row["beroepsgroep"], row["beroep"]),
                0,
            )
        ),
        axis=1,
    )
    received_hierarchy_options = received_hierarchy_options.sort_values(
        ["latest_vacatures", "total_vacatures", "hoofdberoepsgroep", "beroepsgroep", "beroep"],
        ascending=[False, False, True, True, True],
    ).reset_index(drop=True)
    open_monthly = pd.DataFrame(open_monthly_records).sort_values(
        ["period_end", "hoofdberoepsgroep", "beroepsgroep", "beroep"]
    ).reset_index(drop=True)
    open_monthly_totals = (
        open_monthly.groupby(
            ["period_end", "period_year", "period_month", "period_label", "period_short"],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values("period_end")
        .reset_index(drop=True)
    )
    open_monthly_hierarchy_series = (
        open_monthly.groupby(
            [
                "period_end",
                "period_year",
                "period_month",
                "period_label",
                "period_short",
                "hoofdberoepsgroep",
                "beroepsgroep",
                "beroep",
            ],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values(["period_end", "hoofdberoepsgroep", "beroepsgroep", "beroep"])
        .reset_index(drop=True)
    )
    latest_open_month = open_monthly_totals.iloc[-1] if not open_monthly_totals.empty else None
    latest_open_period_end = str(latest_open_month["period_end"]) if latest_open_month is not None else None
    latest_open_hierarchy = (
        open_monthly_hierarchy_series[
            open_monthly_hierarchy_series["period_end"] == latest_open_period_end
        ].set_index(["hoofdberoepsgroep", "beroepsgroep", "beroep"])["vacatures"].to_dict()
        if latest_open_period_end is not None
        else {}
    )
    open_hierarchy_options = (
        open_monthly_hierarchy_series.groupby(
            ["hoofdberoepsgroep", "beroepsgroep", "beroep"], as_index=False
        )["vacatures"]
        .sum()
        .rename(columns={"vacatures": "total_vacatures"})
    )
    open_hierarchy_options["latest_vacatures"] = open_hierarchy_options.apply(
        lambda row: int(
            latest_open_hierarchy.get(
                (row["hoofdberoepsgroep"], row["beroepsgroep"], row["beroep"]),
                0,
            )
        ),
        axis=1,
    )
    open_hierarchy_options = open_hierarchy_options.sort_values(
        ["latest_vacatures", "total_vacatures", "hoofdberoepsgroep", "beroepsgroep", "beroep"],
        ascending=[False, False, True, True, True],
    ).reset_index(drop=True)

    if not monthly_totals.empty:
        monthly_year_totals = monthly_totals.groupby("period_year")["vacatures"].agg(["sum", "count"])
        annual_totals = totals[totals["period_month"] == 12].set_index("period_year")["vacatures"]
        for year, row in monthly_year_totals.iterrows():
            if int(row["count"]) != 12 or year not in annual_totals.index:
                continue
            if int(row["sum"]) != int(annual_totals.loc[year]):
                raise ValueError(
                    f"Monthly total mismatch for {year}: "
                    f"months={int(row['sum'])}, annual={int(annual_totals.loc[year])}"
                )

    totals["previous_period_vacatures"] = totals["vacatures"].shift(1)
    totals["change_abs"] = totals["vacatures"] - totals["previous_period_vacatures"]
    totals["change_pct"] = (
        totals["change_abs"] / totals["previous_period_vacatures"] * 100
    ).round(1)
    totals = totals.where(pd.notnull(totals), None)

    groups = (
        vacancies.groupby(
            [
                "period_end",
                "period_year",
                "period_month",
                "period_label",
                "period_short",
                "hoofdberoepsgroep",
            ],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values(["period_end", "vacatures"], ascending=[True, False])
    )

    beroepsgroepen = (
        vacancies.groupby(
            [
                "period_end",
                "period_year",
                "period_month",
                "period_label",
                "period_short",
                "hoofdberoepsgroep",
                "beroepsgroep",
            ],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values(["period_end", "vacatures"], ascending=[True, False])
    )

    latest_period_end = str(totals.iloc[-1]["period_end"])
    latest_total = int(totals.iloc[-1]["vacatures"])
    latest_occupations = (
        vacancies[vacancies["period_end"] == latest_period_end]
        .sort_values("vacatures", ascending=False)
        .reset_index(drop=True)
    )
    latest_occupations["share_pct"] = (
        latest_occupations["vacatures"] / latest_total * 100
    ).round(1)
    latest_occupations.insert(0, "rank", latest_occupations.index + 1)

    latest_groups = groups[groups["period_end"] == latest_period_end].copy()
    latest_groups["share_pct"] = (latest_groups["vacatures"] / latest_total * 100).round(1)
    latest_groups = latest_groups.sort_values("vacatures", ascending=False).reset_index(drop=True)
    latest_groups.insert(0, "rank", latest_groups.index + 1)

    latest_beroepsgroepen = beroepsgroepen[beroepsgroepen["period_end"] == latest_period_end].copy()
    latest_beroepsgroepen["share_pct"] = (
        latest_beroepsgroepen["vacatures"] / latest_total * 100
    ).round(1)
    latest_beroepsgroepen = latest_beroepsgroepen.sort_values(
        "vacatures", ascending=False
    ).reset_index(drop=True)
    latest_beroepsgroepen.insert(0, "rank", latest_beroepsgroepen.index + 1)

    occupation_series = (
        vacancies.groupby(
            [
                "period_end",
                "period_year",
                "period_month",
                "period_label",
                "period_short",
                "beroep",
            ],
            as_index=False,
        )["vacatures"]
        .sum()
        .sort_values(["beroep", "period_end"])
    )

    latest_by_occupation = latest_occupations.set_index("beroep")["vacatures"].to_dict()
    occupation_totals = occupation_series.groupby("beroep", as_index=False)["vacatures"].sum()
    occupation_options = occupation_totals.copy()
    occupation_options["latest_vacatures"] = occupation_options["beroep"].map(latest_by_occupation).fillna(0).astype(int)
    occupation_options = occupation_options.rename(columns={"vacatures": "total_vacatures"})
    occupation_options = occupation_options.sort_values(
        ["latest_vacatures", "total_vacatures", "beroep"],
        ascending=[False, False, True],
    ).reset_index(drop=True)

    hierarchy_series = vacancies[
        [
            "period_end",
            "period_year",
            "period_month",
            "period_label",
            "period_short",
            "hoofdberoepsgroep",
            "beroepsgroep",
            "beroep",
            "vacatures",
        ]
    ].copy()

    latest_hierarchy = latest_occupations.set_index(
        ["hoofdberoepsgroep", "beroepsgroep", "beroep"]
    )["vacatures"].to_dict()
    hierarchy_options = (
        vacancies.groupby(["hoofdberoepsgroep", "beroepsgroep", "beroep"], as_index=False)["vacatures"]
        .sum()
        .rename(columns={"vacatures": "total_vacatures"})
    )
    hierarchy_options["latest_vacatures"] = hierarchy_options.apply(
        lambda row: int(
            latest_hierarchy.get(
                (row["hoofdberoepsgroep"], row["beroepsgroep"], row["beroep"]),
                0,
            )
        ),
        axis=1,
    )
    hierarchy_options = hierarchy_options.sort_values(
        ["latest_vacatures", "total_vacatures", "hoofdberoepsgroep", "beroepsgroep", "beroep"],
        ascending=[False, False, True, True, True],
    ).reset_index(drop=True)

    full_years = totals[totals["period_month"] == 12].copy()
    latest_full_year = full_years.iloc[-1]
    previous_full_year = full_years.iloc[-2] if len(full_years) >= 2 else None
    full_year_change_abs = (
        int(latest_full_year["vacatures"]) - int(previous_full_year["vacatures"])
        if previous_full_year is not None
        else None
    )
    full_year_change_pct = (
        round(full_year_change_abs / int(previous_full_year["vacatures"]) * 100, 1)
        if previous_full_year is not None and int(previous_full_year["vacatures"]) != 0
        else None
    )
    latest_month = monthly_totals.iloc[-1] if not monthly_totals.empty else None

    metadata = {
        "source_provider": SOURCE_PROVIDER,
        "source_title": SOURCE_TITLE,
        "source_url": SOURCE_URL,
        "source_publication_date": latest_period_end,
        "generated_at": date.today().isoformat(),
        "records": int(len(vacancies)),
        "monthly_records": int(len(monthly_by_study)),
        "received_monthly_occupation_records": int(len(received_monthly_hierarchy_series)),
        "open_monthly_records": int(len(open_monthly)),
        "source_files": [path.name for path in source_files],
        "monthly_source_files": [path.name for path in received_monthly_source_files],
        "received_monthly_occupation_source_files": [
            path.name for path in received_monthly_occupation_source_files
        ],
        "open_monthly_source_files": [path.name for path in open_monthly_source_files],
        "min_period_end": str(totals.iloc[0]["period_end"]),
        "max_period_end": latest_period_end,
        "latest_period_end": latest_period_end,
        "latest_data_date": latest_period_end,
        "latest_period_label": str(totals.iloc[-1]["period_label"]),
        "latest_period_short": str(totals.iloc[-1]["period_short"]),
        "latest_total": latest_total,
        "latest_month_end": str(latest_month["period_end"]) if latest_month is not None else None,
        "latest_month_label": str(latest_month["period_label"]) if latest_month is not None else None,
        "latest_month_short": str(latest_month["period_short"]) if latest_month is not None else None,
        "latest_month_total": int(latest_month["vacatures"]) if latest_month is not None else None,
        "latest_open_month_end": str(latest_open_month["period_end"]) if latest_open_month is not None else None,
        "latest_open_month_label": str(latest_open_month["period_label"]) if latest_open_month is not None else None,
        "latest_open_month_short": str(latest_open_month["period_short"]) if latest_open_month is not None else None,
        "latest_open_month_total": int(latest_open_month["vacatures"]) if latest_open_month is not None else None,
        "previous_period_total": int(totals.iloc[-2]["vacatures"]) if len(totals) >= 2 else None,
        "previous_period_change_abs": int(totals.iloc[-1]["change_abs"]) if len(totals) >= 2 else None,
        "previous_period_change_pct": float(totals.iloc[-1]["change_pct"]) if len(totals) >= 2 else None,
        "latest_full_year": int(latest_full_year["period_year"]),
        "latest_full_year_total": int(latest_full_year["vacatures"]),
        "previous_full_year": int(previous_full_year["period_year"]) if previous_full_year is not None else None,
        "previous_full_year_total": int(previous_full_year["vacatures"]) if previous_full_year is not None else None,
        "full_year_change_abs": full_year_change_abs,
        "full_year_change_pct": full_year_change_pct,
        "data_availability_label": format_data_availability(
            int(totals.iloc[-1]["period_year"]), int(totals.iloc[-1]["period_month"])
        ),
        "raw_csv_path": "/data/vacatures.csv",
    }

    vacancies.to_csv(OUTPUT_DIR / "vacatures.csv", index=False)
    totals.to_csv(OUTPUT_DIR / "totals.csv", index=False)
    monthly_totals.to_csv(OUTPUT_DIR / "monthly_totals.csv", index=False)
    monthly_by_study.to_csv(OUTPUT_DIR / "monthly_by_study.csv", index=False)
    received_monthly_hierarchy_series.to_csv(
        OUTPUT_DIR / "received_monthly_hierarchy_series.csv", index=False
    )
    open_monthly.to_csv(OUTPUT_DIR / "open_monthly.csv", index=False)
    open_monthly_totals.to_csv(OUTPUT_DIR / "open_monthly_totals.csv", index=False)
    open_monthly_hierarchy_series.to_csv(OUTPUT_DIR / "open_monthly_hierarchy_series.csv", index=False)
    groups.to_csv(OUTPUT_DIR / "groups.csv", index=False)
    beroepsgroepen.to_csv(OUTPUT_DIR / "beroepsgroepen.csv", index=False)
    latest_occupations.to_csv(OUTPUT_DIR / "latest_occupations.csv", index=False)
    occupation_series.to_csv(OUTPUT_DIR / "occupation_series.csv", index=False)
    hierarchy_series.to_csv(OUTPUT_DIR / "hierarchy_series.csv", index=False)

    write_json(OUTPUT_DIR / "metadata.json", metadata)
    write_json(OUTPUT_DIR / "totals.json", frame_to_records(totals))
    write_json(OUTPUT_DIR / "monthly_totals.json", frame_to_records(monthly_totals))
    write_json(OUTPUT_DIR / "monthly_by_study.json", frame_to_records(monthly_by_study))
    write_json(
        OUTPUT_DIR / "received_monthly_hierarchy_series.json",
        frame_to_records(received_monthly_hierarchy_series),
    )
    write_json(
        OUTPUT_DIR / "received_hierarchy_options.json",
        frame_to_records(received_hierarchy_options),
    )
    write_json(OUTPUT_DIR / "open_monthly_totals.json", frame_to_records(open_monthly_totals))
    write_json(
        OUTPUT_DIR / "open_monthly_hierarchy_series.json",
        frame_to_records(open_monthly_hierarchy_series),
    )
    write_json(
        OUTPUT_DIR / "open_hierarchy_options.json",
        frame_to_records(open_hierarchy_options),
    )
    write_json(OUTPUT_DIR / "groups_latest.json", frame_to_records(latest_groups))
    write_json(
        OUTPUT_DIR / "beroepsgroepen_latest.json",
        frame_to_records(latest_beroepsgroepen),
    )
    write_json(
        OUTPUT_DIR / "occupations_latest.json",
        frame_to_records(latest_occupations),
    )
    write_json(
        OUTPUT_DIR / "occupation_series.json",
        frame_to_records(occupation_series),
    )
    write_json(
        OUTPUT_DIR / "occupation_options.json",
        frame_to_records(occupation_options),
    )
    write_json(
        OUTPUT_DIR / "hierarchy_series.json",
        frame_to_records(hierarchy_series),
    )
    write_json(
        OUTPUT_DIR / "hierarchy_options.json",
        frame_to_records(hierarchy_options),
    )

    print(
        f"Processed {len(source_files)} occupation source files and "
        f"{len(received_monthly_source_files)} received monthly source files and "
        f"{len(received_monthly_occupation_source_files)} received occupation monthly source files and "
        f"{len(open_monthly_source_files)} open monthly source files, "
        f"{len(vacancies)} occupation rows, "
        f"latest period {metadata['latest_period_label']}."
    )


if __name__ == "__main__":
    main()
