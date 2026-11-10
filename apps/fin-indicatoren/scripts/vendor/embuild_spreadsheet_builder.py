"""
Embuild Spreadsheet Generator — builder module (v0.1)

Pure Python, pure openpyxl. No external dependencies beyond openpyxl itself.
Import:
    from embuild_spreadsheet_builder import EmbuildBuilder
    b = EmbuildBuilder()
    wb = b.new_workbook()
    b.build_data_sheet(wb, title="Leden register", headers=[...], rows=[...])
    b.build_dashboard_sheet(wb, title="Overzicht", kpis=[...], charts=[...])

v0.2.12 (May 2026) — FIX: add_gauge_row now accepts both tuples and dicts
  for API consistency with add_kpi_row / add_kpi_delta_row.    wb.save("output.xlsx")

Design principles
-----------------
1. Everything uses Embuild brand tokens (9 hex values, no other colors).
2. DM Sans is the preferred font but Excel will gracefully fall back to Arial
   or Calibri if DM Sans isn't installed locally — the fallback still reads
   correctly because font weights and colors are preserved.
3. Data sheets are rendered as Excel Tables (ListObject) so PivotTables can
   be created against them with zero extra setup by the user.
4. Big-data friendly: supports write-only mode for 100k+ rows, freeze panes,
   auto filter, conditional formatting, number formats.
5. Dashboard sheets follow a strict layout grid to keep visual consistency.
"""

from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, NamedStyle, Protection
)
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.chart import BarChart, LineChart, PieChart, Reference, DoughnutChart
from openpyxl.chart.series import DataPoint
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.drawing.fill import PatternFillProperties, ColorChoice
from openpyxl.drawing.line import LineProperties
from openpyxl.drawing.colors import ColorChoice as DCColorChoice
from openpyxl.drawing.image import Image as XLImage
from openpyxl.formatting.rule import (
    ColorScaleRule, CellIsRule, FormulaRule, DataBarRule
)
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.chart.text import RichText
from openpyxl.drawing.text import (
    CharacterProperties, Paragraph as DPar,
    ParagraphProperties, RichTextProperties, Font as DFont
)

# ═══════════════════════════════════════════════════════════════════════
# BRAND TOKENS — loaded from embuild-brand-core, with inline fallback
# ═══════════════════════════════════════════════════════════════════════
# Primary source: brand_tokens.py from embuild-brand-core (organization OR user mount).
# If brand-core is not installed, the inline fallback is used. The fallback
# values MUST stay in sync with brand-tokens.json — safety net only.
try:
    import sys as _sys, os as _os
    # v0.2.13: resolve brand-core from EITHER the organization or the user mount,
    # matching the dual PRIMARY_PATHS inside brand_tokens.py. A single wrong mount
    # point no longer drops the skill to its inline fallback unnecessarily.
    # v0.2.34 (Techlink-pilot): EMBUILD_BRAND kiest de brand-core
    # (`<brand>-brand-core`, default "embuild"); EMBUILD_BC_PATH gaat vooraan
    # (sandbox). Zusterkernen spiegelen de brand_tokens.py-API; de rolnamen
    # (TURQ, TEAL_*) zijn dan de accentrollen van dat merk.
    BRAND_ID = (_os.environ.get("EMBUILD_BRAND") or "embuild").strip().lower() or "embuild"
    # v0.2.37: geïntegreerde zustermerken (embuild-brand-core v1.10.0+:
    # embuild-brand-core/brands/<brand>) gaan vóór de losse <brand>-brand-core.
    _bc_dirs = ([] if BRAND_ID == "embuild" else
                ["/mnt/skills/organization/embuild-brand-core/brands/" + BRAND_ID + "/tokens",
                 "/mnt/skills/user/embuild-brand-core/brands/" + BRAND_ID + "/tokens"]) + \
               ["/mnt/skills/organization/" + BRAND_ID + "-brand-core/tokens",
                "/mnt/skills/user/" + BRAND_ID + "-brand-core/tokens"]
    if _os.environ.get("EMBUILD_BC_PATH"):
        _bc_dirs.insert(0, _os.environ["EMBUILD_BC_PATH"].rstrip("/") + "/tokens")
    for _bc_dir in reversed(_bc_dirs):
        if _os.path.isdir(_bc_dir):
            _sys.path.insert(0, _bc_dir)
    import brand_tokens as _B
    BK        = _B.BK
    W         = _B.W
    TURQ      = _B.TURQ
    TURQ_DARK = _B.TURQ_DARK
    GRAY      = _B.GRAY
    LTGRAY    = _B.LTGRAY
    LTTURQ    = _B.LTTURQ
    DKTEXT    = _B.DKTEXT
    BODY      = _B.BODY
    # Sequential teal palette
    TEAL_XDARK  = _B.TEAL_XDARK
    TEAL_DARK   = _B.TEAL_DARK
    TEAL_MID    = _B.TEAL_MID
    TEAL_LIGHT  = _B.TEAL_LIGHT
    TEAL_XLIGHT = _B.TEAL_XLIGHT
    SEQUENTIAL_TEAL_PALETTE = list(_B.SEQUENTIAL_TEAL_PALETTE)
    # Chart colors (plain hex, no FF)
    C_BK        = _B.C_BK
    C_TURQ      = _B.C_TURQ
    C_TURQ_DARK = _B.C_TURQ_DARK
    C_GRAY      = _B.C_GRAY
    C_LTGRAY    = _B.C_LTGRAY
    C_LTTURQ    = _B.C_LTTURQ
    C_DKTEXT    = _B.C_DKTEXT
    C_BODY      = _B.C_BODY
    FONT          = _B.FONT
    FONT_FALLBACK = _B.FONT_FALLBACK
    # v0.2.34: tekstkleur op de accentvulling (kopcellen). Embuild-kern
    # levert dit niet -> zwart, ongewijzigd. Techlink: wit op navy.
    ON_TURQ   = getattr(_B, "ON_TURQ", BK)
    # v0.2.34: accent op de zwarte balken (titelrand, footer-tagline). Embuild:
    # turquoise (ongewijzigd). Techlink: groen, want navy op zwart is onleesbaar.
    ACCENT_ON_DARK = getattr(_B, "ACCENT_ON_DARK", TURQ)
    # v0.2.35: donkere balken (titel, sectiebalk, footer) en de tagline-tekst
    # daarop. Embuild: zwart en turquoise (ongewijzigd). Techlink: navy en wit
    # (optie A: geen accentkleur als tekst op donker).
    DARK_BAR        = getattr(_B, "DARK_BAR", BK)
    TAGLINE_ON_DARK = getattr(_B, "TAGLINE_ON_DARK", ACCENT_ON_DARK)
    # v0.2.34: merknaam, tagline en website uit de kern (footer). Defaults
    # zijn de oude literals, dus Embuild-output blijft identiek.
    try:
        _bm = _B.load_brand()
        BRAND_NAME    = (_bm.get("brand") or {}).get("name") or "Embuild"
        BRAND_TAGLINE = ((_bm.get("brand") or {}).get("tagline") or {}).get("nl") or "Progress. Together."
        BRAND_WEB     = ((_bm.get("contact") or {}).get("webNl") or "www.embuild.be").split("  ")[0]
    except Exception:
        BRAND_NAME, BRAND_TAGLINE, BRAND_WEB = "Embuild", "Progress. Together.", "www.embuild.be"
except Exception:
    # Inline fallback — keep in sync with brand-tokens.json
    BK        = "FF000000"
    W         = "FFFFFFFF"
    TURQ      = "FF4F868F"
    TURQ_DARK = "FF3F6B72"
    GRAY      = "FFC6C6C6"
    LTGRAY    = "FFEDEDED"
    LTTURQ    = "FFD9E1E2"
    DKTEXT    = "FF000000"  # v0.2.28: gesynct met brand-core v1.7.23+ (was FF212121)
    BODY      = "FF000000"  # v0.2.28: gesynct met brand-core v1.7.23+ (was FF4A4A4A)
    # Sequential teal palette
    TEAL_XDARK  = "FF243C40"
    TEAL_DARK   = "FF2F5056"
    TEAL_MID    = "FF6998A0"
    TEAL_LIGHT  = "FFA7C2C7"
    TEAL_XLIGHT = "FFC1D5D8"
    SEQUENTIAL_TEAL_PALETTE = [
        (TEAL_XDARK,  W),
        (TURQ_DARK,   W),
        (TEAL_MID,    W),
        (TURQ,        DKTEXT),
        (TEAL_LIGHT,  DKTEXT),
        (TEAL_XLIGHT, DKTEXT),
        (LTTURQ,      DKTEXT),
    ]
    # Chart colors (plain hex)
    C_BK        = "000000"
    C_TURQ      = "4F868F"
    C_TURQ_DARK = "3F6B72"
    C_GRAY      = "C6C6C6"
    C_LTGRAY    = "EDEDED"
    C_LTTURQ    = "D9E1E2"
    C_DKTEXT    = "000000"  # v0.2.28: gesynct (was 212121)
    C_BODY      = "000000"  # v0.2.28: gesynct (was 4A4A4A)
    FONT          = "DM Sans"
    FONT_FALLBACK = "Arial"
    ON_TURQ       = "FF000000"
    ACCENT_ON_DARK = "FF4F868F"
    DARK_BAR        = "FF000000"
    TAGLINE_ON_DARK = "FF4F868F"
    BRAND_NAME, BRAND_TAGLINE, BRAND_WEB = "Embuild", "Progress. Together.", "www.embuild.be"
    BRAND_ID      = "embuild"

