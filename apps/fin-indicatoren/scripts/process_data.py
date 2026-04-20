#!/usr/bin/env python3
"""Generate interactive blog datasets for the fin-indicatoren app."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

import render_bouwsector_cbratiose_report as report

PUBLIC_DATA_DIR = APP_ROOT / "public" / "data"
METADATA_PATH = PUBLIC_DATA_DIR / "metadata.json"
ARTICLE_PATH = PUBLIC_DATA_DIR / "article.json"
REMOTE_METADATA_PATH = APP_ROOT / "data" / ".remote_metadata.json"

COMPARISON_CSV = (
    APP_ROOT
    / "analysis"
    / "cbratiose_bouw_vs_alle_sectoren"
    / "cbratiose_bouw_vs_alle_sectoren_comparison.csv"
)
LONG_CSV = (
    APP_ROOT
    / "analysis"
    / "cbratiose_bouw_vs_alle_sectoren"
    / "cbratiose_bouw_vs_alle_sectoren_long.csv"
)
MAIN_XML = APP_ROOT / "downloads" / "cbratiose_bouw_vs_alle_sectoren" / "data.xml"
PEER_CSV = (
    APP_ROOT
    / "analysis"
    / "cbratiose_bouw_vs_andere_sectoren"
    / "cbratiose_bouw_vs_andere_sectoren_long.csv"
)
SUBSECTOR_CSV = (
    APP_ROOT
    / "analysis"
    / "cbratiose_bouwsubsectoren"
    / "cbratiose_bouwsubsectoren_long.csv"
)
SOURCE_URL = "https://dataviewer-stat.nbb.be/?chartId=a6e7262c-5128-4d39-8d36-dc3320f1ded8"

PEER_COLORS = {
    "PU210": "#8c6d31",
    "PU220": "#2a9d8f",
    "PU290": "#5c677d",
    "PU300": "#0f4c81",
    "PU310": "#c08497",
    "PU320": "#b56576",
    "PU330": "#6b8f71",
    "PU340": "#e07a5f",
    "PU405": "#6d597a",
    "PU409": "#457b9d",
    "PU410": "#7f5539",
    "PU420": "#4d908e",
}

MODEL_SERIES = [
    ("bouw_C", "Bouw - Volledig", "#0f4c81"),
    ("alle_C", "Alle sectoren - Volledig", "#7d8597"),
    ("bouw_A", "Bouw - Verkort", "#2f6f9f"),
    ("alle_A", "Alle sectoren - Verkort", "#9aa6b2"),
    ("bouw_M", "Bouw - Micro", "#4f7c5d"),
    ("alle_M", "Alle sectoren - Micro", "#c0c7cf"),
    ("bouw_T", "Bouw - Totaal", "#17324d"),
    ("alle_T", "Alle sectoren - Totaal", "#5c677d"),
]

CHAPTER_INTROS = {
    "peer-sectors": (
        "Deze reeks vergelijkt de bouwsector met andere hoofdsectoren op basis van model T "
        "(volledig + verkort + micro) en het gewogen gemiddelde van de NBB. Per indicator zie je "
        "hoe de bouwsector zich doorheen de tijd positioneert tegenover de rest van de economie."
    ),
    "subsectors": (
        "Hier wordt de bouw opgesplitst in geselecteerde bouwsubsectoren. Zo zie je per indicator "
        "waar binnen de bouwketen de sterkere en zwakkere profielen zitten."
    ),
    "models": (
        "Deze reeks vergelijkt de bouwsector met alle sectoren binnen elk jaarrekeningmodel: "
        "volledig, verkort, micro en het totaalaggregaat T. Dat maakt zichtbaar of het beeld "
        "verschilt naargelang het type vennootschap."
    ),
}


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_download_pipeline() -> None:
    subprocess.run(
        [
            sys.executable,
            str(APP_ROOT / "download_cbratiose_bouw_vs_alle_sectoren.py"),
            "--root",
            str(APP_ROOT),
        ],
        check=True,
    )


def copy_analysis_exports() -> None:
    shutil.copy2(COMPARISON_CSV, PUBLIC_DATA_DIR / "cbratiose_bouw_vs_alle_sectoren_comparison.csv")
    shutil.copy2(LONG_CSV, PUBLIC_DATA_DIR / "cbratiose_bouw_vs_alle_sectoren_long.csv")
    shutil.copy2(PEER_CSV, PUBLIC_DATA_DIR / "cbratiose_bouw_vs_andere_sectoren_long.csv")
    shutil.copy2(SUBSECTOR_CSV, PUBLIC_DATA_DIR / "cbratiose_bouwsubsectoren_long.csv")


def metric_meta_by_code() -> dict[str, dict[str, object]]:
    guidance_lookup = {
        item["metric"]: item
        for item in report.INDICATOR_GUIDANCE
    }
    metadata: dict[str, dict[str, object]] = {}
    for theme in report.THEMES:
        for ratio_code, higher_is_better, kind in zip(
            theme.metrics,
            theme.metric_directions,
            theme.y_formats,
            strict=True,
        ):
            label = report.PANEL_METRIC_LABELS[ratio_code]
            guidance = guidance_lookup[label]
            metadata[ratio_code] = {
                "code": ratio_code,
                "label": label,
                "theme": theme.area,
                "kind": kind,
                "higherIsBetter": higher_is_better,
                "formula": guidance["formula"],
                "reading": guidance["reading"],
            }
    return metadata


def sort_table_value(value: float | None, higher_is_better: bool) -> float:
    if value is None or pd.isna(value):
        return -1_000_000_000.0
    return float(value) if higher_is_better else -float(value)


def build_rows_from_pivot(
    pivot: pd.DataFrame,
    item_codes: list[str],
    label_lookup: dict[str, str],
    kind: str,
    higher_is_better: bool,
) -> tuple[list[dict[str, object]], list[dict[str, object]], int]:
    years = [int(year) for year in pivot.columns if isinstance(year, int)]
    years.sort()
    latest_year = years[-1]

    chart_data: list[dict[str, object]] = []
    for year in years:
        row: dict[str, object] = {
            "label": str(year),
            "sortValue": year,
        }
        for item_code in item_codes:
            matching = pivot[pivot["item_code"] == item_code]
            row[item_code] = (
                None
                if matching.empty or pd.isna(matching.iloc[0][year])
                else float(matching.iloc[0][year])
            )
        chart_data.append(row)

    table_data: list[dict[str, object]] = []
    for item_code in item_codes:
        matching = pivot[pivot["item_code"] == item_code]
        latest_value = None if matching.empty else matching.iloc[0][latest_year]
        row: dict[str, object] = {
            "periodCells": [label_lookup[item_code]],
            "sortValue": sort_table_value(latest_value, higher_is_better),
        }
        if label_lookup[item_code] == "Bouwnijverheid":
            row["sortValue"] = row["sortValue"] + 1_000_000
        for year in years:
            value = None if matching.empty else matching.iloc[0][year]
            row[f"y{year}"] = report.text_format(value, kind)
        table_data.append(row)

    return chart_data, table_data, latest_year


def peer_indicator_summary(
    peer_frame: pd.DataFrame,
    ratio_code: str,
    kind: str,
    higher_is_better: bool,
) -> str:
    latest_year = int(peer_frame["year"].max())
    subset = peer_frame[
        (peer_frame["ratio_code"] == ratio_code)
        & (peer_frame["year"] == latest_year)
    ].copy()
    subset = subset[subset["value"].notna()].copy()
    subset = subset.sort_values(
        "value",
        ascending=not higher_is_better,
        kind="stable",
    ).reset_index(drop=True)
    top = subset.iloc[0]
    bottom = subset.iloc[-1]
    bouw_index = int(subset.index[subset["sector_code"] == "PU300"][0]) + 1
    bouw_value = float(subset.loc[subset["sector_code"] == "PU300", "value"].iloc[0])
    return (
        f"In {latest_year} staat de bouwsector op plaats {bouw_index} van {len(subset)} "
        f"met {report.text_format(bouw_value, kind)}. Koploper is {top['sector_short_label'].lower()} "
        f"met {report.text_format(float(top['value']), kind)}, hekkensluiter is "
        f"{bottom['sector_short_label'].lower()} met {report.text_format(float(bottom['value']), kind)}."
    )


def subsector_indicator_summary(
    subsector_frame: pd.DataFrame,
    ratio_code: str,
    kind: str,
    higher_is_better: bool,
) -> str:
    latest_year = int(subsector_frame["year"].max())
    subset = subsector_frame[
        (subsector_frame["ratio_code"] == ratio_code)
        & (subsector_frame["year"] == latest_year)
    ].copy()
    subset = subset[subset["value"].notna()].copy()
    subset = subset.sort_values(
        "value",
        ascending=not higher_is_better,
        kind="stable",
    ).reset_index(drop=True)
    top = subset.iloc[0]
    bottom = subset.iloc[-1]
    return (
        f"In {latest_year} staat {top['sector_short_label'].lower()} bovenaan met "
        f"{report.text_format(float(top['value']), kind)}. Onderaan staat "
        f"{bottom['sector_short_label'].lower()} met {report.text_format(float(bottom['value']), kind)}."
    )


def model_indicator_summary(
    frame: pd.DataFrame,
    ratio_code: str,
    kind: str,
) -> str:
    latest_year = int(frame["year"].max())
    total_row = report.metric_latest(frame, ratio_code, "dispg", "T")
    full_row = report.metric_latest(frame, ratio_code, "dispg", "C")
    micro_row = report.metric_latest(frame, ratio_code, "dispg", "M")
    return (
        f"In {latest_year} ligt het totaalmodel T voor de bouw op "
        f"{report.text_format(float(total_row['value_pu300']), kind)} tegenover "
        f"{report.text_format(float(total_row['value_pu450']), kind)} voor alle sectoren. "
        f"Binnen het volledige model gaat het om {report.text_format(float(full_row['value_pu300']), kind)}, "
        f"binnen het micromodel om {report.text_format(float(micro_row['value_pu300']), kind)}."
    )


def build_peer_indicator(
    peer_frame: pd.DataFrame,
    ratio_code: str,
    meta: dict[str, object],
) -> dict[str, object]:
    subset = peer_frame[peer_frame["ratio_code"] == ratio_code].copy()
    label_lookup = {
        sector_code: str(
            subset.loc[subset["sector_code"] == sector_code, "sector_short_label"].iloc[0]
        )
        for sector_code in report.PEER_SECTOR_CODES
        if sector_code in subset["sector_code"].unique()
    }
    pivot = (
        subset.pivot_table(index="sector_code", columns="year", values="value", aggfunc="first")
        .reset_index()
        .rename(columns={"sector_code": "item_code"})
    )
    chart_data, table_data, latest_year = build_rows_from_pivot(
        pivot,
        [code for code in report.PEER_SECTOR_CODES if code in label_lookup],
        label_lookup,
        str(meta["kind"]),
        bool(meta["higherIsBetter"]),
    )
    return {
        "code": ratio_code,
        "label": meta["label"],
        "theme": meta["theme"],
        "kind": meta["kind"],
        "summary": peer_indicator_summary(
            peer_frame,
            ratio_code,
            str(meta["kind"]),
            bool(meta["higherIsBetter"]),
        ),
        "tableLabel": "Sector",
        "yAxisLabel": meta["label"],
        "highlightSeriesKey": "PU300",
        "series": [
            {
                "key": sector_code,
                "label": label_lookup[sector_code],
                "color": PEER_COLORS.get(sector_code, "#6b7280"),
            }
            for sector_code in label_lookup
        ],
        "chartData": chart_data,
        "tableData": table_data,
        "latestYear": latest_year,
    }


def build_subsector_indicator(
    subsector_frame: pd.DataFrame,
    ratio_code: str,
    meta: dict[str, object],
) -> dict[str, object]:
    subset = subsector_frame[subsector_frame["ratio_code"] == ratio_code].copy()
    label_lookup = {
        sector_code: str(
            subset.loc[subset["sector_code"] == sector_code, "sector_short_label"].iloc[0]
        )
        for sector_code in report.LOWER_SUBSECTOR_CODES
        if sector_code in subset["sector_code"].unique()
    }
    pivot = (
        subset.pivot_table(index="sector_code", columns="year", values="value", aggfunc="first")
        .reset_index()
        .rename(columns={"sector_code": "item_code"})
    )
    chart_data, table_data, latest_year = build_rows_from_pivot(
        pivot,
        [code for code in report.LOWER_SUBSECTOR_CODES if code in label_lookup],
        label_lookup,
        str(meta["kind"]),
        bool(meta["higherIsBetter"]),
    )
    return {
        "code": ratio_code,
        "label": meta["label"],
        "theme": meta["theme"],
        "kind": meta["kind"],
        "summary": subsector_indicator_summary(
            subsector_frame,
            ratio_code,
            str(meta["kind"]),
            bool(meta["higherIsBetter"]),
        ),
        "tableLabel": "Subsector",
        "yAxisLabel": meta["label"],
        "series": [
            {
                "key": sector_code,
                "label": label_lookup[sector_code],
                "color": report.LOWER_SUBSECTOR_COLORS.get(sector_code, "#6b7280"),
            }
            for sector_code in label_lookup
        ],
        "chartData": chart_data,
        "tableData": table_data,
        "latestYear": latest_year,
    }


def build_model_indicator(
    frame: pd.DataFrame,
    ratio_code: str,
    meta: dict[str, object],
) -> dict[str, object]:
    subset = frame[
        (frame["ratio_code"] == ratio_code)
        & (frame["dispersion_code"] == "dispg")
    ].copy()
    years = sorted(int(year) for year in subset["year"].unique())

    chart_data: list[dict[str, object]] = []
    for year in years:
        year_subset = subset[subset["year"] == year]
        row: dict[str, object] = {
            "label": str(year),
            "sortValue": year,
        }
        for scheme_code in report.SCHEME_ORDER:
            scheme_subset = year_subset[year_subset["scheme_code"] == scheme_code]
            if scheme_subset.empty:
                row[f"bouw_{scheme_code}"] = None
                row[f"alle_{scheme_code}"] = None
                continue
            record = scheme_subset.iloc[0]
            row[f"bouw_{scheme_code}"] = (
                None if pd.isna(record["value_pu300"]) else float(record["value_pu300"])
            )
            row[f"alle_{scheme_code}"] = (
                None if pd.isna(record["value_pu450"]) else float(record["value_pu450"])
            )
        chart_data.append(row)

    table_data: list[dict[str, object]] = []
    for order, (series_key, label, _color) in enumerate(MODEL_SERIES):
        row: dict[str, object] = {
            "periodCells": [label],
            "sortValue": len(MODEL_SERIES) - order,
        }
        for year in years:
            matching = next(item for item in chart_data if item["sortValue"] == year)
            row[f"y{year}"] = report.text_format(matching.get(series_key), str(meta["kind"]))
        table_data.append(row)

    return {
        "code": ratio_code,
        "label": meta["label"],
        "theme": meta["theme"],
        "kind": meta["kind"],
        "summary": model_indicator_summary(frame, ratio_code, str(meta["kind"])),
        "tableLabel": "Model / benchmark",
        "yAxisLabel": meta["label"],
        "highlightSeriesKey": "bouw_T",
        "series": [
            {
                "key": series_key,
                "label": label,
                "color": color,
            }
            for series_key, label, color in MODEL_SERIES
        ],
        "chartData": chart_data,
        "tableData": table_data,
        "latestYear": years[-1],
    }


def build_article_payload(
    frame: pd.DataFrame,
    peer_frame: pd.DataFrame,
    subsector_frame: pd.DataFrame,
) -> dict[str, object]:
    latest_year = int(frame["year"].max())
    min_year = int(frame["year"].min())
    metric_metadata = metric_meta_by_code()

    indicator_guide = [
        {
            "code": ratio_code,
            "label": metric_metadata[ratio_code]["label"],
            "theme": metric_metadata[ratio_code]["theme"],
            "formula": metric_metadata[ratio_code]["formula"],
            "reading": metric_metadata[ratio_code]["reading"],
        }
        for ratio_code in report.USED_RATIO_CODES
    ]

    chapters = [
        {
            "key": "peer-sectors",
            "title": "Bouwsector vergeleken met andere sectoren",
            "intro": CHAPTER_INTROS["peer-sectors"],
            "indicators": [
                build_peer_indicator(peer_frame, ratio_code, metric_metadata[ratio_code])
                for ratio_code in report.USED_RATIO_CODES
            ],
        },
        {
            "key": "subsectors",
            "title": "Subsectoren van de bouw vergeleken",
            "intro": CHAPTER_INTROS["subsectors"],
            "indicators": [
                build_subsector_indicator(subsector_frame, ratio_code, metric_metadata[ratio_code])
                for ratio_code in report.USED_RATIO_CODES
            ],
        },
        {
            "key": "models",
            "title": "Vergelijking per model van jaarrekening",
            "intro": CHAPTER_INTROS["models"],
            "modelGuide": report.MODEL_GUIDANCE,
            "indicators": [
                build_model_indicator(frame, ratio_code, metric_metadata[ratio_code])
                for ratio_code in report.USED_RATIO_CODES
            ],
        },
    ]

    return {
        "title": "Financiële indicatoren in de bouwsector",
        "lead": (
            "Deze datablog toont dezelfde NBB CBRATIOSE-data als het bestaande rapport, "
            "maar vertaalt die naar een interactieve blogstructuur. Per hoofdstuk kan je "
            "tussen indicatoren schakelen en telkens kiezen tussen grafiek en tabel."
        ),
        "minYear": min_year,
        "latestYear": latest_year,
        "sourceUrl": SOURCE_URL,
        "indicatorGuide": indicator_guide,
        "chapters": chapters,
    }


def main() -> int:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    REMOTE_METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)

    run_download_pipeline()

    frame = report.sanitize_main_frame(report.load_frame(COMPARISON_CSV))
    peer_frame = report.sanitize_series_frame(
        report.ensure_peer_sector_frame(APP_ROOT),
        report.PEER_ANOMALIES,
    )
    subsector_frame = report.sanitize_series_frame(
        report.ensure_lower_subsector_frame(APP_ROOT),
        report.LOWER_SUBSECTOR_ANOMALIES,
    )
    latest_year = int(frame["year"].max())

    copy_analysis_exports()

    write_json(
        METADATA_PATH,
        {
            "latest_year": latest_year,
            "source": "Nationale Bank van België - CBRATIOSE",
            "source_url": SOURCE_URL,
        },
    )
    write_json(
        ARTICLE_PATH,
        build_article_payload(frame, peer_frame, subsector_frame),
    )
    write_json(
        REMOTE_METADATA_PATH,
        {
            "mainDataSha256": sha256_file(MAIN_XML) if MAIN_XML.exists() else "",
            "latestYear": latest_year,
        },
    )

    print(f"Generated {ARTICLE_PATH}")
    print(f"Latest year: {latest_year}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
