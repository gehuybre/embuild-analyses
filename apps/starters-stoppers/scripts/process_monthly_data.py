from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "public" / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DATALAB_URL = "https://statbel.fgov.be/sites/default/files/files/documents/DataLab/TF_STARTERS_30.xlsx"
NACE_2008_URL = "https://statbel.fgov.be/sites/default/files/files/documents/Ondernemingen/7.4%20BTW-plichtige%20ondernemers/7.4.2%20Maandevolutie/Ent_nace_2008_45_nl.xls"
NACE_2025_URL = "https://statbel.fgov.be/sites/default/files/files/documents/Ondernemingen/7.4%20BTW-plichtige%20ondernemers/7.4.2%20Maandevolutie/Ent_nace_2025_45_nl.xlsx"
PUBLICATION_PAGE_URL = "https://statbel.fgov.be/nl/themas/ondernemingen/btw-plichtige-ondernemingen/maandevolutie-van-de-btw-plichtige-ondernemingen"
ANNUAL_TOTALS_PAGE_URL = "https://statbel.fgov.be/nl/cijfers/evolutie-van-het-aantal-oprichtingen-en-stopzettingen-van-btw-plichtige-ondernemingen-0"
INFOGRAM_EMBED_BASE_URL = "https://e.infogram.com"
BESTAT_BASE_URL = "https://bestat.statbel.fgov.be/bestat/crosstable.xhtml"
BESTAT_NACE_2025_DATASOURCE = "c7bf7778-1239-47f8-bd33-1630f7021f99"
BESTAT_NACE_2008_DATASOURCE = "9465cc86-06bd-48ec-a8f5-4907385a5d0b"
BESTAT_ANNUAL_STARTERS_VIEW = "800863d8-d5ec-40ff-9add-c42fb4cca782"
BESTAT_ANNUAL_STOPPERS_VIEW = "85c773d0-06ed-4e02-9e91-87124e2684d6"
BESTAT_PERIOD_FILTER_BUTTON = "sidemenu-form:sidemenu-form-tab:filters:0:j_id_7x"
BESTAT_GEO_FILTER_BUTTON = "sidemenu-form:sidemenu-form-tab:filters:1:j_id_7x"
BESTAT_LAYOUT_SOURCE = "layout-form:j_id_an"
BESTAT_MONTH_LOOKBACK = 60
BESTAT_ANNUAL_LEVEL = "[HIE1].[TX_DATE_NL_LVL1]"
DUTCH_MONTHS = {
    "januari": 1,
    "februari": 2,
    "maart": 3,
    "april": 4,
    "mei": 5,
    "juni": 6,
    "juli": 7,
    "augustus": 8,
    "september": 9,
    "oktober": 10,
    "november": 11,
    "december": 12,
}
REGION_FILTER_LABELS = {
    "2000": "Vlaams Gewest",
    "3000": "Waals Gewest",
    "4000": "Brussels Hoofdstedelijk Gewest",
}
REGION_CODES_BY_DATALAB = {
    "02000": "2000",
    "03000": "3000",
    "04000": "4000",
}
ANNUAL_REGION_CODES = ["2000", "4000", "3000", None, None, "1000"]


@dataclass(frozen=True)
class SourceConfig:
    key: str
    url: str
    filename: str
    env_var: str
    kind: str


SOURCES = [
    SourceConfig(
        key="datalab_2019_2020",
        url=DATALAB_URL,
        filename="TF_STARTERS_30.xlsx",
        env_var="DATALAB_INPUT_PATH",
        kind="datalab",
    ),
    SourceConfig(
        key="nace_2008_2021_2025",
        url=NACE_2008_URL,
        filename="Ent_nace_2008_45_nl.xls",
        env_var="NACE2008_INPUT_PATH",
        kind="official_workbook",
    ),
    SourceConfig(
        key="nace_2025_2025_2026",
        url=NACE_2025_URL,
        filename="Ent_nace_2025_45_nl.xlsx",
        env_var="NACE2025_INPUT_PATH",
        kind="official_workbook",
    ),
]

BELGIAN_REGION_CODES = {"02000", "03000", "04000"}


