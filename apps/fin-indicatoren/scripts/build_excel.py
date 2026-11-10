#!/usr/bin/env python3
"""Bouw het Excel-werkboek (Embuild-template) met alle data van de fin-indicatoren blog.

Wordt aangeroepen door process_data.py na elke data-update. Schrijft
public/data/fin-indicatoren-data.xlsx (vaste bestandsnaam voor de downloadknop) en geeft
de naam terug waaronder de browser het bestand moet bewaren (YYMMDD - Embuild Vlaanderen - ...).
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from embuild_spreadsheet_builder import EmbuildBuilder  # noqa: E402

PUBLIC_DATA_DIR = APP_ROOT / "public" / "data"
XLSX_PATH = PUBLIC_DATA_DIR / "fin-indicatoren-data.xlsx"
ORGANISATION = "Embuild Vlaanderen"
TITLE = "Financiële indicatoren bouwsector"
SOURCE = "Nationale Bank van België - CBRATIOSE"

SHEETS = [
    ("Bouw vs alle sectoren", "cbratiose_bouw_vs_alle_sectoren_long.csv", "tblBouwAlleSectoren",
     "Alle waarnemingen bouwnijverheid (PU300) en geheel van de sectoren (PU450), per jaarrekeningmodel."),
    ("Vergelijking", "cbratiose_bouw_vs_alle_sectoren_comparison.csv", "tblVergelijking",
     "Bouw naast alle sectoren, met verschil en verhouding per ratio, jaar en model."),
    ("Bouw vs andere sectoren", "cbratiose_bouw_vs_andere_sectoren_long.csv", "tblAndereSectoren",
     "Bouw naast andere hoofdsectoren (model T, gewogen gemiddelde)."),
    ("Bouwsubsectoren", "cbratiose_bouwsubsectoren_long.csv", "tblBouwsubsectoren",
     "Geselecteerde bouwsubsectoren (model T, gewogen gemiddelde)."),
]

HEADERS = {
    "year": "Jaar",
    "ratio_order": "Volgorde ratio",
    "ratio_code": "Ratiocode",
    "ratio_label_nl": "Ratio",
    "sector_order": "Volgorde sector",
    "sector_code": "Sectorcode",
    "sector_label_nl": "Sector",
    "sector_short_label": "Sector (kort)",
    "dispersion_order": "Volgorde statistiek",
    "dispersion_code": "Statistiek (code)",
    "dispersion_label_nl": "Statistiek",
    "scheme_order": "Volgorde model",
    "scheme_code": "Jaarrekeningmodel (code)",
    "scheme_label_nl": "Jaarrekeningmodel",
    "value": "Waarde",
    "unit_measure": "Eenheid",
    "value_pu300": "Waarde bouwnijverheid (PU300)",
    "value_pu450": "Waarde alle sectoren (PU450)",
    "difference_pu300_minus_pu450": "Verschil bouw min alle sectoren",
    "ratio_pu300_div_pu450": "Verhouding bouw / alle sectoren",
}
# Verduidelijking van codes in waarden; ongekende waarden blijven ongewijzigd.
VALUE_MAPS = {
    "scheme_label_nl": {"Volledig + Verkort + Micro": "Totaal (volledig + verkort + micro)"},
    "unit_measure": {"_Z": "Niet van toepassing", "EUR": "Euro"},
}


def prepare(frame: pd.DataFrame) -> pd.DataFrame:
    """Laat kolommen met overal dezelfde waarde weg, verduidelijk waarden en hernoem de kopteksten."""
    frame = frame.loc[:, frame.nunique(dropna=False) > 1].copy()
    for col, mapping in VALUE_MAPS.items():
        if col in frame.columns:
            frame[col] = frame[col].replace(mapping)
    return frame.rename(columns=HEADERS)


def build_excel(latest_year: int) -> str:
    b = EmbuildBuilder()
    wb = b.new_workbook()
    today = datetime.date.today()
    as_of = today.strftime("%d/%m/%Y")

    # Voorblad
    ws = wb.create_sheet("Over deze data")
    n_cols = 12
    for i in range(1, n_cols + 1):
        ws.column_dimensions[chr(64 + i)].width = 14
    row = b.add_title_bar(ws, 1, f"{ORGANISATION} | {TITLE}",
                          f"Reeks 2009 t.e.m. {latest_year} | Bron: {SOURCE}", n_cols)
    row += 1
    row = b.add_section_bar(ws, row, "Inhoud van dit werkboek", n_cols)
    for name, _csv, _tbl, desc in SHEETS:
        b.add_wide_nav_button(ws, row, 1, 4, name, name)
        ws.merge_cells(start_row=row, start_column=5, end_row=row, end_column=n_cols)
        cell = ws.cell(row=row, column=5, value=desc)
        cell.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
        ws.row_dimensions[row].height = 26
        row += 1
    row += 1
    row = b.add_section_bar(ws, row, "Gebruik", n_cols)
    notes = [
        "Elk tabblad is een Excel-tabel met filters: klik in de tabel en kies Invoegen > Draaitabel voor eigen analyses.",
        "Codes (ratio, sector, statistiek, model) staan naast hun omschrijving, zodat je op beide kan filteren. Kolommen met overal dezelfde waarde zijn weggelaten.",
        "Modellen: C = volledig, A = verkort, M = micro, T = totaal. Statistiek: dispg = gewogen gemiddelde, dispq2 = mediaan, dispnb = aantal ondernemingen.",
        "De cijfers worden rechtstreeks uit de NBB-dataset (SDMX-API) opgehaald en onbewerkt weergegeven.",
    ]
    for text in notes:
        row = b.add_prose(ws, row, text, n_cols=n_cols, chars_per_line=110)
    row += 1
    b.add_metadata_footer(ws, row, SOURCE, as_of, ORGANISATION, n_cols)
    b.set_dashboard_page_setup(ws)

    for name, csv_name, table, _desc in SHEETS:
        frame = prepare(pd.read_csv(PUBLIC_DATA_DIR / csv_name))
        headers = list(frame.columns)
        types, float_cols = [], []
        for idx, col in enumerate(headers):
            if col == "Jaar":
                types.append("year")
            elif pd.api.types.is_float_dtype(frame[col]):
                types.append("number")
                float_cols.append(idx + 1)
            elif pd.api.types.is_integer_dtype(frame[col]):
                types.append("number")
            else:
                types.append("text")
        rows = [[None if pd.isna(v) else (v.item() if hasattr(v, "item") else v) for v in r]
                for r in frame.itertuples(index=False, name=None)]
        widths = {i: max(len(headers[i]) + 4, 14 if types[i] != "text" else min(48, int(frame[headers[i]].astype(str).str.len().quantile(0.9)) + 2))
                  for i in range(len(headers))}
        sheet = b.build_data_sheet(
            wb, title=f"{TITLE} | {name}", headers=headers, rows=rows, sheet_name=name,
            subtitle=f"Bron: {SOURCE} | opgehaald op {as_of}", column_widths=widths,
            column_types=types, table_name=table,
        )
        ws_data = sheet
        header_row = next(r for r in range(1, 12) if ws_data.cell(r, 1).value == headers[0])
        for col in float_cols:
            for r in range(header_row + 1, header_row + 1 + len(rows)):
                ws_data.cell(r, col).number_format = "#,##0.00"

    saved = b.save_workbook(wb, str(XLSX_PATH))
    final = Path(saved)
    if final != XLSX_PATH:
        final.replace(XLSX_PATH)
    ymd = f"{today.year % 100:02d}{today.month:02d}{today.day:02d}"
    return f"{ymd} - {ORGANISATION} - {TITLE}.xlsx"


if __name__ == "__main__":
    print(build_excel(int(sys.argv[1]) if len(sys.argv) > 1 else 2022))
