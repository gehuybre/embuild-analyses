#!/usr/bin/env python3
"""Bouw het Excel-werkboek (Embuild-template) met alle Eurostat SBS-data.

Schrijft public/data/eurostat-sbs-data.xlsx (vaste bestandsnaam voor de downloadknop) en geeft
de naam terug waaronder de browser het bestand bewaart (YYMMDD - Embuild Vlaanderen - ...).
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
CSV_DIR = PUBLIC_DATA_DIR / "eurostat"
XLSX_PATH = PUBLIC_DATA_DIR / "eurostat-sbs-data.xlsx"
ORGANISATION = "Embuild Vlaanderen"
TITLE = "Eurostat structurele bedrijfsstatistieken (SBS) bouw"
SOURCE = "Eurostat - Structural Business Statistics (SBS/EBS)"

SHEETS = [
    ("Bouw subsectoren", "eurostat_sbs_bouw_subsectoren.csv", "tblBouwSubsectoren",
     "België: bouwnijverheid (F) en alle subsectoren op 2-, 3- en 4-cijferniveau, per indicator en jaar."),
    ("Sectoren", "eurostat_sbs_sectoren.csv", "tblSectoren",
     "België: bouw naast de andere NACE-secties en het totaal van de marktgerichte economie."),
    ("Gewesten", "eurostat_sbs_gewesten.csv", "tblGewesten",
     "Vestigingen, tewerkstelling en lonen per gewest en provincie (lokale eenheden), per NACE-activiteit."),
]


def build_eurostat_excel() -> str:
    b = EmbuildBuilder()
    wb = b.new_workbook()
    today = datetime.date.today()
    as_of = today.strftime("%d/%m/%Y")

    frames = {name: pd.read_csv(CSV_DIR / csv) for name, csv, _t, _d in SHEETS}
    min_year = min(int(f["Jaar"].min()) for f in frames.values())
    max_year = max(int(f["Jaar"].max()) for f in frames.values())

    ws = wb.create_sheet("Over deze data")
    n_cols = 12
    for i in range(1, n_cols + 1):
        ws.column_dimensions[chr(64 + i)].width = 14
    row = b.add_title_bar(ws, 1, f"{ORGANISATION} | {TITLE}",
                          f"Reeks {min_year} t.e.m. {max_year} | Bron: {SOURCE}", n_cols)
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
    row = b.add_section_bar(ws, row, "Gebruik en aandachtspunten", n_cols)
    notes = [
        "Elk tabblad is een Excel-tabel met filters: klik in de tabel en kies Invoegen > Draaitabel voor eigen analyses.",
        "Reeksbreuk: Eurostat publiceert 2005-2020 (SBS-verordening) en vanaf 2021 (EBS-verordening) apart. De kolom Bronreeks toont de herkomst; vergelijk niveaus over 2020-2021 heen met voorzichtigheid.",
        "Het totaal van de marktgerichte economie heeft vóór en vanaf 2021 een andere afbakening.",
        "Enkele indicatoren heten anders in beide reeksen: omzet (Turnover) vs nettoomzet (Net turnover), productiewaarde vs waarde van de output, toegevoegde waarde tegen factorkost vs toegevoegde waarde, personeelskosten vs kosten van werknemersvergoedingen, en investeringen in materiële goederen vs materiële vaste activa. De ruwe bronbestanden in downloads/eurostat/ bevatten beide benamingen.",
        "Gewesten: de regionale cijfers gaan over vestigingen (lokale eenheden) en niet over ondernemingen. Brussel = NUTS1 BE1, Vlaanderen = BE2, Wallonië = BE3; provincies zijn NUTS2.",
        "Eurostat-vlag: b = reeksbreuk, c = vertrouwelijk, e = geschat, p = voorlopig, d = afwijkende definitie. Lege vlag = definitief.",
        "De cijfers worden rechtstreeks via de Eurostat-API opgehaald en onbewerkt weergegeven.",
    ]
    for text in notes:
        row = b.add_prose(ws, row, text, n_cols=n_cols, chars_per_line=110)
    row += 1
    b.add_metadata_footer(ws, row, SOURCE, as_of, ORGANISATION, n_cols)
    b.set_dashboard_page_setup(ws)

    for name, _csv, table, _desc in SHEETS:
        frame = frames[name].fillna({"Eurostat-vlag": ""})
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
        header_row = next(r for r in range(1, 12) if sheet.cell(r, 1).value == headers[0])
        for col in float_cols:
            for r in range(header_row + 1, header_row + 1 + len(rows)):
                sheet.cell(r, col).number_format = "#,##0.00"

    saved = b.save_workbook(wb, str(XLSX_PATH))
    final = Path(saved)
    if final != XLSX_PATH:
        final.replace(XLSX_PATH)
    ymd = f"{today.year % 100:02d}{today.month:02d}{today.day:02d}"
    return f"{ymd} - {ORGANISATION} - Eurostat SBS bouw.xlsx"


if __name__ == "__main__":
    print(build_eurostat_excel())