def download_file(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    handle.write(chunk)
    return destination


def download_text(url: str) -> str:
    response = requests.get(url, timeout=180)
    response.raise_for_status()
    return response.text


def resolve_source_file(source: SourceConfig) -> Path:
    override = os.environ.get(source.env_var)
    if override:
        path = Path(override)
        if not path.exists():
            raise FileNotFoundError(f"{source.env_var} points to missing file: {path}")
        return path

    destination = DATA_DIR / source.filename
    return download_file(source.url, destination)


def parse_month_sheet_name(sheet_name: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d{4})-(\d{2})", sheet_name.strip())
    if not match:
        raise ValueError(f"Unexpected sheet name: {sheet_name}")
    return int(match.group(1)), int(match.group(2))


def clean_sector_label(label: str) -> str:
    text = re.sub(r"\s+", " ", label.replace(" /", "/").replace("/ ", "/")).strip(" -")
    return text[:1].upper() + text[1:].lower() if text.isupper() else text


def parse_activity_cell(value: object) -> tuple[str | None, str | None]:
    if value is None or pd.isna(value):
        return None, None

    text = str(value).strip()
    if not text or text.lower().startswith("bron:"):
        return None, None

    if text.lower() == "alle activiteiten":
        return "ALL", "Alle activiteiten"

    match = re.match(r"^([A-Z])\s+(.+)$", text)
    if not match:
        return None, None

    return match.group(1), clean_sector_label(match.group(2))


def parse_annual_activity_headers(headers: list[str]) -> tuple[str | None, str | None]:
    if not headers:
        return None, None

    text = headers[-1].strip()
    if not text:
        return None, None
    if text == "Alle economische activiteiten":
        return "ALL", "Alle activiteiten"
    if text == "Onbekende economische activiteit":
        return "X", "Onbekende economische activiteit"

    return parse_activity_cell(text)


def to_int(value: object) -> int:
    if value is None or pd.isna(value):
        return 0
    return int(round(float(value)))


def build_period_record(year: int, month: int, sector_code: str, starters: int, stoppers: int) -> dict[str, int | str]:
    quarter = ((month - 1) // 3) + 1
    return {
        "y": year,
        "q": quarter,
        "mo": month,
        "period": f"{year:04d}-{month:02d}",
        "n1": sector_code,
        "fr": starters,
        "st": stoppers,
    }


def build_year_record(year: int, starters: int, stoppers: int) -> dict[str, int]:
    return {
        "y": year,
        "fr": starters,
        "st": stoppers,
    }


def build_geo_period_record(
    year: int,
    month: int,
    region_code: str,
    sector_code: str,
    starters: int,
    stoppers: int,
) -> dict[str, int | str]:
    record = build_period_record(year, month, sector_code, starters, stoppers)
    record["g"] = region_code
    return record


def build_geo_year_record(
    year: int,
    region_code: str,
    sector_code: str,
    starters: int,
    stoppers: int,
) -> dict[str, int | str]:
    return {
        "y": year,
        "g": region_code,
        "n1": sector_code,
        "fr": starters,
        "st": stoppers,
    }


def load_official_workbook(path: Path) -> tuple[list[dict[str, int | str]], dict[str, str]]:
    engine = "xlrd" if path.suffix.lower() == ".xls" else None
    workbook = pd.ExcelFile(path, engine=engine)
    records: list[dict[str, int | str]] = []
    labels: dict[str, str] = {"ALL": "Alle activiteiten"}

    for sheet_name in workbook.sheet_names:
        year, month = parse_month_sheet_name(sheet_name)
        frame = pd.read_excel(path, sheet_name=sheet_name, engine=engine, header=3)

        for _, row in frame.iterrows():
            sector_code, sector_label = parse_activity_cell(row.get("Activiteit"))
            if not sector_code:
                continue

            if sector_label:
                labels[sector_code] = sector_label

            records.append(
                build_period_record(
                    year=year,
                    month=month,
                    sector_code=sector_code,
                    starters=to_int(row.get("Primo registraties")),
                    stoppers=abs(to_int(row.get("Stopzettingen"))),
                )
            )

            # The official workbook repeats the table by enterprise type below the
            # first "all enterprise types" block. Stop after the aggregate row so
            # we do not overwrite the total series with sub-populations.
            if sector_code == "ALL":
                break

    return records, labels


def normalize_datalab_sector_label(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    if "-" in text:
        _, label = text.split("-", 1)
        return label.strip()
    return text


def load_datalab_workbook(path: Path) -> tuple[list[dict[str, int | str]], dict[str, str]]:
    frame = pd.read_excel(path, sheet_name="ALL", dtype={"annee": str, "mois": str, "CD_REGION": str})
    frame = frame[frame["CD_REGION"].isin(BELGIAN_REGION_CODES)].copy()

    numeric_columns = ["FIRST_REGISTRATIONS", "DEREGISTRATIONS"]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)

    grouped = (
        frame.groupby(["annee", "mois", "NACE1", "DESCR_NACE1_NL"], dropna=False)[numeric_columns]
        .sum()
        .reset_index()
    )

    labels: dict[str, str] = {"ALL": "Alle activiteiten"}
    records: list[dict[str, int | str]] = []

    for _, row in grouped.iterrows():
        sector_code = str(row["NACE1"]).strip()
        if not sector_code:
            continue

        label = normalize_datalab_sector_label(row.get("DESCR_NACE1_NL"))
        if label:
            labels[sector_code] = label

        records.append(
            build_period_record(
                year=int(row["annee"]),
                month=int(row["mois"]),
                sector_code=sector_code,
                starters=to_int(row["FIRST_REGISTRATIONS"]),
                stoppers=abs(to_int(row["DEREGISTRATIONS"])),
            )
        )

    monthly_totals = (
        grouped.groupby(["annee", "mois"])[numeric_columns]
        .sum()
        .reset_index()
    )
    for _, row in monthly_totals.iterrows():
        records.append(
            build_period_record(
                year=int(row["annee"]),
                month=int(row["mois"]),
                sector_code="ALL",
                starters=to_int(row["FIRST_REGISTRATIONS"]),
                stoppers=abs(to_int(row["DEREGISTRATIONS"])),
            )
        )

    return records, labels


def load_datalab_regional_workbook(path: Path) -> tuple[list[dict[str, int | str]], dict[str, str]]:
    frame = pd.read_excel(path, sheet_name="ALL", dtype={"annee": str, "mois": str, "CD_REGION": str})
    frame = frame[frame["CD_REGION"].isin(BELGIAN_REGION_CODES)].copy()

    numeric_columns = ["FIRST_REGISTRATIONS", "DEREGISTRATIONS"]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)

    grouped = (
        frame.groupby(["annee", "mois", "CD_REGION", "NACE1", "DESCR_NACE1_NL"], dropna=False)[numeric_columns]
        .sum()
        .reset_index()
    )

    labels: dict[str, str] = {"ALL": "Alle activiteiten"}
    records: list[dict[str, int | str]] = []

    for _, row in grouped.iterrows():
        sector_code = str(row["NACE1"]).strip()
        region_code = REGION_CODES_BY_DATALAB.get(str(row["CD_REGION"]))
        if not sector_code or not region_code:
            continue

        label = normalize_datalab_sector_label(row.get("DESCR_NACE1_NL"))
        if label:
            labels[sector_code] = label

        records.append(
            build_geo_period_record(
                year=int(row["annee"]),
                month=int(row["mois"]),
                region_code=region_code,
                sector_code=sector_code,
                starters=to_int(row["FIRST_REGISTRATIONS"]),
                stoppers=abs(to_int(row["DEREGISTRATIONS"])),
            )
        )

    region_totals = (
        grouped.groupby(["annee", "mois", "CD_REGION"])[numeric_columns]
        .sum()
        .reset_index()
    )
    for _, row in region_totals.iterrows():
        region_code = REGION_CODES_BY_DATALAB.get(str(row["CD_REGION"]))
        if not region_code:
            continue

        records.append(
            build_geo_period_record(
                year=int(row["annee"]),
                month=int(row["mois"]),
                region_code=region_code,
                sector_code="ALL",
                starters=to_int(row["FIRST_REGISTRATIONS"]),
                stoppers=abs(to_int(row["DEREGISTRATIONS"])),
            )
        )

    return records, labels


def combine_records(records_by_source: list[list[dict[str, int | str]]]) -> list[dict[str, int | str]]:
    combined: dict[tuple[int, int, str], dict[str, int | str]] = {}
    for source_records in records_by_source:
        for record in source_records:
            key = (int(record["y"]), int(record["mo"]), str(record["n1"]))
            combined[key] = record

    def sort_key(record: dict[str, int | str]) -> tuple[int, int, int, str]:
        sector = str(record["n1"])
        sector_rank = 0 if sector == "ALL" else 1
        return int(record["y"]), int(record["mo"]), sector_rank, sector

    return sorted(combined.values(), key=sort_key)


def combine_geo_records(records_by_source: list[list[dict[str, int | str]]]) -> list[dict[str, int | str]]:
    combined: dict[tuple[int, int, str, str], dict[str, int | str]] = {}
    for source_records in records_by_source:
        for record in source_records:
            key = (int(record["y"]), int(record["mo"]), str(record["g"]), str(record["n1"]))
            combined[key] = record

    def sort_key(record: dict[str, int | str]) -> tuple[int, int, str, int, str]:
        sector = str(record["n1"])
        sector_rank = 0 if sector == "ALL" else 1
        return int(record["y"]), int(record["mo"]), str(record["g"]), sector_rank, sector

    return sorted(combined.values(), key=sort_key)


def extract_updated_viewstate(response_text: str, fallback: str) -> str:
    xml_match = re.search(r'<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[(.*?)\]\]></update>', response_text)
    if xml_match:
        return xml_match.group(1)

    html_match = re.search(r'name="javax\.faces\.ViewState"[^>]*value="([^"]+)"', response_text)
    if html_match:
        return html_match.group(1)

    return fallback


def trigger_bestat_layout_submit(session: requests.Session, page_url: str, viewstate: str) -> str:
    payload = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": BESTAT_LAYOUT_SOURCE,
        "javax.faces.partial.execute": "layout-form:j_id_an layout-form:dropRows layout-form:dropColumns sidemenu-form",
        "javax.faces.partial.render": "main-content sidemenu-form dialog-form navigation-form",
        BESTAT_LAYOUT_SOURCE: BESTAT_LAYOUT_SOURCE,
        "javax.faces.ViewState": viewstate,
    }
    response = session.post(
        BESTAT_BASE_URL,
        data=payload,
        headers={"Faces-Request": "partial/ajax"},
        timeout=180,
    )
    response.raise_for_status()
    return extract_updated_viewstate(response.text, viewstate)


