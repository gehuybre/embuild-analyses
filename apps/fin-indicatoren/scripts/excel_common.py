"""Gedeelde opbouw van een Embuild-Excelwerkboek met voorblad en één tabel per tabblad."""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from embuild_spreadsheet_builder import EmbuildBuilder  # noqa: E402


def build_workbook(*, organisation, title, source, sheets, notes, xlsx_path, download_suffix, year_col="Jaar"):
    """sheets = [(tabbladnaam, DataFrame, tabelnaam, beschrijving)]. Geeft de downloadnaam terug."""
    b = EmbuildBuilder()
    wb = b.new_workbook()
    today = datetime.date.today()
    as_of = today.strftime("%d/%m/%Y")

    ws = wb.create_sheet("Over deze data")
    n_cols = 12
    for i in range(1, n_cols + 1):
        ws.column_dimensions[chr(64 + i)].width = 14
    row = b.add_title_bar(ws, 1, f"{organisation} | {title}", f"Bron: {source}", n_cols)
    row += 1
    row = b.add_section_bar(ws, row, "Inhoud van dit werkboek", n_cols)
    for name, _frame, _tbl, desc in sheets:
        b.add_wide_nav_button(ws, row, 1, 4, name, name)
        ws.merge_cells(start_row=row, start_column=5, end_row=row, end_column=n_cols)
        cell = ws.cell(row=row, column=5, value=desc)
        cell.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
        ws.row_dimensions[row].height = 26
        row += 1
    row += 1
    row = b.add_section_bar(ws, row, "Gebruik en aandachtspunten", n_cols)
    for text in notes:
        row = b.add_prose(ws, row, text, n_cols=n_cols, chars_per_line=110)
    row += 1
    b.add_metadata_footer(ws, row, source, as_of, organisation, n_cols)
    b.set_dashboard_page_setup(ws)

    for name, frame, table, _desc in sheets:
        headers = list(frame.columns)
        types, float_cols = [], []
        for idx, col in enumerate(headers):
            if col == year_col:
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
            wb, title=f"{title} | {name}", headers=headers, rows=rows, sheet_name=name,
            subtitle=f"Bron: {source} | verwerkt op {as_of}", column_widths=widths,
            column_types=types, table_name=table,
        )
        header_row = next(r for r in range(1, 12) if sheet.cell(r, 1).value == headers[0])
        for col in float_cols:
            for r in range(header_row + 1, header_row + 1 + len(rows)):
                sheet.cell(r, col).number_format = "#,##0.0000"

    saved = b.save_workbook(wb, str(xlsx_path))
    final = Path(saved)
    if final != Path(xlsx_path):
        final.replace(xlsx_path)
    ymd = f"{today.year % 100:02d}{today.month:02d}{today.day:02d}"
    return f"{ymd} - {organisation} - {download_suffix}.xlsx"