def _font(size=10, bold=False, color=DKTEXT, italic=False):
    return Font(name=FONT, size=size, bold=bold, italic=italic, color=color)

def _fill(color):
    return PatternFill(start_color=color, end_color=color, fill_type="solid")

def _border(color=LTGRAY, sides="all"):
    side = Side(style="thin", color=color)
    none = Side(style=None)
    if sides == "all":
        return Border(left=side, right=side, top=side, bottom=side)
    if sides == "bottom":
        return Border(left=none, right=none, top=none, bottom=side)
    if sides == "top":
        return Border(left=none, right=none, top=side, bottom=none)
    return Border()

def _align(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


def allocate_cells(pcts, n_cells):
    """Largest remainder method for marimekko-style bar allocation.

    Distributes ``n_cells`` among items proportionally to ``pcts``. Each
    item with ``pct > 0`` is guaranteed at least 1 cell.

    pcts : list of floats in [0, 1], should sum to ~1
    n_cells : integer total cells to distribute

    Returns a list of integers with sum == n_cells.
    """
    raw = [p * n_cells for p in pcts]
    ints = [max(1, int(r)) if p > 0 else 0 for p, r in zip(pcts, raw)]
    while sum(ints) < n_cells:
        diffs = sorted(
            [(raw[i] - ints[i], i) for i in range(len(raw)) if pcts[i] > 0],
            reverse=True,
        )
        ints[diffs[0][1]] += 1
    while sum(ints) > n_cells:
        diffs = sorted(
            [(ints[i] - raw[i], i) for i in range(len(raw)) if ints[i] > 1],
            reverse=True,
        )
        ints[diffs[0][1]] -= 1
    return ints


def _fill_cell(ws, row, col, color):
    """Shortcut to set a single cell's fill color."""
    ws.cell(row=row, column=col).fill = PatternFill(
        start_color=color, end_color=color, fill_type="solid"
    )


# ═══════════════════════════════════════════════════════════════════════
# MAIN BUILDER CLASS
# ═══════════════════════════════════════════════════════════════════════
class EmbuildBuilder:
    """Factory for Embuild-branded Excel workbooks.

    Typical usage:
        b = EmbuildBuilder()
        wb = b.new_workbook()
        b.build_data_sheet(wb, ...)
        b.build_dashboard_sheet(wb, ...)
        wb.save("output.xlsx")
    """

    # ─── Workbook bootstrap ──────────────────────────────────────────
    def new_workbook(self, write_only=False):
        """Create a new workbook with Embuild named styles registered.

        write_only=True for large datasets (100k+ rows). In write-only mode,
        styles must be applied per-cell at write time and sheets cannot be
        modified after writing.
        """
        wb = Workbook(write_only=write_only)
        if not write_only:
            # Remove default sheet; caller will add named sheets
            if wb.worksheets:
                wb.remove(wb.active)
            self._register_styles(wb)
        return wb

    def save_workbook(self, wb, path, max_name_len=80):
        """v0.2.31: centrale save-stap, VERPLICHT i.p.v. wb.save(path).

        Doet twee dingen (aanleiding: ATLAS-feedback 06/07/2026, score 1/5):
          (1) vervangt de YYMMDD-placeholder (en {DATE}) in de bestandsnaam
              automatisch door de datum van vandaag — zelfde gedrag als de
              pptx-skill sinds v10.83;
          (2) legt een harde cap op de LENGTE van de bestandsnaam (default
              80 tekens incl. extensie). Een gegenereerde naam duwde bij een
              gebruiker het volledige Windows-pad over de MAX_PATH-grens van
              260 tekens, waardoor het bestand niet geopend kon worden. De
              titel wordt op een woordgrens ingekort; datum- en organisatie-
              segment blijven intact.
        Retourneert het effectieve pad waaronder is opgeslagen."""
        import datetime
        import os
        d = datetime.date.today()
        ymd = f"{d.year % 100:02d}{d.month:02d}{d.day:02d}"
        directory, name = os.path.split(path)
        name = name.replace("YYMMDD", ymd).replace("{DATE}", ymd)
        base, ext = os.path.splitext(name)
        if len(base) + len(ext) > max_name_len:
            keep = max_name_len - len(ext)
            cut = base[:keep]
            sp = cut.rstrip().rfind(" ")
            if sp > int(keep * 0.5):
                cut = cut[:sp]
            base = cut.rstrip(" -\u2013.")
        final = os.path.join(directory, base + ext)
        wb.save(final)
        return final

    def _register_styles(self, wb):
        """Register reusable named styles so cells can reference them by name.
        This is more efficient than setting font/fill/border per cell when the
        same style is used 1000+ times.
        """
        styles = {
            "embuild_title": NamedStyle(
                name="embuild_title",
                font=_font(size=18, bold=True, color=W),
                fill=_fill(DARK_BAR),
                alignment=_align("left", "center"),
                border=_border(ACCENT_ON_DARK, "bottom"),
            ),
            "embuild_subtitle": NamedStyle(
                name="embuild_subtitle",
                font=_font(size=11, bold=False, color=BODY),
                alignment=_align("left", "center"),
            ),
            "embuild_header": NamedStyle(
                name="embuild_header",
                font=_font(size=10, bold=True, color=ON_TURQ),
                fill=_fill(TURQ),
                alignment=_align("center", "center", wrap=True),
                border=_border(LTGRAY, "all"),
            ),
            "embuild_body": NamedStyle(
                name="embuild_body",
                font=_font(size=10, color=BODY),
                alignment=_align("left", "center"),
                border=_border(LTGRAY, "all"),
            ),
            "embuild_body_stripe": NamedStyle(
                name="embuild_body_stripe",
                font=_font(size=10, color=BODY),
                fill=_fill(LTGRAY),
                alignment=_align("left", "center"),
                border=_border(LTGRAY, "all"),
            ),
            "embuild_numeric": NamedStyle(
                name="embuild_numeric",
                font=_font(size=10, color=DKTEXT),
                alignment=_align("right", "center"),
                border=_border(LTGRAY, "all"),
                number_format="#,##0",
            ),
            "embuild_year": NamedStyle(
                name="embuild_year",
                font=_font(size=10, color=DKTEXT),
                alignment=_align("center", "center"),
                border=_border(LTGRAY, "all"),
                number_format="0",
            ),
            "embuild_currency": NamedStyle(
                name="embuild_currency",
                font=_font(size=10, color=DKTEXT),
                alignment=_align("right", "center"),
                border=_border(LTGRAY, "all"),
                number_format='#,##0 "€"',
            ),
            "embuild_percent": NamedStyle(
                name="embuild_percent",
                font=_font(size=10, bold=True, color=TURQ_DARK),
                alignment=_align("right", "center"),
                border=_border(LTGRAY, "all"),
                number_format="0.0%",
            ),
            "embuild_date": NamedStyle(
                name="embuild_date",
                font=_font(size=10, color=BODY),
                alignment=_align("center", "center"),
                border=_border(LTGRAY, "all"),
                number_format="dd/mm/yyyy",
            ),
            "embuild_total": NamedStyle(
                name="embuild_total",
                font=_font(size=11, bold=True, color=DKTEXT),
                fill=_fill(LTTURQ),
                alignment=_align("right", "center"),
                border=_border(TURQ_DARK, "top"),
                number_format="#,##0",
            ),
            "embuild_kpi_value": NamedStyle(
                name="embuild_kpi_value",
                font=_font(size=28, bold=True, color=DKTEXT),
                fill=_fill(LTTURQ),
                alignment=_align("center", "center"),
            ),
            "embuild_kpi_label": NamedStyle(
                name="embuild_kpi_label",
                font=_font(size=9, bold=True, color=TURQ_DARK),
                fill=_fill(LTTURQ),
                alignment=_align("center", "center", wrap=True),
            ),
            "embuild_section_label": NamedStyle(
                name="embuild_section_label",
                font=_font(size=9, bold=True, color=TURQ_DARK),
                alignment=_align("left", "center"),
            ),
            "embuild_section_title": NamedStyle(
                name="embuild_section_title",
                font=_font(size=14, bold=True, color=DKTEXT),
                alignment=_align("left", "center"),
            ),
            "embuild_section_bar": NamedStyle(
                name="embuild_section_bar",
                font=_font(size=11, bold=True, color=W),
                fill=_fill(DARK_BAR),
                alignment=_align("left", "center"),
                border=_border(TURQ, "bottom"),
            ),
            "embuild_kpi_delta_up": NamedStyle(
                name="embuild_kpi_delta_up",
                font=_font(size=10, bold=True, color=TURQ_DARK),
                fill=_fill(LTTURQ),
                alignment=_align("center", "center"),
                number_format='"▲ "+0.0%;"▼ "-0.0%;"− "0.0%',
            ),
            "embuild_kpi_delta_down": NamedStyle(
                name="embuild_kpi_delta_down",
                font=_font(size=10, bold=True, color=BODY),
                fill=_fill(LTTURQ),
                alignment=_align("center", "center"),
                number_format='"▲ "+0.0%;"▼ "-0.0%;"− "0.0%',
            ),
            "embuild_nav_button": NamedStyle(
                name="embuild_nav_button",
                font=_font(size=10, bold=True, color=TURQ_DARK, italic=False),
                fill=_fill(LTTURQ),
                alignment=_align("center", "center"),
                border=_border(TURQ_DARK, "all"),
            ),
            "embuild_footer": NamedStyle(
                name="embuild_footer",
                font=_font(size=9, color=W),
                fill=_fill(DARK_BAR),
                alignment=_align("left", "center"),
            ),
            "embuild_footer_tagline": NamedStyle(
                name="embuild_footer_tagline",
                font=_font(size=10, bold=True, color=TAGLINE_ON_DARK),
                fill=_fill(DARK_BAR),
                alignment=_align("right", "center"),
            ),
        }
        for style in styles.values():
            if style.name not in wb.named_styles:
                wb.add_named_style(style)

    # ─── Sheet builders ──────────────────────────────────────────────

    def build_data_sheet(
        self,
        wb,
        title,
        headers,
        rows,
        sheet_name=None,
        subtitle=None,
        column_widths=None,
        column_types=None,
        table_name=None,
        freeze=True,
        auto_filter=True,
        totals=None,
        conditional_columns=None,
        big_data=False,
    ):
        """Build a styled big-data sheet.

        Parameters
        ----------
        wb : Workbook
        title : str
            Top banner title, rendered in black bar.
        headers : list[str]
            Column header labels.
        rows : iterable of lists
            Data rows. Each row must have len(headers) items.
        sheet_name : str
            Excel sheet tab name (auto-generated from title if omitted).
        subtitle : str
            Optional descriptive sub-line under the title.
        column_widths : list[int] or dict
            Width per column. Dict lets you set only specific columns.
        column_types : list[str]
            One of: "text", "number", "year", "currency", "percent", "date".
            Controls which named style is applied per column.
        table_name : str
            Excel Table (ListObject) internal name. Must be unique per workbook.
            A Table makes the data pivot-ready: users can insert PivotTable
            against it and refer to it by name.
        freeze : bool
            Freeze header row so it stays visible when scrolling.
        auto_filter : bool
            Enable filter dropdowns on header row.
        totals : dict
            {col_idx: "sum"|"average"|"count"} — adds a totals row at the bottom.
        conditional_columns : list[dict]
            [{"col": 5, "rule": "colorscale"|"databar"|"top10"|"threshold", ...}]
        big_data : bool
            When True, optimizes for datasets >10k rows:
            - No per-cell NamedStyle assignment on data rows (relies on
              Excel Table banded rows for alternating colors)
            - Number formats still applied per cell (just number_format, not
              full NamedStyle — this is faster)
            - Conditional formatting is still applied but consider disabling
              it manually for >100k rows to keep Excel performant
            Massively reduces output file size and generation time for large
            datasets. Appearance is nearly identical because the Excel Table
            style provides the banded rows and borders automatically.
        """
        sheet_name = sheet_name or self._sheet_name(title)
        ws = wb.create_sheet(sheet_name)

        # Row 1: black title bar (merged across all columns)
        n_cols = len(headers)
        last_col = get_column_letter(n_cols)
        ws.merge_cells(f"A1:{last_col}1")
        ws["A1"] = title
        ws["A1"].style = "embuild_title"
        ws.row_dimensions[1].height = 32

        # Row 2: empty spacer
        ws.row_dimensions[2].height = 6

        # Row 3: subtitle (optional)
        if subtitle:
            ws.merge_cells(f"A3:{last_col}3")
            ws["A3"] = subtitle
            ws["A3"].style = "embuild_subtitle"
            ws.row_dimensions[3].height = 18
            header_row_idx = 5
            ws.row_dimensions[4].height = 6
        else:
            header_row_idx = 3

        # Header row
        for col_idx, label in enumerate(headers, start=1):
            cell = ws.cell(row=header_row_idx, column=col_idx, value=label)
            cell.style = "embuild_header"
        ws.row_dimensions[header_row_idx].height = 26

        # Data rows
        data_start = header_row_idx + 1

        # Number format map for big_data mode (applied per cell via number_format only)
        nf_map = {
            "number": "#,##0",
            "year": "0",
            "currency": '#,##0 "€"',  # v0.2.30: gelijkgetrokken met embuild_currency (was #,##0.00)
            "percent": "0.0%",
            "date": "dd/mm/yyyy",
        }

        row_count = 0
        for r_idx, row in enumerate(rows):
            excel_row = data_start + r_idx
            row_count += 1
            if big_data:
                # Fast path: no NamedStyle, just number_format per cell
                for c_idx, value in enumerate(row, start=1):
                    cell = ws.cell(row=excel_row, column=c_idx, value=value)
                    if column_types and c_idx - 1 < len(column_types):
                        ctype = column_types[c_idx - 1]
                        if ctype in nf_map:
                            cell.number_format = nf_map[ctype]
            else:
                # Full styling (small datasets)
                style_stripe = (r_idx % 2 == 1)
                for c_idx, value in enumerate(row, start=1):
                    cell = ws.cell(row=excel_row, column=c_idx, value=value)
                    style_name = self._pick_style(
                        column_types, c_idx - 1, style_stripe
                    )
                    cell.style = style_name

        data_end = data_start + row_count - 1

        # Totals row (optional)
        if totals:
            totals_row = data_end + 1
            for col_idx in range(1, n_cols + 1):
                cell = ws.cell(row=totals_row, column=col_idx)
                cell.style = "embuild_total"
                if (col_idx - 1) in totals:
                    op = totals[col_idx - 1]
                    col_letter = get_column_letter(col_idx)
                    rng = f"{col_letter}{data_start}:{col_letter}{data_end}"
                    if op == "sum":
                        cell.value = f"=SUM({rng})"
                    elif op == "average":
                        cell.value = f"=AVERAGE({rng})"
                    elif op == "count":
                        cell.value = f"=COUNTA({rng})"
                elif col_idx == 1:
                    cell.value = "Totaal"
                    cell.alignment = _align("left", "center")
            data_end = totals_row  # include totals row in table

        # Wrap the data range in an Excel Table so it becomes pivot-ready.
        # The table_name must be a valid Excel defined-name (no spaces).
        if table_name:
            ref = f"A{header_row_idx}:{last_col}{data_end}"
            safe_name = "".join(
                c if c.isalnum() or c == "_" else "_" for c in table_name
            )
            tbl = Table(displayName=safe_name, ref=ref)
            # In big_data mode, let the Table style handle banded rows since we
            # skipped per-cell striping. In normal mode, use the light style
            # so our manual striping shows through.
            if big_data:
                style_name = "TableStyleLight9"
                show_stripes = True
            else:
                style_name = "TableStyleLight1"
                show_stripes = False
            tbl.tableStyleInfo = TableStyleInfo(
                name=style_name,
                showFirstColumn=False,
                showLastColumn=False,
                showRowStripes=show_stripes,
                showColumnStripes=False,
            )
            if totals:
                tbl.totalsRowShown = False  # we render our own totals row
            ws.add_table(tbl)

        # Freeze header and enable filter
        if freeze:
            ws.freeze_panes = f"A{data_start}"
        if auto_filter and not table_name:
            # Only set worksheet-level autoFilter when NO Excel Table is present.
            # When table_name is set, the Table element owns the filter dropdowns;
            # adding a second autoFilter on the same range causes Excel to reject
            # the table with a "We found a problem" repair dialog.
            ws.auto_filter.ref = f"A{header_row_idx}:{last_col}{data_start + len(rows) - 1}"

        # Column widths
        if column_widths:
            if isinstance(column_widths, dict):
                for col_idx, w in column_widths.items():
                    ws.column_dimensions[get_column_letter(col_idx + 1)].width = w
            else:
                for col_idx, w in enumerate(column_widths):
                    ws.column_dimensions[get_column_letter(col_idx + 1)].width = w
        else:
            # Auto-fit based on header + sample
            self._auto_width(ws, headers, rows, n_cols)

        # Conditional formatting
        if conditional_columns:
            for cfg in conditional_columns:
                self._apply_conditional(
                    ws, cfg, data_start, data_end - (1 if totals else 0), n_cols
                )

        # Print setup: landscape, fit to page width, repeat header row on each page
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0  # unlimited height pages
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_margins.left = 0.4
        ws.page_margins.right = 0.4
        ws.page_margins.top = 0.5
        ws.page_margins.bottom = 0.5
        ws.print_options.horizontalCentered = True
        ws.print_title_rows = f"{header_row_idx}:{header_row_idx}"

        return ws

    def build_dashboard_sheet(
        self,
        wb,
        title,
        subtitle=None,
        kpis=None,
        charts=None,
        sheet_name=None,
    ):
        """Build a dashboard sheet with title bar, KPI cards, and charts.

        Parameters
        ----------
        kpis : list[dict]
            [{"value": "1.245", "label": "Leden"}, ...] — rendered as 4-column
            KPI card row. Each card is 3 columns wide, 3 rows tall.
        charts : list[dict]
            [{"type": "bar"|"line"|"pie"|"doughnut", "title": str,
              "data_sheet": str, "data_ref": "B5:C10",
              "category_ref": "A5:A10", "position": "B15"}]
        """
        sheet_name = sheet_name or self._sheet_name(title)
        ws = wb.create_sheet(sheet_name)

        # Row 1: black title bar, merged A1:M1
        ws.merge_cells("A1:M1")
        ws["A1"] = title
        ws["A1"].style = "embuild_title"
        ws.row_dimensions[1].height = 36

        # Row 2: optional subtitle
        next_row = 3
        if subtitle:
            ws.merge_cells(f"A2:M2")
            ws["A2"] = subtitle
            ws["A2"].style = "embuild_subtitle"
            ws.row_dimensions[2].height = 20
            next_row = 4

        # Empty spacer row
        ws.row_dimensions[next_row].height = 8
        kpi_row = next_row + 1

        # KPI cards: 4 cards side by side, each 3 columns wide
        # Layout: A-C card 1, D-F card 2, G-I card 3, J-L card 4
        if kpis:
            for i, kpi in enumerate(kpis[:4]):
                col_start = 1 + i * 3
                col_end = col_start + 2
                value_range = (
                    f"{get_column_letter(col_start)}{kpi_row}:"
                    f"{get_column_letter(col_end)}{kpi_row}"
                )
                label_range = (
                    f"{get_column_letter(col_start)}{kpi_row + 1}:"
                    f"{get_column_letter(col_end)}{kpi_row + 1}"
                )
                ws.merge_cells(value_range)
                ws.merge_cells(label_range)
                vc = ws.cell(row=kpi_row, column=col_start, value=kpi["value"])
                vc.style = "embuild_kpi_value"
                lc = ws.cell(row=kpi_row + 1, column=col_start, value=kpi["label"])
                lc.style = "embuild_kpi_label"
            ws.row_dimensions[kpi_row].height = 50
            ws.row_dimensions[kpi_row + 1].height = 22
            next_row = kpi_row + 2

        # Give the KPI columns a decent width
        for col_idx in range(1, 13):
            ws.column_dimensions[get_column_letter(col_idx)].width = 14

        # Charts: placed below KPIs, default position starts at column B
        if charts:
            chart_anchor_row = next_row + 2
            for i, chart_cfg in enumerate(charts):
                chart = self._make_chart(wb, chart_cfg)
                if chart:
                    # Place charts in a 2-column grid: 1st left, 2nd right, etc.
                    if i % 2 == 0:
                        anchor = f"A{chart_anchor_row + (i // 2) * 18}"
                    else:
                        anchor = f"G{chart_anchor_row + (i // 2) * 18}"
                    ws.add_chart(chart, anchor)

        # Hide gridlines on dashboard sheets for cleaner visual
        ws.sheet_view.showGridLines = False

        # Print setup: landscape A4, fit the whole dashboard to one page
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_margins.left = 0.3
        ws.page_margins.right = 0.3
        ws.page_margins.top = 0.4
        ws.page_margins.bottom = 0.4
        ws.print_options.horizontalCentered = True

        return ws

    # ─── Chart builders ──────────────────────────────────────────────

    def _make_chart(self, wb, cfg):
        """Build a styled chart from a config dict.

        cfg = {
            "type": "bar" | "column" | "line" | "pie" | "doughnut",
            "title": str,
            "data_sheet": str,
            "data_ref": "B5:C10",     # values range including header row
            "category_ref": "A5:A10", # category labels
            "width": int (cm, default 14),
            "height": int (cm, default 8),
        }
        """
        chart_type = cfg.get("type", "bar")

        if chart_type in ("bar", "column"):
            chart = BarChart()
            chart.type = "col" if chart_type == "column" else "bar"
            chart.style = 2
        elif chart_type == "line":
            chart = LineChart()
            chart.style = 2
        elif chart_type == "pie":
            chart = PieChart()
        elif chart_type == "doughnut":
            chart = DoughnutChart()
        else:
            return None

        chart.title = cfg.get("title", "")
        chart.width = cfg.get("width", 14)
        chart.height = cfg.get("height", 8)

        # Data and categories
        data_sheet_name = cfg["data_sheet"]
        data_sheet = wb[data_sheet_name]

        data_ref = cfg["data_ref"]
        cat_ref = cfg.get("category_ref")

        # Quote sheet name if it contains spaces or special chars
        def _quote_sheet(name):
            if any(c in name for c in " -!&()"):
                return f"'{name}'"
            return name
        qname = _quote_sheet(data_sheet_name)

        data = Reference(data_sheet, range_string=f"{qname}!{data_ref}")
        chart.add_data(data, titles_from_data=True)
        if cat_ref:
            cats = Reference(data_sheet, range_string=f"{qname}!{cat_ref}")
            chart.set_categories(cats)

        # Brand-colored series
        brand_colors = [C_TURQ_DARK, C_TURQ, C_GRAY, C_BODY]
        for i, series in enumerate(chart.series):
            color = brand_colors[i % len(brand_colors)]
            if chart_type in ("bar", "column"):
                series.graphicalProperties = GraphicalProperties(solidFill=color)
                series.graphicalProperties.line = LineProperties(solidFill=color)
            elif chart_type == "line":
                series.graphicalProperties = GraphicalProperties()
                series.graphicalProperties.line = LineProperties(
                    solidFill=color, w=28000  # ~3pt
                )
            elif chart_type in ("pie", "doughnut"):
                # Pie slices colored individually
                for j in range(len(chart.series[0].val.numRef.f.split(",")) if False else 20):
                    dp = DataPoint(idx=j, spPr=GraphicalProperties(
                        solidFill=brand_colors[j % len(brand_colors)]
                    ))
                    series.dPt.append(dp)

        # Axis styling (best-effort — openpyxl has limited chart styling)
        if hasattr(chart, "y_axis") and chart.y_axis:
            chart.y_axis.majorGridlines = None
        if hasattr(chart, "x_axis") and chart.x_axis:
            pass

        # Data labels — style per chart type, explicitly suppressing
        # category name and series name to avoid cluttered labels like
        # "Antwerpen; Aantal; 17".
        if chart_type in ("bar", "column"):
            chart.dataLabels = DataLabelList(
                showVal=True,
                showCatName=False,
                showSerName=False,
                showLegendKey=False,
                showPercent=False,
                showBubbleSize=False,
            )
            # Hide legend on single-series bar/column charts
            if len(chart.series) == 1:
                chart.legend = None
        elif chart_type in ("pie", "doughnut"):
            chart.dataLabels = DataLabelList(
                showVal=False,
                showCatName=True,
                showSerName=False,
                showLegendKey=False,
                showPercent=True,
                showBubbleSize=False,
            )
        elif chart_type == "line":
            chart.legend.position = "b" if chart.legend else "b"

        return chart

    # ─── Internal helpers ────────────────────────────────────────────

    def _sheet_name(self, title):
        name = title[:28]
        for ch in ("[", "]", "*", "?", "/", "\\", ":"):
            name = name.replace(ch, "")
        return name or "Sheet"

    def _pick_style(self, column_types, col_idx, stripe):
        """Return the named style name for a data cell based on column type."""
        if column_types and col_idx < len(column_types):
            ctype = column_types[col_idx]
            if ctype == "number":
                return "embuild_numeric"
            if ctype == "year":
                return "embuild_year"
            if ctype == "currency":
                return "embuild_currency"
            if ctype == "percent":
                return "embuild_percent"
            if ctype == "date":
                return "embuild_date"
        return "embuild_body_stripe" if stripe else "embuild_body"

    def style_numeric_range(self, ws, cell_range, kind="currency"):
        """v0.2.30: pas de standaard numerieke celstijl toe op een heel bereik.

        Bedoeld voor handgeschreven cellen en formuleblokken die niet via
        build_data_sheet lopen (bv. 'levende formules' naar een brontabblad).
        Ongelijke stijlen of formats per rij zijn de belangrijkste oorzaak van
        visueel verspringende cijfers; deze helper garandeert dat elke cel in
        het bereik dezelfde rechtsuitlijning en hetzelfde number format draagt
        als de gegenereerde tabellen.

        kind: "number" | "year" | "currency" | "percent" | "date"
        cell_range: "B4:D17", één kolom "B4:B17" of één cel "B4".
        """
        style_name = self._pick_style([kind], 0, False)
        cells = ws[cell_range]
        if not isinstance(cells, tuple):
            cells = ((cells,),)
        elif cells and not isinstance(cells[0], tuple):
            cells = (cells,)
        for row in cells:
            for cell in row:
                cell.style = style_name
        return style_name

    def _auto_width(self, ws, headers, rows, n_cols):
        """Set reasonable column widths based on header length and first 50 rows."""
        for col_idx in range(n_cols):
            header_len = len(str(headers[col_idx]))
            sample_lens = [
                len(str(row[col_idx])) for row in rows[:50]
                if col_idx < len(row) and row[col_idx] is not None
            ]
            max_len = max([header_len] + sample_lens) if sample_lens else header_len
            width = min(max(max_len + 2, 10), 40)
            ws.column_dimensions[get_column_letter(col_idx + 1)].width = width

    def _apply_conditional(self, ws, cfg, data_start, data_end, n_cols):
        """Apply conditional formatting to a column range."""
        col = cfg.get("col", 0)  # zero-indexed
        col_letter = get_column_letter(col + 1)
        rng = f"{col_letter}{data_start}:{col_letter}{data_end}"
        rule_type = cfg.get("rule", "colorscale")

        if rule_type == "colorscale":
            ws.conditional_formatting.add(rng, ColorScaleRule(
                start_type="min", start_color=C_LTTURQ,
                mid_type="percentile", mid_value=50, mid_color=C_TURQ,
                end_type="max", end_color=C_TURQ_DARK,
            ))
        elif rule_type == "databar":
            ws.conditional_formatting.add(rng, DataBarRule(
                start_type="min", end_type="max",
                color=C_TURQ_DARK, showValue=True,
            ))
        elif rule_type == "threshold":
            threshold = cfg.get("threshold", 0)
            ws.conditional_formatting.add(rng, CellIsRule(
                operator="greaterThan",
                formula=[str(threshold)],
                fill=_fill(LTTURQ),
                font=_font(bold=True, color=TURQ_DARK, size=10),
            ))

    # ─── v0.2 Rich dashboard primitives (Stephen Few / Tufte inspired) ──

    def add_title_bar(self, ws, row, title, subtitle=None, n_cols=13):
        """Black full-width title bar + optional subtitle. Standard dashboard header."""
        last_col = get_column_letter(n_cols)
        ws.merge_cells(f"A{row}:{last_col}{row}")
        cell = ws[f"A{row}"]
        cell.value = title
        cell.style = "embuild_title"
        ws.row_dimensions[row].height = 36
        if subtitle:
            ws.merge_cells(f"A{row+1}:{last_col}{row+1}")
            sc = ws[f"A{row+1}"]
            sc.value = subtitle
            sc.style = "embuild_subtitle"
            ws.row_dimensions[row+1].height = 20
            return row + 2
        return row + 1

    def add_section_bar(self, ws, row, label, n_cols=13):
        """Full-width section divider: black bar with white label + turquoise underline."""
        last_col = get_column_letter(n_cols)
        ws.merge_cells(f"A{row}:{last_col}{row}")
        cell = ws[f"A{row}"]
        cell.value = f"  {label}"
        cell.style = "embuild_section_bar"
        ws.row_dimensions[row].height = 22
        return row + 1

    def _kpi_fit(self, ws, col_start, col_end, text, base_size=28, min_size=16):
        """v0.2.31 (ATLAS-feedback 06/07/2026): garandeer dat een KPI-waarde
        VOLLEDIG zichtbaar is in de samengevoegde blokcellen. Excel negeert
        shrink-to-fit op merged cells, dus meten we zelf:
          (1) fontgrootte stapsgewijs omlaag (per 2pt) tot de tekst past,
              nooit onder min_size;
          (2) past de tekst op min_size nog niet, verbreed dan de kolommen
              van het blok gelijkmatig tot ze past.
        Afkappen van bedragen in de blokken kan zo niet meer voorkomen.
        Retourneert de gekozen fontgrootte."""
        s = "" if text is None else str(text)
        if not s:
            return base_size
        def needed(size):
            # empirisch: DM Sans/Arial bold ~ 1.15 breedte-eenheid per teken op 11pt
            return len(s) * (size / 11.0) * 1.15 + 1.0
        avail = 0.0
        for c in range(col_start, col_end + 1):
            dim = ws.column_dimensions[get_column_letter(c)]
            avail += dim.width if dim.width else 8.43
        size = base_size
        while size > min_size and needed(size) > avail:
            size -= 2
        if needed(size) > avail:
            extra = (needed(size) - avail) / (col_end - col_start + 1)
            for c in range(col_start, col_end + 1):
                dim = ws.column_dimensions[get_column_letter(c)]
                cur = dim.width if dim.width else 8.43
                dim.width = round(cur + extra, 2)
        return size

    def add_kpi_card(self, ws, row, col_start, col_span, value, label):
        """Single KPI card spanning col_span columns, 2 rows tall.

        Row layout:
          row: big value (merged cells)
          row+1: label (merged cells)
        """
        col_end = col_start + col_span - 1
        col_start_letter = get_column_letter(col_start)
        col_end_letter = get_column_letter(col_end)
        ws.merge_cells(f"{col_start_letter}{row}:{col_end_letter}{row}")
        ws.merge_cells(f"{col_start_letter}{row+1}:{col_end_letter}{row+1}")
        vc = ws[f"{col_start_letter}{row}"]
        vc.value = value
        vc.style = "embuild_kpi_value"
        # v0.2.31: fitgarantie — waarde moet volledig in het blok passen
        fit = self._kpi_fit(ws, col_start, col_end, value, base_size=28)
        if fit != 28:
            vc.font = _font(size=fit, bold=True, color=DKTEXT)
        lc = ws[f"{col_start_letter}{row+1}"]
        lc.value = label
        lc.style = "embuild_kpi_label"
        ws.row_dimensions[row].height = 46
        ws.row_dimensions[row+1].height = 20

    def add_kpi_row(self, ws, row, kpis, start_col=1, card_span=2, gap=1):
        """Row of KPI cards.

        kpis : list of {"value": str, "label": str}
        start_col : 1-indexed start column
        card_span : columns per card
        gap : columns between cards (0 for no gap)
        """
        col = start_col
        for kpi in kpis:
            self.add_kpi_card(ws, row, col, card_span, kpi["value"], kpi["label"])
            col += card_span + gap
        return row + 2

    def add_kpi_delta_card(self, ws, row, col_start, col_span, value, label, delta_text, delta_is_up):
        """KPI card with value + label + delta indicator underneath.

        3 rows tall: value, label, delta.
        delta_is_up : True = TURQ_DARK (positive/growth), False = BODY (brand-compliant,
                      never red — tonal variants only per Embuild brand rules)
        """
        col_end = col_start + col_span - 1
        a = get_column_letter(col_start)
        b = get_column_letter(col_end)

        ws.merge_cells(f"{a}{row}:{b}{row}")
        ws.merge_cells(f"{a}{row+1}:{b}{row+1}")
        ws.merge_cells(f"{a}{row+2}:{b}{row+2}")

        vc = ws[f"{a}{row}"]
        vc.value = value
        vc.style = "embuild_kpi_value"
        # v0.2.31: fitgarantie — waarde moet volledig in het blok passen
        fit = self._kpi_fit(ws, col_start, col_end, value, base_size=28)
        if fit != 28:
            vc.font = _font(size=fit, bold=True, color=DKTEXT)

        lc = ws[f"{a}{row+1}"]
        lc.value = label
        lc.style = "embuild_kpi_label"

        dc = ws[f"{a}{row+2}"]
        dc.value = delta_text
        dc.style = "embuild_kpi_delta_up" if delta_is_up else "embuild_kpi_delta_down"

        ws.row_dimensions[row].height = 42
        ws.row_dimensions[row+1].height = 18
        ws.row_dimensions[row+2].height = 18

    def add_kpi_delta_row(self, ws, row, kpis, start_col=1, card_span=2, gap=1):
        """Row of KPI cards with delta indicators.

        kpis : list of {"value": str, "label": str, "delta": str, "delta_up": bool}
        """
        col = start_col
        for kpi in kpis:
            self.add_kpi_delta_card(
                ws, row, col, card_span,
                kpi["value"], kpi["label"],
                kpi.get("delta", ""), kpi.get("delta_up", True),
            )
            col += card_span + gap
        return row + 3

    def add_nav_button(self, ws, cell_ref, label, target_sheet, target_cell="A1"):
        """Add a hyperlink styled as a brand button.

        cell_ref : e.g. "A5" or "C3"
        target_sheet : name of the sheet to jump to
        target_cell : optional target cell (default A1)
        """
        cell = ws[cell_ref]
        cell.value = label
        cell.style = "embuild_nav_button"
        # Hyperlink to another sheet: use the 'target' attribute
        # Note: openpyxl hyperlinks use the format "#'Sheet Name'!A1"
        if " " in target_sheet or "-" in target_sheet:
            link = f"#'{target_sheet}'!{target_cell}"
        else:
            link = f"#{target_sheet}!{target_cell}"
        cell.hyperlink = link

    def add_nav_bar(self, ws, row, links, start_col=1):
        """Row of navigation buttons linking to other sheets.

        links : list of {"label": "Register", "sheet": "Cotisaties 2020-2025"}
        Each button occupies 2 columns.
        """
        col = start_col
        for link in links:
            a = get_column_letter(col)
            b = get_column_letter(col + 1)
            ws.merge_cells(f"{a}{row}:{b}{row}")
            self.add_nav_button(
                ws, f"{a}{row}", f"  ▶  {link['label']}",
                link["sheet"], link.get("cell", "A1")
            )
            col += 3  # 2 wide + 1 gap
        ws.row_dimensions[row].height = 24
        return row + 1

    def add_chart_at(self, wb, ws, chart_cfg, anchor):
        """Place a chart at a specific anchor cell (vs the auto-grid of build_dashboard_sheet)."""
        chart = self._make_chart(wb, chart_cfg)
        if chart is not None:
            ws.add_chart(chart, anchor)

    def add_progress_bars_row(self, ws, row, items, start_col=1, total_width=12):
        """Add a row of visual progress indicators using bar-style cells.

        items : list of {"label": str, "pct": float (0-1), "value_text": str}
        Renders as: label | filled bar | pct text, each item on its own row.
        """
        for i, item in enumerate(items):
            r = row + i
            # Label in first cell
            lc = ws.cell(row=r, column=start_col, value=item["label"])
            lc.font = _font(size=10, bold=True, color=DKTEXT)
            lc.alignment = _align("left", "center")
            # Bar: filled portion in TURQ_DARK, background in LTGRAY
            # We approximate a bar by coloring a range of cells proportionally
            bar_start = start_col + 1
            bar_cols = total_width - 2
            filled_cols = max(1, round(bar_cols * item["pct"]))
            for bc in range(bar_cols):
                cell = ws.cell(row=r, column=bar_start + bc)
                if bc < filled_cols:
                    cell.fill = _fill(TURQ_DARK)
                else:
                    cell.fill = _fill(LTGRAY)
            # Value text in last cell
            vc = ws.cell(row=r, column=start_col + total_width - 1, value=item["value_text"])
            vc.font = _font(size=10, bold=True, color=TURQ_DARK)
            vc.alignment = _align("right", "center")
            ws.row_dimensions[r].height = 22
        return row + len(items)

    def add_metadata_footer(self, ws, row, source, as_of=None, author=None, n_cols=13):
        """Standard black footer bar with metadata + Progress. Together. tagline."""
        last_col = get_column_letter(n_cols)
        # Split the footer: left half = metadata, right half = tagline
        half = n_cols // 2
        mid_letter = get_column_letter(half)
        mid_next = get_column_letter(half + 1)

        ws.merge_cells(f"A{row}:{mid_letter}{row}")
        meta_parts = [f"Bron: {source}"]
        if as_of:
            meta_parts.append(f"Datum: {as_of}")
        meta_parts.append(author or BRAND_NAME)   # v0.2.34: merknaam uit de kern
        meta_parts.append(BRAND_WEB)
        left = ws[f"A{row}"]
        left.value = "  " + "  |  ".join(meta_parts)
        left.style = "embuild_footer"

        ws.merge_cells(f"{mid_next}{row}:{last_col}{row}")
        right = ws[f"{mid_next}{row}"]
        right.value = BRAND_TAGLINE + "  "
        right.style = "embuild_footer_tagline"

        ws.row_dimensions[row].height = 24
        return row + 1

    def set_dashboard_page_setup(self, ws, fit_width=1, fit_height=0):
        """Standard landscape A4 print setup for dashboard sheets.

        **v0.2.3 note — default changed to fit_height=0.**
        The v0.2.2 default of ``fit_height=1`` forces the entire dashboard
        onto a single A4 page, which compresses tall dashboards into
        unreadable print previews (text and bar heights become tiny). The
        new default ``fit_height=0`` lets the dashboard flow naturally
        across multiple print pages while still fitting the width. Users
        viewing on screen scroll through the dashboard as normal.

        Pass ``fit_height=1`` explicitly only when you know the dashboard
        is short enough to fit on one page (e.g. a 4-KPI + 2-chart simple
        dashboard produced by ``build_dashboard_sheet``).
        """
        ws.sheet_view.showGridLines = False
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = fit_width
        ws.page_setup.fitToHeight = fit_height
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_margins.left = 0.3
        ws.page_margins.right = 0.3
        ws.page_margins.top = 0.4
        ws.page_margins.bottom = 0.4
        ws.print_options.horizontalCentered = True

    # ─── v0.2.3: Cell-based visualizations ───────────────────────────
    #
    # These primitives render dashboard visuals as colored cells instead
    # of openpyxl Chart objects. They are MUCH more reliable than charts
    # because:
    #   1. Typography is fully controlled (brand fonts, sizes, alignment)
    #   2. Cell-based visuals render identically across Excel versions
    #      and in LibreOffice/PDF preview
    #   3. openpyxl charts have persistent issues with axis label
    #      formatting, title wrapping, data label overlap, and legend
    #      placement that become unreadable at dashboard scale
    #   4. Cell fills can reference the full Embuild brand palette
    #      directly, including the sequential teal gradient
    #
    # Rule of thumb for dashboards: reach for cell-based primitives first.
    # Only fall back to ``add_chart_at`` when a true line/scatter/time
    # series chart is required and cell-based alternatives won't work.

    def add_bar_row(
        self, ws, row, label, value_text, pct, *,
        positive=True, start_col=1, n_cols=24,
        label_span=5, value_span=3, stripe=False,
        track_color=LTGRAY, pos_color=TURQ_DARK, neg_color=TEAL_XDARK,
    ):
        """Render a single cell-based bar row on a dashboard.

        Layout:
            [ merged label ][ merged value ][ bar of colored cells ]

        Parameters
        ----------
        ws, row : target worksheet and row number (1-indexed)
        label : string shown left-aligned in the merged label cells
        value_text : string shown right-aligned in the merged value cells
        pct : float in [0, 1]; fraction of the bar area to fill
        positive : if True, fill with ``pos_color``; otherwise ``neg_color``
        n_cols : total width in grid columns (default 24)
        label_span, value_span : number of grid columns for label / value
        stripe : if True, use LTGRAY background behind label/value cells
        track_color : color of the empty (unfilled) bar track
        pos_color, neg_color : fill colors for the positive/negative bar

        Returns the next available row.
        """
        bg = LTGRAY if stripe else W
        fill_color = pos_color if positive else neg_color
        bar_span = n_cols - label_span - value_span
        # Label
        la = get_column_letter(start_col)
        lb = get_column_letter(start_col + label_span - 1)
        ws.merge_cells(f"{la}{row}:{lb}{row}")
        lc = ws[f"{la}{row}"]
        lc.value = "  " + label
        lc.font = _font(size=10, color=DKTEXT)
        lc.alignment = _align("left", "center")
        lc.fill = _fill(bg)
        for ci in range(start_col + 1, start_col + label_span):
            _fill_cell(ws, row, ci, bg)
        # Value
        va = get_column_letter(start_col + label_span)
        vb = get_column_letter(start_col + label_span + value_span - 1)
        ws.merge_cells(f"{va}{row}:{vb}{row}")
        vc = ws[f"{va}{row}"]
        vc.value = value_text
        vc.font = _font(size=10, bold=True, color=DKTEXT)
        vc.alignment = _align("right", "center")
        vc.fill = _fill(bg)
        for ci in range(start_col + label_span + 1, start_col + label_span + value_span):
            _fill_cell(ws, row, ci, bg)
        # Bar
        bs = start_col + label_span + value_span
        pct = max(0.0, min(1.0, pct))
        filled = round(bar_span * pct) if pct > 0 else 0
        for bc in range(bar_span):
            c = ws.cell(row=row, column=bs + bc)
            c.fill = _fill(fill_color if bc < filled else track_color)
        ws.row_dimensions[row].height = 22
        return row + 1

    def add_marimekko(
        self, ws, row, title, total_text, items, n_cols=24, start_col=1,
        palette=None,
    ):
        """100% stacked horizontal bar with inline labels.

        Best for composition data that is NOT too skewed. For highly
        skewed data (e.g. one item >80%), prefer :meth:`add_treemap`.

        Parameters
        ----------
        row : row of the subheader strip
        title : section title (left-aligned in LTTURQ subheader)
        total_text : total value (right-aligned in subheader)
        items : list of ``(label, pct, value_text)`` tuples. ``pct`` is a
            float in [0, 1]; the sum should equal ~1.
        n_cols : total width of the bar in grid columns
        palette : optional list of (bg_color, text_color) tuples; defaults
            to the sequential teal palette.

        Layout: 3 rows total — subheader + bar + optional legend for
        narrow segments.
        """
        if palette is None:
            palette = SEQUENTIAL_TEAL_PALETTE
        first = get_column_letter(start_col)
        last = get_column_letter(start_col + n_cols - 1)
        # Subheader (split: title left, total right)
        mid_col = start_col + (n_cols // 2) - 1
        mid_a = get_column_letter(mid_col)
        mid_b = get_column_letter(mid_col + 1)
        ws.merge_cells(f"{first}{row}:{mid_a}{row}")
        tc = ws[f"{first}{row}"]
        tc.value = "  " + title
        tc.font = _font(size=10, bold=True, color=TURQ_DARK)
        tc.alignment = _align("left", "center")
        tc.fill = _fill(LTTURQ)
        for ci in range(start_col + 1, mid_col + 1):
            _fill_cell(ws, row, ci, LTTURQ)
        ws.merge_cells(f"{mid_b}{row}:{last}{row}")
        rc = ws[f"{mid_b}{row}"]
        rc.value = total_text + "  "
        rc.font = _font(size=10, italic=True, color=BODY)
        rc.alignment = _align("right", "center")
        rc.fill = _fill(LTTURQ)
        for ci in range(mid_col + 2, start_col + n_cols + 1):
            _fill_cell(ws, row, ci, LTTURQ)
        ws.row_dimensions[row].height = 20

        # Bar row with inline labels
        bar_row = row + 1
        pcts = [it[1] for it in items]
        widths = allocate_cells(pcts, n_cols)
        col = start_col
        narrow_items = []
        for i, (label, pct, vtext) in enumerate(items):
            w = widths[i]
            if w == 0:
                continue
            seg_start = col
            seg_end = col + w - 1
            bg_color, txt_color = palette[i % len(palette)]
            for c in range(seg_start, seg_end + 1):
                _fill_cell(ws, bar_row, c, bg_color)
            a = get_column_letter(seg_start)
            bb = get_column_letter(seg_end)
            if w > 1:
                ws.merge_cells(f"{a}{bar_row}:{bb}{bar_row}")
            lc = ws[f"{a}{bar_row}"]
            pct_txt = f"{pct*100:.1f}%".replace(".", ",")
            if w >= 5:
                lc.value = f"{label}\n{pct_txt}  •  {vtext}"
                lc.font = _font(size=9, bold=True, color=txt_color)
                lc.alignment = _align("center", "center", wrap=True)
            elif w >= 3:
                lc.value = f"{label}\n{pct_txt}"
                lc.font = _font(size=8, bold=True, color=txt_color)
                lc.alignment = _align("center", "center", wrap=True)
            else:
                narrow_items.append((label, pct, bg_color))
            col += w
        ws.row_dimensions[bar_row].height = 46

        # Legend row for narrow items
        legend_row = row + 2
        if narrow_items:
            parts = []
            for label, pct, _color in narrow_items:
                pct_txt = f"{pct*100:.1f}%".replace(".", ",")
                parts.append(f"▪ {label} {pct_txt}")
            ws.merge_cells(f"{first}{legend_row}:{last}{legend_row}")
            leg = ws[f"{first}{legend_row}"]
            leg.value = "  kleine posten:  " + "   ".join(parts)
            leg.font = _font(size=8, italic=True, color=BODY)
            leg.alignment = _align("left", "center")
            ws.row_dimensions[legend_row].height = 16
            return row + 3
        else:
            ws.row_dimensions[legend_row].height = 4
            return row + 3

    def add_treemap(
        self, ws, start_row, title, total_text, blocks,
        n_cols=24, n_body_rows=6, palette=None, start_col=1,
    ):
        """Treemap with proportional rectangles.

        Best visualization for highly-skewed composition data (one or two
        items dominate the total). Each item gets its own labeled block
        whose area is proportional to its percentage.

        Parameters
        ----------
        blocks : list of ``(label, pct, value, r, c, nr, nc)`` tuples,
            where ``r, c`` are 1-indexed WITHIN the body and ``nr, nc`` are
            row/column spans of the rectangle. You must pre-compute the
            layout: the blocks should tile the ``n_body_rows × n_cols``
            grid without overlapping.
        palette : optional list of ``(bg, text)`` tuples; defaults to the
            sequential teal palette from darkest (biggest) to lightest.
        n_body_rows : height of the treemap body in rows (default 6)

        Tip: sort ``blocks`` from biggest to smallest before calling so
        that the first (darkest) palette entries go to the biggest blocks.

        Example — passief with Sociaal fonds dominant::

            blocks = [
                ("Sociaal fonds",  0.825, "3.678.781 €", 1, 1, 5, 24),
                ("Voorzieningen",  0.112, "500.000 €",   6, 1, 1, 15),
                ("Handelsschulden", 0.030, "132.552 €",  6, 16, 1, 4),
                ("Fisc. & soc. sch.", 0.025, "111.058 €", 6, 20, 1, 3),
                ("Ovl. rekeningen", 0.008, "36.209 €",   6, 23, 1, 2),
            ]
            builder.add_treemap(ws, row, "PASSIEF", "Totaal 4.46 M€", blocks)
        """
        if palette is None:
            palette = SEQUENTIAL_TEAL_PALETTE
        first = get_column_letter(start_col)
        last = get_column_letter(start_col + n_cols - 1)
        # Subheader strip
        mid_col = start_col + (n_cols // 2) - 1
        mid_a = get_column_letter(mid_col)
        mid_b = get_column_letter(mid_col + 1)
        ws.merge_cells(f"{first}{start_row}:{mid_a}{start_row}")
        tc = ws[f"{first}{start_row}"]
        tc.value = "  " + title
        tc.font = _font(size=10, bold=True, color=TURQ_DARK)
        tc.alignment = _align("left", "center")
        tc.fill = _fill(LTTURQ)
        for ci in range(start_col + 1, mid_col + 1):
            _fill_cell(ws, start_row, ci, LTTURQ)
        ws.merge_cells(f"{mid_b}{start_row}:{last}{start_row}")
        rc = ws[f"{mid_b}{start_row}"]
        rc.value = total_text + "  "
        rc.font = _font(size=10, italic=True, color=BODY)
        rc.alignment = _align("right", "center")
        rc.fill = _fill(LTTURQ)
        for ci in range(mid_col + 2, start_col + n_cols + 1):
            _fill_cell(ws, start_row, ci, LTTURQ)
        ws.row_dimensions[start_row].height = 20

        body_start = start_row + 1
        max_row = body_start + n_body_rows - 1
        for rr in range(body_start, max_row + 1):
            ws.row_dimensions[rr].height = 22

        for i, block in enumerate(blocks):
            label, pct, value, r, c, nr, nc = block
            abs_r = body_start + r - 1
            abs_r_end = abs_r + nr - 1
            abs_c = start_col + c - 1
            abs_c_end = abs_c + nc - 1
            bg_color, txt_color = palette[i % len(palette)]
            for rr in range(abs_r, abs_r_end + 1):
                for cc in range(abs_c, abs_c_end + 1):
                    _fill_cell(ws, rr, cc, bg_color)
            a = get_column_letter(abs_c)
            bb = get_column_letter(abs_c_end)
            if nr > 1 or nc > 1:
                ws.merge_cells(f"{a}{abs_r}:{bb}{abs_r_end}")
            lc = ws[f"{a}{abs_r}"]
            area = nr * nc
            pct_txt = f"{pct*100:.1f}%".replace(".", ",")
            if area >= 40:
                lc.value = f"{label}\n{pct_txt}\n{value}"
                font_size = 14
            elif area >= 20:
                lc.value = f"{label}\n{pct_txt}\n{value}"
                font_size = 11
            elif area >= 10:
                lc.value = f"{label}\n{pct_txt}"
                font_size = 9
            elif area >= 4:
                lc.value = f"{label}\n{pct_txt}"
                font_size = 8
            elif area >= 2:
                lc.value = pct_txt
                font_size = 7
            else:
                lc.value = ""
                font_size = 6
            lc.font = _font(size=font_size, bold=True, color=txt_color)
            lc.alignment = _align("center", "center", wrap=True)

        return max_row + 1

    def add_waterfall_row(
        self, ws, row, label, value, max_abs, *,
        is_subtotal=False, stripe=False, n_cols=24,
        label_span=7, bar_half=7,
        pos_color=TURQ_DARK, neg_color=TEAL_XDARK,
    ):
        """One row of a horizontal waterfall chart.

        Layout: ``[ label ][ neg bar area ][ ·center· ][ pos bar area ][ value ]``

        Positive values extend right from the centerline in ``pos_color``.
        Negative values extend left from the centerline in ``neg_color``.
        Subtotals get an LTTURQ background and bold text for emphasis.

        For P&L visualizations where some items (bruto marge, bezoldigingen)
        are much larger than others (subtotals, small items), consider
        splitting into TWO waterfalls with different ``max_abs`` values to
        keep both the big picture and the detail readable. See the example
        ``build_financial_report_example.py`` for the split-waterfall pattern.

        Parameters
        ----------
        max_abs : float used to scale all bars. The largest absolute value
            across the waterfall should map to a full ``bar_half`` fill.
        is_subtotal : bool; adds LTTURQ background and bold text
        label_span : grid columns reserved for the label (left-aligned)
        bar_half : grid columns reserved on each side of the centerline
        """
        bg = LTTURQ if is_subtotal else (LTGRAY if stripe else W)
        font_bold = is_subtotal
        # Label
        la = get_column_letter(1)
        lb = get_column_letter(label_span)
        ws.merge_cells(f"{la}{row}:{lb}{row}")
        lc = ws[f"{la}{row}"]
        lc.value = "  " + label
        lc.font = _font(size=10, bold=font_bold, color=DKTEXT)
        lc.alignment = _align("left", "center")
        lc.fill = _fill(bg)
        for ci in range(2, label_span + 1):
            _fill_cell(ws, row, ci, bg)
        # Bar track
        neg_start = label_span + 1
        neg_end = label_span + bar_half
        center_col = neg_end + 1
        pos_start = center_col + 1
        pos_end = center_col + bar_half
        for ci in range(neg_start, pos_end + 1):
            _fill_cell(ws, row, ci, LTGRAY if bg == W else bg)
        # Centerline
        _fill_cell(ws, row, center_col, DKTEXT)
        # Bar fill
        pct = min(1.0, abs(value) / max_abs) if max_abs > 0 else 0
        filled = round(bar_half * pct) if pct > 0 else 0
        if value >= 0:
            for i in range(filled):
                _fill_cell(ws, row, pos_start + i, pos_color)
        else:
            for i in range(filled):
                _fill_cell(ws, row, neg_end - i, neg_color)
        # Value
        va = get_column_letter(pos_end + 1)
        vb = get_column_letter(n_cols)
        ws.merge_cells(f"{va}{row}:{vb}{row}")
        vc = ws[f"{va}{row}"]
        sign = "+" if value >= 0 else "−"
        vc.value = f"{sign}{abs(value):,.0f} €".replace(",", ".")
        vc.font = _font(size=10, bold=font_bold,
                        color=(pos_color if value >= 0 else neg_color))
        vc.alignment = _align("right", "center")
        vc.fill = _fill(bg)
        for ci in range(pos_end + 2, n_cols + 1):
            _fill_cell(ws, row, ci, bg)
        ws.row_dimensions[row].height = 22
        return row + 1

    def add_gauge_tile(self, ws, top_row, col_start, col_span,
                        pct, label, is_positive=True):
        """KPI-gauge tile: big percentage + mini bar + label.

        Layout (3 rows):
            row 0: big percentage value on LTTURQ background
            row 1: mini sparkbar (1 cell tall)
            row 2: caption label

        Use :meth:`add_gauge_row` to lay out multiple gauges side by side.
        """
        a = get_column_letter(col_start)
        bb = get_column_letter(col_start + col_span - 1)
        # Big percent
        ws.merge_cells(f"{a}{top_row}:{bb}{top_row}")
        vc = ws[f"{a}{top_row}"]
        vc.value = f"{pct*100:.1f} %".replace(".", ",")
        vc.font = _font(size=22, bold=True,
                        color=(TURQ_DARK if is_positive else TEAL_XDARK))
        vc.alignment = _align("center", "center")
        vc.fill = _fill(LTTURQ)
        for ci in range(col_start + 1, col_start + col_span):
            _fill_cell(ws, top_row, ci, LTTURQ)
        ws.row_dimensions[top_row].height = 34
        # Mini bar
        fill_n = max(1, round(col_span * pct))
        for i in range(col_span):
            c = ws.cell(row=top_row + 1, column=col_start + i)
            c.fill = _fill(
                (TURQ_DARK if is_positive else TEAL_XDARK) if i < fill_n else LTGRAY
            )
        ws.row_dimensions[top_row + 1].height = 8
        # Label
        ws.merge_cells(f"{a}{top_row+2}:{bb}{top_row+2}")
        lc = ws[f"{a}{top_row+2}"]
        lc.value = label
        lc.font = _font(size=8, bold=True, color=DKTEXT)
        lc.alignment = _align("center", "center", wrap=True)
        lc.fill = _fill(W)
        for ci in range(col_start + 1, col_start + col_span):
            _fill_cell(ws, top_row + 2, ci, W)
        ws.row_dimensions[top_row + 2].height = 26
        return top_row + 3

    def add_gauge_row(self, ws, row, tiles, start_col=1, tile_span=4, gap=1):
        """Row of gauge tiles laid out side by side.

        tiles : list of ``(pct, label, is_positive)`` tuples OR list of dicts
                with keys ``pct``, ``label``, ``is_positive``.
        tile_span : width of each tile in grid columns
        gap : grid columns between tiles

        v0.2.12: accepts both tuples and dicts for API consistency with
        add_kpi_row / add_kpi_delta_row.
        """
        col = start_col
        for tile in tiles:
            if isinstance(tile, dict):
                pct = tile["pct"]
                label = tile["label"]
                is_positive = tile.get("is_positive", True)
            else:
                pct, label, is_positive = tile
            self.add_gauge_tile(ws, row, col, tile_span, pct, label, is_positive)
            col += tile_span + gap
        return row + 3

    def add_metric_card(self, ws, row, label, subtitle, metric, n_cols=20,
                         accent_color=TURQ_DARK, bg_color=LTTURQ):
        """Analysis-tab metric card with left accent bar.

        Best layout for a text-first analytical report where each section
        leads with a key metric and is followed by a prose paragraph. Use
        this instead of a plain bold header to give each metric visual
        weight.

        Layout (2 rows)::

            ┌──┬──────────────────────────────────────┬─────────────┐
            │██│   LABEL                              │    METRIC   │
            │██├──────────────────────────────────────┴─────────────┤
            │██│   subtitle in italic                               │
            └──┴────────────────────────────────────────────────────┘

        Call :meth:`add_metric_card` then render a prose paragraph on the
        next row for the commentary below the card.
        """
        last = get_column_letter(n_cols)
        metric_start_col = n_cols - 6
        # Accent bar (col A, 2 rows tall)
        ws.merge_cells(f"A{row}:A{row+1}")
        ac = ws[f"A{row}"]
        ac.fill = _fill(accent_color)
        # Row 1: label
        label_end = get_column_letter(metric_start_col - 1)
        ws.merge_cells(f"B{row}:{label_end}{row}")
        lc = ws[f"B{row}"]
        lc.value = "  " + label
        lc.font = _font(size=12, bold=True, color=DKTEXT)
        lc.alignment = _align("left", "center")
        lc.fill = _fill(bg_color)
        for ci in range(3, metric_start_col):
            _fill_cell(ws, row, ci, bg_color)
        # Row 1: metric (right-aligned, larger, accent color)
        metric_a = get_column_letter(metric_start_col)
        ws.merge_cells(f"{metric_a}{row}:{last}{row}")
        mc = ws[f"{metric_a}{row}"]
        mc.value = metric + "  "
        mc.font = _font(size=14, bold=True, color=accent_color)
        mc.alignment = _align("right", "center")
        mc.fill = _fill(bg_color)
        for ci in range(metric_start_col + 1, n_cols + 1):
            _fill_cell(ws, row, ci, bg_color)
        # Row 2: subtitle
        ws.merge_cells(f"B{row+1}:{last}{row+1}")
        sc = ws[f"B{row+1}"]
        sc.value = "  " + subtitle
        sc.font = _font(size=9, italic=True, color=BODY)
        sc.alignment = _align("left", "center")
        sc.fill = _fill(bg_color)
        for ci in range(3, n_cols + 1):
            _fill_cell(ws, row+1, ci, bg_color)
        ws.row_dimensions[row].height = 24
        ws.row_dimensions[row+1].height = 18
        return row + 2

    def add_prose(self, ws, row, text, n_cols=20,
                   chars_per_line=105, font_size=10, color=BODY,
                   italic=False):
        """Render a wrapped prose paragraph across ``n_cols`` columns.

        Row height is estimated from text length (``chars_per_line``).
        For an analysis tab, combine with :meth:`add_metric_card`::

            row = builder.add_metric_card(ws, row, "SOLVABILITEIT",
                    "eigen vermogen / balanstotaal", "82,5 %")
            row = builder.add_prose(ws, row,
                    "Uitstekend. De federatie financiert haar werking ...")
        """
        first = get_column_letter(1)
        last = get_column_letter(n_cols)
        ws.merge_cells(f"{first}{row}:{last}{row}")
        c = ws[f"{first}{row}"]
        c.value = "  " + text
        c.font = _font(size=font_size, color=color, italic=italic)
        c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        lines = max(1, (len(text) + chars_per_line - 1) // chars_per_line)
        lines += text.count("\n")
        ws.row_dimensions[row].height = lines * 14 + 10
        return row + 1

    def add_mini_table(
        self, ws, start_row, start_col, label_span, headers, rows,
        numeric_cols=None, data_span=1,
    ):
        """Embedded mini-table with merged label column.

        Compact mini-table for dashboard embedding, with a ``data_span`` parameter
        that lets each data column span multiple grid cells. This is
        essential for dashboards where single-cell-wide numeric columns
        would truncate values like ``639.843`` or ``+99.154``.

        Parameters
        ----------
        label_span : grid columns for the first (label) column
        data_span : grid columns per data column (merged per cell)
        numeric_cols : 1-indexed data-column positions to right-align
        """
        numeric_cols = set(numeric_cols or [])
        la = get_column_letter(start_col)
        lb = get_column_letter(start_col + label_span - 1)
        ws.merge_cells(f"{la}{start_row}:{lb}{start_row}")
        hc = ws[f"{la}{start_row}"]
        hc.value = "  " + headers[0]
        hc.style = "embuild_header"
        hc.alignment = _align("left", "center")
        for ci in range(start_col + 1, start_col + label_span):
            ws.cell(row=start_row, column=ci).fill = _fill(TURQ)
        for i, h in enumerate(headers[1:], start=1):
            dc_start = start_col + label_span + (i - 1) * data_span
            dc_end = dc_start + data_span - 1
            if data_span > 1:
                ws.merge_cells(
                    f"{get_column_letter(dc_start)}{start_row}:"
                    f"{get_column_letter(dc_end)}{start_row}"
                )
            c = ws.cell(row=start_row, column=dc_start, value=h)
            c.style = "embuild_header"
            c.alignment = _align("center", "center")
            for ci in range(dc_start + 1, dc_end + 1):
                ws.cell(row=start_row, column=ci).fill = _fill(TURQ)
        ws.row_dimensions[start_row].height = 22
        for r_idx, rdata in enumerate(rows):
            er = start_row + 1 + r_idx
            is_total = str(rdata[0]).upper().startswith("TOTAAL")
            style = "embuild_total" if is_total else (
                "embuild_body_stripe" if r_idx % 2 == 1 else "embuild_body"
            )
            ws.merge_cells(f"{la}{er}:{lb}{er}")
            lc = ws[f"{la}{er}"]
            lc.value = "  " + str(rdata[0])
            lc.style = style
            lc.alignment = _align("left", "center")
            lc.font = _font(size=10, bold=is_total, color=DKTEXT)
            for ci in range(start_col + 1, start_col + label_span):
                ws.cell(row=er, column=ci).style = style
            for i, val in enumerate(rdata[1:], start=1):
                dc_start = start_col + label_span + (i - 1) * data_span
                dc_end = dc_start + data_span - 1
                if data_span > 1:
                    ws.merge_cells(
                        f"{get_column_letter(dc_start)}{er}:"
                        f"{get_column_letter(dc_end)}{er}"
                    )
                c = ws.cell(row=er, column=dc_start, value=val)
                c.style = style
                c.alignment = _align(
                    "right" if i in numeric_cols else "center", "center"
                )
                c.font = _font(size=10, bold=is_total, color=DKTEXT)
                for ci in range(dc_start + 1, dc_end + 1):
                    ws.cell(row=er, column=ci).style = style
            ws.row_dimensions[er].height = 20
        return start_row + 1 + len(rows)

    def add_wide_nav_button(self, ws, row, col_start, col_span,
                              label, target_sheet, target_cell="A1"):
        """Wider nav button (3+ cols) for labels longer than ``add_nav_bar``
        can fit. The default :meth:`add_nav_bar` uses 2-col buttons which
        are too narrow for labels like "Bestuurders" or "Resultatenrekening".

        Build your own wider nav bar by calling this in a loop::

            for label, target in [
                ("Analyse",     "Analyse van de Jaarrekening"),
                ("Balans",      "Balans"),
                ("Resultaat",   "Resultatenrekening"),
                ("Personeel",   "Personeel"),
                ("Bestuurders", "Bestuurders"),
            ]:
                builder.add_wide_nav_button(ws, row, col, 4, label, target)
                col += 5  # 4 wide + 1 gap
        """
        a = get_column_letter(col_start)
        b = get_column_letter(col_start + col_span - 1)
        ws.merge_cells(f"{a}{row}:{b}{row}")
        self.add_nav_button(ws, f"{a}{row}", f"  ▶  {label}", target_sheet, target_cell)
        ws.row_dimensions[row].height = 24

    # ─── High-level convenience: build full workbook in one call ─────

    def build_workbook(
        self,
        filename,
        data_sheets=None,
        dashboard_sheets=None,
    ):
        """One-shot workbook builder.

        data_sheets : list[dict]  — each passed to build_data_sheet
        dashboard_sheets : list[dict] — each passed to build_dashboard_sheet

        Returns the saved workbook path.
        """
        wb = self.new_workbook()
        if data_sheets:
            for cfg in data_sheets:
                self.build_data_sheet(wb, **cfg)
        if dashboard_sheets:
            for cfg in dashboard_sheets:
                self.build_dashboard_sheet(wb, **cfg)
        wb.save(filename)
        return filename