def open_bestat_filter(session: requests.Session, page_url: str, viewstate: str, button_id: str, hierarchy_id: str) -> tuple[str, str]:
    payload = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": button_id,
        "javax.faces.partial.execute": button_id,
        "javax.faces.partial.render": "filter-dialog-component",
        button_id: button_id,
        "currentFilterHierarchyId": hierarchy_id,
        "javax.faces.ViewState": viewstate,
    }
    response = session.post(
        BESTAT_BASE_URL,
        data=payload,
        headers={"Faces-Request": "partial/ajax"},
        timeout=180,
    )
    response.raise_for_status()
    return response.text, extract_updated_viewstate(response.text, viewstate)


def submit_bestat_period_filter(session: requests.Session, viewstate: str, months: int) -> str:
    button_id = "filter-dialog-form:j_id_4t"
    payload = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": button_id,
        "javax.faces.partial.execute": "filter-dialog-form",
        "javax.faces.partial.render": "filter-dialog-form",
        button_id: button_id,
        "filter-dialog-form": "filter-dialog-form",
        "filter-dialog-form_SUBMIT": "1",
        "filter-dialog-form:dynamic-time-filter-button_input": "on",
        "filter-dialog-form:spinner_input": str(months),
        "filter-dialog-form:level-dropdown": "[HIE1].[TX_DATE_NL_LVL4]",
        "javax.faces.ViewState": viewstate,
    }
    response = session.post(
        BESTAT_BASE_URL,
        data=payload,
        headers={"Faces-Request": "partial/ajax"},
        timeout=180,
    )
    response.raise_for_status()
    return extract_updated_viewstate(response.text, viewstate)


