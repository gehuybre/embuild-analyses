#!/usr/bin/env python3
"""Verwerk de horizontale screening van sectoren (FOD Economie) voor de fin-indicatoren blog.

Bron: 'Marktwerking en evolutie van de marges in België: een horizontale screening van sectoren'
(bijlage 'Indicatoren per sector'), editie 2025. FOD Economie publiceert deze studie jaarlijks als
Excel-bestand zonder API. Jaarlijks bijwerken:
  1. download de nieuwe bijlage (.xls) van https://economie.fgov.be/nl/publicatie/marktwerking-belgie
  2. python scripts/update_marktwerking.py --source <pad-of-url-naar-bestand>
Vereist: pandas, xlrd (voor .xls) en openpyxl.

Uitvoer:
  public/data/marktwerking.json            compacte dataset voor de blog
  public/data/marktwerking/*.csv           lange/brede tabellen
  public/data/marktwerking-data.xlsx       Excel-werkboek
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import urllib.request
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

DATA_DIR = APP_ROOT / "data" / "marktwerking"
PUBLIC_DATA_DIR = APP_ROOT / "public" / "data"
CSV_DIR = PUBLIC_DATA_DIR / "marktwerking"
JSON_PATH = PUBLIC_DATA_DIR / "marktwerking.json"
XLSX_PATH = PUBLIC_DATA_DIR / "marktwerking-data.xlsx"
DEFAULT_SOURCE = DATA_DIR / "marktwerking-belgie-horizontale-screening-sectoren-2025.xls"
PUBLICATION_URL = "https://economie.fgov.be/nl/publicatie/marktwerking-belgie"

# Volgorde en namen van de screeningsindicatoren, zoals in de kolomkoppen van het bronbestand.
INDICATORS = [
    ("IC", "Samengestelde indicator"),
    ("KI", "Kapitaalintensiteit"),
    ("GOV", "Gewogen ondernemingsverloop"),
    ("HHI", "Concentratie (HHI)"),
    ("IMP", "Importpenetratie"),
    ("AB", "Aantal bedrijven"),
    ("PCM", "Prijs-kostmarge (PCM)"),
    ("OV", "Overleving"),
    ("TNF8", "TNF8"),
    ("VMA", "Verandering marktaandeel"),
]
HEADER_TO_CODE = {
    "IC Gewoon gemidd.": "IC", "Samengestelde Indic.": "IC", "Kap. intens.": "KI",
    "Gew. ond. verloop": "GOV", "HHI": "HHI", "Imp. pen.": "IMP", "Aant. bedr.": "AB",
    "PCM": "PCM", "Overlev.": "OV", "TNF8": "TNF8", "Verand. mkt. aand.": "VMA",
}
MARGIN_MEASURES = [
    ("NET_GLOB", "Netto marge (geglobaliseerd)", "%", 4),
    ("NET_MED", "Netto marge (mediaan)", "%", 10),
    ("LOSS", "Aandeel bedrijven met exploitatieverlies", "%", 16),
]
YEARS = list(range(2018, 2024))


def resolve_source(source: str | None) -> Path:
    if not source:
        return DEFAULT_SOURCE
    if source.startswith(("http://", "https://")):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        target = DATA_DIR / "download.xls"
        request = urllib.request.Request(source, headers={"User-Agent": "embuild-data-blog/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        return target
    return Path(source)


def clean_text(value) -> str:
    """Het .xls-bestand bevat het stuurteken \x1a waar 'ë' of '²' hoorde te staan (bv. 'residenti\x1ale', 'm\x1a')."""
    text = str(value).strip()
    text = text.replace("m\x1a", "m²").replace("\x1a", "ë")
    return text


def clean_number(value):
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return str(value).strip()  # bv. "420 tot 600" (vertrouwelijke omzet)


def parse_screening(book: pd.ExcelFile) -> list[dict]:
    rows: list[dict] = []
    specs = [
        ("Deel1_Diensten", "Bouw", "Bouw", 3, 4),
        ("Deel1_industrie", "Andere minerale producten", "Bouwmaterialen (industrie)", 4, 5),
    ]
    for sheet, category, group, turnover_col, firms_col in specs:
        raw = book.parse(sheet, header=None)
        total = int(str(raw.iloc[2, [c for c in range(raw.shape[1]) if "Rankschikking" in str(raw.iloc[2, c])][0]]).split("van")[1].strip(" )"))
        sub = raw.iloc[3]
        rank_start = next(c for c in range(raw.shape[1]) if "Rankschikking" in str(raw.iloc[2, c]))
        value_start = next(c for c in range(raw.shape[1]) if "Waarden" in str(raw.iloc[2, c]))
        rank_cols = {HEADER_TO_CODE[str(sub[c])]: c for c in range(rank_start, value_start)}
        value_cols = {HEADER_TO_CODE[str(sub[c])]: c for c in range(value_start, raw.shape[1])}
        for _, row in raw.iloc[4:].iterrows():
            if row[2] != category:
                continue
            ranks = {code: clean_number(row[c]) for code, c in rank_cols.items()}
            values = {code: clean_number(row[c]) for code, c in value_cols.items()}
            values["AB"] = clean_number(row[firms_col])
            rows.append({
                "nace": str(row[0]).strip(),
                "label": clean_text(row[1]),
                "group": group,
                "turnover": clean_number(row[turnover_col]),
                "firms": clean_number(row[firms_col]),
                "rankOf": total,
                "ranks": {k: v for k, v in ranks.items() if v is not None},
                "values": {k: v for k, v in values.items() if v is not None},
            })
    return rows


def parse_margins(book: pd.ExcelFile) -> tuple[list[dict], dict[str, dict[str, list]], pd.DataFrame]:
    series: list[dict] = []
    values: dict[str, dict[str, list]] = {code: {} for code, *_ in MARGIN_MEASURES}
    long_rows = []
    sheets = [
        ("Deel 2_Diensten (NACE 2)", "d2", "Diensten (NACE 2)", "NACE 2"),
        ("Deel 2_Diensten (NACE 4)", "d4", "Diensten (NACE 4)", "NACE 4"),
        ("Deel 2_Industrie (NACE 2)", "i2", "Industrie (NACE 2)", "NACE 2"),
    ]
    for sheet, prefix, group, level in sheets:
        raw = book.parse(sheet, header=None)
        for _, row in raw.iloc[3:].iterrows():
            nace = str(row[0]).strip()
            if nace in ("nan", ""):
                continue
            is_bouw = nace[:2] in ("41", "42", "43") and prefix != "i2"
            this_group = ("Bouw (NACE 2)" if prefix == "d2" else "Bouw (NACE 4)") if is_bouw else group
            key = f"{prefix}_{nace}"
            series.append({
                "key": key, "nace": nace, "label": clean_text(row[1]), "group": this_group,
                "firms": clean_number(row[2]), "turnover": clean_number(row[3]),
            })
            for code, label, _unit, start in MARGIN_MEASURES:
                data = [clean_number(row[start + i]) for i in range(len(YEARS))]
                data = [round(v * 100, 3) if isinstance(v, float) else None for v in data]
                values[code][key] = data
                for year, value in zip(YEARS, data):
                    if value is not None:
                        long_rows.append({
                            "Groep": this_group, "NACE-code": nace, "Omschrijving": clean_text(row[1]),
                            "Maat": label, "Jaar": year, "Waarde (%)": value,
                        })
    return series, values, pd.DataFrame(long_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", help="pad of URL naar het .xls-bestand (standaard: bewaarde editie 2025)")
    parser.add_argument("--no-excel", action="store_true")
    args = parser.parse_args()

    source = resolve_source(args.source)
    book = pd.ExcelFile(source)
    from scripts.raw_export import export_xls_sheets

    export_xls_sheets(source, APP_ROOT / "downloads" / "marktwerking")
    screening = parse_screening(book)
    series, values, margins_long = parse_margins(book)

    payload = {
        "edition": 2025,
        "sourceUrl": PUBLICATION_URL,
        "sourceFile": source.name,
        "marginYears": YEARS,
        "turnoverYear": {"screening": 2022, "margins": 2023},
        "indicators": [{"code": c, "label": l} for c, l in INDICATORS],
        "screening": screening,
        "margins": {
            "measures": [{"code": c, "label": l, "unit": u} for c, l, u, _ in MARGIN_MEASURES],
            "series": series,
            "values": values,
        },
    }
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    CSV_DIR.mkdir(parents=True, exist_ok=True)

    wide = []
    for row in screening:
        entry = {"NACE-code": row["nace"], "Omschrijving": row["label"], "Groep": row["group"],
                 "Omzet 2022 (mln euro)": row["turnover"], "Aantal ondernemingen 2022": row["firms"],
                 "Rangschikking uit": row["rankOf"]}
        for code, label in INDICATORS:
            entry[f"Rang {label}"] = row["ranks"].get(code)
        for code, label in INDICATORS:
            if code != "AB":
                entry[f"Waarde {label}"] = row["values"].get(code)
        wide.append(entry)
    screening_df = pd.DataFrame(wide)
    screening_df.to_csv(CSV_DIR / "marktwerking_screening_bouw.csv", index=False)
    margins_long.to_csv(CSV_DIR / "marktwerking_marges.csv", index=False)

    if not args.no_excel:
        from scripts.excel_common import build_workbook

        # Omzet kan een bereik als tekst zijn; houd de kolom daarom als tekst of getal zoals in de bron.
        payload["excelDownload"] = {
            "href": "data/marktwerking-data.xlsx",
            "filename": build_workbook(
                organisation="Embuild Vlaanderen",
                title="Marktwerking en marges in de bouw",
                source="FOD Economie - Horizontale screening van sectoren 2025",
                sheets=[
                    ("Screening bouw", screening_df, "tblScreening",
                     "Bouwsubsectoren (NACE 5-cijfers) en bouwmaterialen: rang en waarde per screeningsindicator."),
                    ("Marges", margins_long, "tblMarges",
                     "Netto marges 2018-2023 per sector: bouw, andere diensten en industrie."),
                ],
                notes=[
                    "Rangschikking: bij de screening van diensten is de rang op 369 sectoren, bij de industrie op 223 (kolom Rangschikking uit).",
                    "Bij de concentratie-indicator (HHI) horen hoge rangen bij lage concentratie. Voor de interpretatie van de andere indicatoren: zie het methodologisch rapport van de screening 2025.",
                    "Omzet kan om vertrouwelijkheidsredenen als bereik (tekst) staan, bv. '420 tot 600'.",
                    "Marges zijn omgerekend van fractie naar procent. Geglobaliseerd = totaal over alle bedrijven; mediaan = typisch bedrijf.",
                ],
                xlsx_path=XLSX_PATH,
                download_suffix="Marktwerking bouw",
            ),
        }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Marktwerking: {len(screening)} sectoren in de screening, {len(series)} reeksen met marges.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