def extract_bestat_spinner_max(response_text: str) -> int | None:
    match = re.search(r'max:(\d+(?:\.\d+)?)', response_text)
    if not match:
        return None
    return int(float(match.group(1)))


def submit_bestat_year_filter(session: requests.Session, viewstate: str, years: int) -> str:
    button_id = "filter-dialog-form:j_id_4t"
    payload = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": button_id,
        "javax.faces.partial.execute": "filter-dialog-form",
        "javax.faces.partial.render": "filter-dialog-form",
        button_id: button_id,
        "filter-dialog-form": "filter-dialog-form",
        "filter-dialog-form_SUBMIT": "1",
        "filter-dialog-form:dynamic-time-filter-button_input": "on",
        "filter-dialog-form:spinner_input": str(years),
        "filter-dialog-form:level-dropdown": BESTAT_ANNUAL_LEVEL,
        "javax.faces.ViewState": viewstate,
    }
    response = session.post(
        BESTAT_BASE_URL,
        data=payload,
        headers={"Faces-Request": "partial/ajax"},
        timeout=180,
    )
    response.raise_for_status()
    return extract_updated_viewstate(response.text, viewstate)


def extract_bestat_filter_rowkeys(response_text: str) -> dict[str, str]:
    match = re.search(r'<update id="filter-dialog-component"><!\[CDATA\[(.*)\]\]></update>', response_text, re.DOTALL)
    html = match.group(1) if match else response_text
    soup = BeautifulSoup(html, "html.parser")
    keys: dict[str, str] = {}
    for node in soup.select("[data-rowkey]"):
        label_node = node.select_one(".ui-treenode-label")
        if label_node is None:
            continue

        label = re.sub(r"\s+", " ", label_node.get_text(" ", strip=True)).strip()
        if label:
            keys[label] = str(node.get("data-rowkey"))
    return keys


def submit_bestat_tree_filter(session: requests.Session, viewstate: str, rowkey: str) -> str:
    button_id = "filter-dialog-form:j_id_4t"
    payload = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": button_id,
        "javax.faces.partial.execute": "filter-dialog-form",
        "javax.faces.partial.render": "filter-dialog-form",
        button_id: button_id,
        "filter-dialog-form": "filter-dialog-form",
        "filter-dialog-form_SUBMIT": "1",
        "filter-dialog-form:j_id_4r_2_1_selection": rowkey,
        "javax.faces.ViewState": viewstate,
    }
    response = session.post(
        BESTAT_BASE_URL,
        data=payload,
        headers={"Faces-Request": "partial/ajax"},
        timeout=180,
    )
    response.raise_for_status()
    return extract_updated_viewstate(response.text, viewstate)


def parse_bestat_month_label(label: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Za-zéëï]+)\s+(\d{4})", label.strip(), re.IGNORECASE)
    if not match:
        raise ValueError(f"Unexpected be.STAT month label: {label}")

    month_name = match.group(1).lower()
    month = DUTCH_MONTHS.get(month_name)
    if month is None:
        raise ValueError(f"Unsupported Dutch month label: {label}")
    return int(match.group(2)), month


def parse_bestat_monthly_table(html: str, region_code: str) -> list[dict[str, int | str]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#pricePanel table.pvtTable")
    if table is None:
        raise ValueError("Could not find be.STAT crosstable")

    header_rows = table.select("thead tr")
    if len(header_rows) < 2:
        raise ValueError("Unexpected be.STAT table header")

    months: list[str] = []
    for header in header_rows[0].find_all("th", class_="pvtColLabel"):
        text = " ".join(header.stripped_strings)
        colspan = int(header.get("colspan", "1"))
        months.extend([text] * colspan)

    measures = [" ".join(header.stripped_strings) for header in header_rows[1].find_all("th", class_="pvtColLabel")]
    if len(months) != len(measures):
        raise ValueError("be.STAT months and measures do not align")

    records: list[dict[str, int | str]] = []
    totals: dict[tuple[int, int], dict[str, int]] = {}

    for row in table.select("tbody tr"):
        header = row.find("th")
        if header is None:
            continue

        sector_text = " ".join(header.stripped_strings)
        sector_code, sector_label = parse_activity_cell(sector_text)
        if not sector_code:
            continue

        cells = row.find_all("td")
        if len(cells) != len(measures):
            continue

        values_by_period: dict[tuple[int, int], dict[str, int]] = {}
        for (month_label, measure_label), cell in zip(zip(months, measures), cells):
            year, month = parse_bestat_month_label(month_label)
            values = values_by_period.setdefault((year, month), {"fr": 0, "st": 0})
            cell_value = parse_compact_int(cell.get_text(" ", strip=True))

            if measure_label == "Primo-registraties":
                values["fr"] = cell_value
            elif measure_label == "Schrappingen":
                values["st"] = abs(cell_value)

        for (year, month), values in values_by_period.items():
            records.append(
                build_geo_period_record(
                    year=year,
                    month=month,
                    region_code=region_code,
                    sector_code=sector_code,
                    starters=values["fr"],
                    stoppers=values["st"],
                )
            )
            total_values = totals.setdefault((year, month), {"fr": 0, "st": 0})
            total_values["fr"] += values["fr"]
            total_values["st"] += values["st"]

    for (year, month), values in sorted(totals.items()):
        records.append(
            build_geo_period_record(
                year=year,
                month=month,
                region_code=region_code,
                sector_code="ALL",
                starters=values["fr"],
                stoppers=values["st"],
            )
        )

    return records


def fetch_bestat_regional_records(datasource_id: str, region_code: str) -> list[dict[str, int | str]]:
    page_url = f"{BESTAT_BASE_URL}?datasource={datasource_id}"
    session = requests.Session()

    html = session.get(page_url, timeout=180).text
    viewstate = extract_updated_viewstate(html, "")

    _, viewstate = open_bestat_filter(session, page_url, viewstate, BESTAT_PERIOD_FILTER_BUTTON, "root.Periode")
    viewstate = submit_bestat_period_filter(session, viewstate, BESTAT_MONTH_LOOKBACK)
    viewstate = trigger_bestat_layout_submit(session, page_url, viewstate)

    html = session.get(page_url, timeout=180).text
    viewstate = extract_updated_viewstate(html, viewstate)

    if region_code in REGION_FILTER_LABELS:
        dialog_html, viewstate = open_bestat_filter(
            session,
            page_url,
            viewstate,
            BESTAT_GEO_FILTER_BUTTON,
            "root.Plaats maatschappelijke zetel",
        )
        rowkeys = extract_bestat_filter_rowkeys(dialog_html)
        rowkey = rowkeys.get(REGION_FILTER_LABELS[region_code])
        if not rowkey:
            raise ValueError(f"Could not resolve be.STAT rowkey for region {region_code}")

        viewstate = submit_bestat_tree_filter(session, viewstate, rowkey)
        viewstate = trigger_bestat_layout_submit(session, page_url, viewstate)

    html = session.get(page_url, timeout=180).text
    return parse_bestat_monthly_table(html, region_code)


def load_bestat_regional_monthlies() -> list[dict[str, int | str]]:
    records_by_source: list[list[dict[str, int | str]]] = []
    for datasource_id in [BESTAT_NACE_2008_DATASOURCE, BESTAT_NACE_2025_DATASOURCE]:
        source_records: list[dict[str, int | str]] = []
        for region_code in REGION_FILTER_LABELS:
            source_records.extend(fetch_bestat_regional_records(datasource_id, region_code))
        records_by_source.append(source_records)

    return combine_geo_records(records_by_source)


def combine_geo_year_records(records_by_source: list[list[dict[str, int | str]]]) -> list[dict[str, int | str]]:
    combined: dict[tuple[int, str, str], dict[str, int | str]] = {}
    for source_records in records_by_source:
        for record in source_records:
            key = (int(record["y"]), str(record["g"]), str(record["n1"]))
            current = combined.setdefault(
                key,
                {
                    "y": int(record["y"]),
                    "g": str(record["g"]),
                    "n1": str(record["n1"]),
                    "fr": 0,
                    "st": 0,
                },
            )
            if "fr" in record:
                current["fr"] = int(record["fr"])
            if "st" in record:
                current["st"] = int(record["st"])

    def sort_key(record: dict[str, int | str]) -> tuple[int, str, int, str]:
        sector = str(record["n1"])
        sector_rank = 0 if sector == "ALL" else 1
        return int(record["y"]), str(record["g"]), sector_rank, sector

    return sorted(combined.values(), key=sort_key)


def parse_bestat_yearly_table(html: str, metric_key: str) -> tuple[list[dict[str, int | str]], dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#pricePanel table.pvtTable")
    if table is None:
        raise ValueError("Could not find annual be.STAT crosstable")

    header_rows = table.select("thead tr")
    if len(header_rows) < 4:
        raise ValueError("Unexpected annual be.STAT table header")

    years = [
        int(text)
        for text in (" ".join(cell.stripped_strings) for cell in header_rows[0].find_all(["th", "td"]))
        if re.fullmatch(r"\d{4}", text)
    ]
    if not years:
        raise ValueError("Could not resolve annual years from be.STAT table")

    labels: dict[str, str] = {"ALL": "Alle activiteiten"}
    records: list[dict[str, int | str]] = []

    for row in table.select("tbody tr"):
        headers = [" ".join(cell.stripped_strings) for cell in row.find_all("th")]
        sector_code, sector_label = parse_annual_activity_headers(headers)
        if not sector_code:
            continue

        if sector_label:
            labels[sector_code] = sector_label

        cells = row.find_all("td")
        if len(cells) != len(years) * len(ANNUAL_REGION_CODES):
            continue

        for year_index, year in enumerate(years):
            start = year_index * len(ANNUAL_REGION_CODES)
            group = cells[start : start + len(ANNUAL_REGION_CODES)]
            for region_code, cell in zip(ANNUAL_REGION_CODES, group):
                if not region_code:
                    continue

                value = parse_compact_int(cell.get_text(" ", strip=True))
                record = {
                    "y": year,
                    "g": region_code,
                    "n1": sector_code,
                }
                record[metric_key] = value
                records.append(record)

    return records, labels


def fetch_bestat_annual_records(view_id: str, metric_key: str) -> tuple[list[dict[str, int | str]], dict[str, str], dict[str, str]]:
    page_url = f"{BESTAT_BASE_URL}?view={view_id}"
    session = requests.Session()

    html = session.get(page_url, timeout=180).text
    viewstate = extract_updated_viewstate(html, "")

    dialog_html, viewstate = open_bestat_filter(session, page_url, viewstate, BESTAT_PERIOD_FILTER_BUTTON, "root.Jaar")
    max_years = extract_bestat_spinner_max(dialog_html)
    if not max_years:
        raise ValueError("Could not resolve annual be.STAT year range")

    viewstate = submit_bestat_year_filter(session, viewstate, max_years)
    viewstate = trigger_bestat_layout_submit(session, page_url, viewstate)
    html = session.get(page_url, timeout=180).text

    records, labels = parse_bestat_yearly_table(html, metric_key)
    metadata = {
        "viewUrl": page_url,
        "viewId": view_id,
    }
    return records, labels, metadata


def load_bestat_annual_flows() -> tuple[list[dict[str, int | str]], dict[str, str], dict[str, object]]:
    starters_records, starters_labels, starters_meta = fetch_bestat_annual_records(BESTAT_ANNUAL_STARTERS_VIEW, "fr")
    stoppers_records, stoppers_labels, stoppers_meta = fetch_bestat_annual_records(BESTAT_ANNUAL_STOPPERS_VIEW, "st")

    labels = starters_labels
    labels.update(stoppers_labels)
    records = combine_geo_year_records([starters_records, stoppers_records])
    metadata: dict[str, object] = {
        "startersView": starters_meta,
        "stoppersView": stoppers_meta,
        "latestYear": max(int(record["y"]) for record in records),
    }
    return records, labels, metadata


def extract_infogram_path(article_html: str) -> str:
    match = re.search(r'id="infogram_\d+_([0-9a-f-]+)"', article_html, re.IGNORECASE)
    if not match:
        raise ValueError("Could not find Infogram embed identifier on the Statbel annual totals page")
    return match.group(1)


def extract_chart_rows(node: Any) -> list[list[Any]] | None:
    if isinstance(node, dict):
        chart_data = node.get("chartData")
        if isinstance(chart_data, dict):
            data = chart_data.get("data")
            if isinstance(data, list) and data and isinstance(data[0], list):
                return data[0]

        for value in node.values():
            rows = extract_chart_rows(value)
            if rows:
                return rows
        return None

    if isinstance(node, list):
        for value in node:
            rows = extract_chart_rows(value)
            if rows:
                return rows
    return None


def extract_cell_text(cell: Any) -> str | None:
    if isinstance(cell, dict):
        value = cell.get("value")
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    if cell is None:
        return None

    text = str(cell).strip()
    return text or None


def parse_compact_int(value: str | None) -> int:
    if not value:
        return 0
    compact = re.sub(r"[^\d-]", "", value)
    if not compact:
        return 0
    return int(compact)


def load_annual_totals() -> tuple[list[dict[str, int]], dict[str, str]]:
    article_html = download_text(ANNUAL_TOTALS_PAGE_URL)
    infogram_path = extract_infogram_path(article_html)
    infogram_url = f"{INFOGRAM_EMBED_BASE_URL}/{infogram_path}?src=embed"
    infogram_html = download_text(infogram_url)

    match = re.search(r"window\.infographicData=(.*?);</script>", infogram_html, re.DOTALL)
    if not match:
        raise ValueError("Could not find Infogram data payload for annual totals")

    payload = json.loads(match.group(1))
    chart_rows = extract_chart_rows(payload)
    if not chart_rows or len(chart_rows) < 2:
        raise ValueError("Annual totals chart payload is empty")

    records: list[dict[str, int]] = []
    for row in chart_rows[1:]:
        year_text = extract_cell_text(row[0] if len(row) > 0 else None)
        starters_text = extract_cell_text(row[1] if len(row) > 1 else None)
        stoppers_text = extract_cell_text(row[2] if len(row) > 2 else None)
        if not year_text or not year_text.isdigit():
            continue

        records.append(
            build_year_record(
                year=int(year_text),
                starters=parse_compact_int(starters_text),
                stoppers=parse_compact_int(stoppers_text),
            )
        )

    records.sort(key=lambda item: item["y"])
    if not records:
        raise ValueError("No annual totals could be extracted from Infogram")

    metadata = {
        "articleUrl": ANNUAL_TOTALS_PAGE_URL,
        "infogramUrl": infogram_url,
        "title": str(payload.get("title") or ""),
        "updatedAt": str(payload.get("updatedAt") or ""),
    }
    return records, metadata


def build_lookups(labels: dict[str, str], records: list[dict[str, int | str]]) -> dict[str, object]:
    years = sorted({int(record["y"]) for record in records})
    latest_period = max(records, key=lambda item: (int(item["y"]), int(item["mo"])))

    sectors = [
        {"code": code, "nl": labels[code]}
        for code in sorted(labels)
        if code != "ALL"
    ]

    return {
        "sectors": sectors,
        "years": years,
        "latestPeriod": str(latest_period["period"]),
    }


def write_outputs(
    records: list[dict[str, int | str]],
    regional_records: list[dict[str, int | str]],
    labels: dict[str, str],
    annual_records: list[dict[str, int | str]],
    annual_metadata: dict[str, object],
) -> None:
    lookups = build_lookups(labels, records)
    summary = {
        "latestPeriod": lookups["latestPeriod"],
        "monthlyMinYear": min(lookups["years"]),
        "monthlyMaxYear": max(lookups["years"]),
        "yearlyMinYear": min(int(item["y"]) for item in annual_records),
        "yearlyMaxYear": max(int(item["y"]) for item in annual_records),
        "publicationPageUrl": PUBLICATION_PAGE_URL,
        "sources": [
            {
                "key": source.key,
                "url": source.url,
            }
            for source in SOURCES
        ],
        "annualFlowsSource": annual_metadata,
        "notes": [
            "2019-2020 komt uit de Statbel DataLab-reeks (T+30).",
            "Vanaf 2021 gebruikt de app de officiele Statbel-reeks (T+45).",
            "Voor 2025-2026 gebruikt Statbel NACE 2025; oudere jaren komen uit NACE 2008.",
            "De jaarreeks gebruikt de jaarlijkse Statbel-be.STAT-kubus per sector en gewest vanaf 2008.",
            "Jaarcijfers zijn geen som van de maandcijfers: Statbel baseert de jaarlijkse starters en stoppers op een 31/12-foto.",
            "De gewestuitsplitsing gebruikt de DataLab-reeks voor 2019-2020 en be.STAT-datasources vanaf 2021.",
        ],
    }

    (RESULTS_DIR / "vat_monthly_flows.json").write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (RESULTS_DIR / "vat_monthly_lookups.json").write_text(
        json.dumps(lookups, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (RESULTS_DIR / "vat_monthly_flows_regions.json").write_text(
        json.dumps(regional_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (RESULTS_DIR / "vat_yearly_flows.json").write_text(
        json.dumps(annual_records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (RESULTS_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    remote_meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "latest_period": lookups["latestPeriod"],
        "sources": [
            {
                "key": source.key,
                "url": source.url,
            }
            for source in SOURCES
        ],
        "annual_flows_source": annual_metadata,
        "annual_latest_year": max(int(item["y"]) for item in annual_records),
    }
    (DATA_DIR / ".remote_metadata.json").write_text(
        json.dumps(remote_meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    records_by_source: list[list[dict[str, int | str]]] = []
    regional_records_by_source: list[list[dict[str, int | str]]] = []
    labels: dict[str, str] = {"ALL": "Alle activiteiten"}

    for source in SOURCES:
        path = resolve_source_file(source)
        if source.kind == "datalab":
            source_records, source_labels = load_datalab_workbook(path)
            regional_records, _ = load_datalab_regional_workbook(path)
            regional_records_by_source.append(regional_records)
        else:
            source_records, source_labels = load_official_workbook(path)

        records_by_source.append(source_records)
        labels.update(source_labels)

    combined_records = combine_records(records_by_source)
    regional_records_by_source.append(load_bestat_regional_monthlies())
    combined_regional_records = combine_geo_records(regional_records_by_source)
    annual_records, annual_labels, annual_metadata = load_bestat_annual_flows()
    labels.update(annual_labels)
    write_outputs(combined_records, combined_regional_records, labels, annual_records, annual_metadata)


if __name__ == "__main__":
    main()
