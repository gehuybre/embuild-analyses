#!/usr/bin/env python3
"""Fetch and process NBB mortgage rate data and FPB inflation forecasts."""

from __future__ import annotations

import calendar
import csv
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
import tempfile
import zipfile
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
CONTENT_FILE = BASE_DIR / "content.mdx"
REMOTE_METADATA_FILE = DATA_DIR / ".remote_metadata.json"

SERIES_FILE = RESULTS_DIR / "interest_rates.json"
CSV_FILE = RESULTS_DIR / "interest_rates.csv"
METADATA_FILE = RESULTS_DIR / "metadata.json"
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
PUBLIC_SERIES_FILE = PUBLIC_DATA_DIR / "interest_rates.json"
PUBLIC_CSV_FILE = PUBLIC_DATA_DIR / "interest_rates.csv"
PUBLIC_METADATA_FILE = PUBLIC_DATA_DIR / "metadata.json"

INFLATION_FORECASTS_FILE = RESULTS_DIR / "inflation_forecasts.json"
INFLATION_FORECASTS_CSV_FILE = RESULTS_DIR / "inflation_forecasts.csv"
INFLATION_METADATA_FILE = RESULTS_DIR / "inflation_forecasts_metadata.json"
PUBLIC_INFLATION_FORECASTS_FILE = PUBLIC_DATA_DIR / "inflation_forecasts.json"
PUBLIC_INFLATION_FORECASTS_CSV_FILE = PUBLIC_DATA_DIR / "inflation_forecasts.csv"
PUBLIC_INFLATION_METADATA_FILE = PUBLIC_DATA_DIR / "inflation_forecasts_metadata.json"

BASE_API_URL = "https://nsidisseminate-stat.nbb.be/rest/data/BE2,DF_MIR,1.0"
SERIES_KEY = os.environ.get("NBB_SERIES_KEY", "M.R_N.2250.A2C.A_P.Z.Z")
START_PERIOD = os.environ.get("NBB_START_PERIOD", "2015-01")
TIMEOUT_SECONDS = int(os.environ.get("NBB_TIMEOUT_SECONDS", "60"))
SERIES_URL = (
    f"{BASE_API_URL}/{SERIES_KEY}"
    f"?startPeriod={START_PERIOD}&dimensionAtObservation=AllDimensions"
)

INFLATION_SOURCE_URL = "https://www.plan.be/en/data/consumer-price-index-inflation-forecasts"
INFLATION_WORKBOOK_URL = "https://www.plan.be/sites/default/files/documents/DATA_FOR_InflationHistory.xlsx"

NS = {
    "generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
    "spreadsheet": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "document_rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package_rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

DUTCH_MONTHS = {
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

SHEET_MONTHS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


def parse_curl_headers(raw_headers: str) -> dict[str, str]:
    blocks = [block for block in re.split(r"\r?\n\r?\n", raw_headers.strip()) if block.strip()]
    for block in reversed(blocks):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or not lines[0].startswith("HTTP/"):
            continue

        headers: dict[str, str] = {}
        for line in lines[1:]:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
        return headers

    return {}


def fetch_bytes(url: str, *, accept: str, user_agent: str) -> tuple[bytes, dict[str, str]]:
    request = Request(
        url,
        headers={
            "Accept": accept,
            "User-Agent": user_agent,
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read(), {key.lower(): value for key, value in response.headers.items()}
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if not (
            isinstance(reason, ssl.SSLCertVerificationError)
            or "CERTIFICATE_VERIFY_FAILED" in str(exc)
        ):
            raise

        with tempfile.TemporaryDirectory(prefix="nbb-rente-fetch-") as temp_dir:
            temp_path = Path(temp_dir)
            body_path = temp_path / "body.bin"
            header_path = temp_path / "headers.txt"

            subprocess.run(
                [
                    "curl",
                    "-fsSL",
                    "-H",
                    f"Accept: {accept}",
                    "-A",
                    user_agent,
                    "-D",
                    str(header_path),
                    "-o",
                    str(body_path),
                    url,
                ],
                capture_output=True,
                check=True,
            )

            return body_path.read_bytes(), parse_curl_headers(
                header_path.read_text(encoding="utf-8", errors="replace")
            )


def fetch_xml(url: str) -> bytes:
    xml_bytes, _ = fetch_bytes(
        url,
        accept="application/vnd.sdmx.genericdata+xml;version=2.1, application/xml;q=0.9, text/xml;q=0.8",
        user_agent="data-blog-nbb-rente/1.0",
    )
    return xml_bytes


def fetch_inflation_workbook() -> tuple[bytes, dict[str, str]]:
    return fetch_bytes(
        INFLATION_WORKBOOK_URL,
        accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream;q=0.9",
        user_agent="data-blog-inflation-forecast/1.0",
    )


def period_to_sort_value(period: str) -> int:
    year, month = period.split("-", 1)
    return int(year) * 100 + int(month)


def month_end_iso(period: str) -> str:
    year, month = (int(part) for part in period.split("-", 1))
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{last_day:02d}"


def load_nbb_points(xml_bytes: bytes) -> list[dict[str, float | int | str]]:
    root = ET.fromstring(xml_bytes)
    points: list[dict[str, float | int | str]] = []

    for obs in root.findall(".//generic:Obs", NS):
        key_values = {
            value.attrib["id"]: value.attrib["value"]
            for value in obs.findall("generic:ObsKey/generic:Value", NS)
        }

        period = key_values.get("TIME_PERIOD")
        obs_value = obs.find("generic:ObsValue", NS)
        if not period or obs_value is None:
            continue

        try:
            rate = float(obs_value.attrib["value"])
        except (KeyError, ValueError):
            continue

        points.append(
            {
                "period": period,
                "sortValue": period_to_sort_value(period),
                "rate": rate,
            }
        )

    points.sort(key=lambda point: int(point["sortValue"]))
    return points


def parse_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        xml_bytes = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ET.fromstring(xml_bytes)
    shared_strings: list[str] = []

    for string_item in root.findall("spreadsheet:si", NS):
        text_parts = [
            text_node.text or ""
            for text_node in string_item.findall(".//spreadsheet:t", NS)
        ]
        shared_strings.append("".join(text_parts))

    return shared_strings


def normalize_sheet_target(target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return f"xl/{target}" if not target.startswith("xl/") else target


def load_sheet_targets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_lookup = {
        relation.attrib["Id"]: normalize_sheet_target(relation.attrib["Target"])
        for relation in rel_root.findall("package_rel:Relationship", NS)
    }

    targets: list[tuple[str, str]] = []
    for sheet in workbook_root.findall("spreadsheet:sheets/spreadsheet:sheet", NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['document_rel']}}}id"]
        target = rel_lookup.get(rel_id)
        if target:
            targets.append((name, target))

    return targets


def parse_sheet_rows(xml_bytes: bytes, shared_strings: list[str]) -> dict[int, dict[str, str | None]]:
    root = ET.fromstring(xml_bytes)
    rows: dict[int, dict[str, str | None]] = {}

    for row in root.findall("spreadsheet:sheetData/spreadsheet:row", NS):
        row_index = int(row.attrib["r"])
        row_values: dict[str, str | None] = {}

        for cell in row.findall("spreadsheet:c", NS):
            ref = cell.attrib.get("r", "")
            column_match = re.match(r"([A-Z]+)", ref)
            if not column_match:
                continue

            column = column_match.group(1)
            cell_type = cell.attrib.get("t")
            value_node = cell.find("spreadsheet:v", NS)

            if cell_type == "inlineStr":
                text_value = "".join(
                    text_node.text or ""
                    for text_node in cell.findall(".//spreadsheet:t", NS)
                )
                row_values[column] = text_value
                continue

            if value_node is None or value_node.text is None:
                row_values[column] = None
                continue

            raw_value = value_node.text
            if cell_type == "s":
                try:
                    row_values[column] = shared_strings[int(raw_value)]
                except (IndexError, ValueError):
                    row_values[column] = raw_value
            else:
                row_values[column] = raw_value

        rows[row_index] = row_values

    return rows


def get_row_cell(rows: dict[int, dict[str, str | None]], row_index: int, column: str) -> str | None:
    return rows.get(row_index, {}).get(column)


def parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return float(stripped)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    number = parse_float(value)
    if number is None:
        return None
    return int(round(number))


def excel_serial_to_period(value: float) -> str:
    serial = int(round(value))
    moment = date(1899, 12, 30) + timedelta(days=serial)
    return moment.strftime("%Y-%m")


def parse_forecast_month(sheet_name: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z][a-z]{2}) (\d{2})", sheet_name.strip())
    if not match:
        raise ValueError(f"Unexpected sheet name format: {sheet_name}")

    month_number = SHEET_MONTHS[match.group(1)]
    year = 2000 + int(match.group(2))
    return year, month_number


def format_month_year_label(year: int, month: int) -> str:
    return f"{DUTCH_MONTHS[month]} {year}"


def extract_square_bracket_date(title: str) -> str | None:
    match = re.search(r"\[(\d{2})/(\d{2})/(\d{4})\]", title)
    if not match:
        return None
    day, month, year = match.groups()
    return f"{year}-{month}-{day}"


def parse_inflation_sheet(sheet_name: str, rows: dict[int, dict[str, str | None]]) -> dict[str, object]:
    forecast_year, forecast_month = parse_forecast_month(sheet_name)
    forecast_period = f"{forecast_year:04d}-{forecast_month:02d}"
    title = (get_row_cell(rows, 1, "A") or sheet_name).strip()
    publication_date = extract_square_bracket_date(title) or f"{forecast_period}-01"

    annual_points: list[dict[str, float | int]] = []
    annual_row = 5
    while True:
        year_value = parse_int(get_row_cell(rows, annual_row, "A"))
        if year_value is None:
            break

        annual_points.append(
            {
                "year": year_value,
                "cpiIndex": parse_float(get_row_cell(rows, annual_row, "B")) or 0.0,
                "cpiGrowthRate": parse_float(get_row_cell(rows, annual_row, "C")) or 0.0,
                "healthIndex": parse_float(get_row_cell(rows, annual_row, "D")) or 0.0,
                "healthGrowthRate": parse_float(get_row_cell(rows, annual_row, "E")) or 0.0,
            }
        )
        annual_row += 1

    monthly_points: list[dict[str, float | int | str | None]] = []
    monthly_row = 8
    while True:
        period_raw = get_row_cell(rows, monthly_row, "A")
        if period_raw is None:
            break

        period_number = parse_float(period_raw)
        if period_number is None:
            break

        period = excel_serial_to_period(period_number)
        monthly_points.append(
            {
                "period": period,
                "sortValue": period_to_sort_value(period),
                "cpiIndex": parse_float(get_row_cell(rows, monthly_row, "B")),
                "cpiGrowthRate": parse_float(get_row_cell(rows, monthly_row, "C")),
                "healthIndex": parse_float(get_row_cell(rows, monthly_row, "D")),
                "healthGrowthRate": parse_float(get_row_cell(rows, monthly_row, "E")),
                "smoothedHealthIndex": parse_float(get_row_cell(rows, monthly_row, "F")),
                "pivotalIndex": parse_float(get_row_cell(rows, monthly_row, "G")),
            }
        )
        monthly_row += 1

    return {
        "sheetName": sheet_name,
        "forecastMonth": forecast_period,
        "forecastSortValue": period_to_sort_value(forecast_period),
        "forecastYear": forecast_year,
        "forecastMonthNumber": forecast_month,
        "forecastLabel": format_month_year_label(forecast_year, forecast_month),
        "sourcePublicationDate": publication_date,
        "title": title,
        "cpiIndexLabel": (get_row_cell(rows, 3, "B") or "").strip(),
        "healthIndexLabel": (get_row_cell(rows, 3, "D") or "").strip(),
        "monthlyPoints": monthly_points,
        "annualPoints": annual_points,
    }


def parse_inflation_workbook(
    workbook_bytes: bytes,
    response_headers: dict[str, str],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    with zipfile.ZipFile(BytesIO(workbook_bytes)) as workbook:
        shared_strings = parse_shared_strings(workbook)
        forecasts: list[dict[str, object]] = []

        for sheet_name, sheet_target in load_sheet_targets(workbook):
            rows = parse_sheet_rows(workbook.read(sheet_target), shared_strings)
            forecasts.append(parse_inflation_sheet(sheet_name, rows))

    forecasts.sort(key=lambda forecast: int(forecast["forecastSortValue"]))

    if not forecasts:
        raise ValueError("No inflation forecasts found in workbook.")

    latest_forecast = forecasts[-1]
    latest_forecast_month = str(latest_forecast["forecastMonth"])
    latest_forecast_year = int(latest_forecast["forecastYear"])
    latest_base_label = str(latest_forecast["cpiIndexLabel"])

    comparable_forecasts = [
        forecast
        for forecast in forecasts
        if (
            int(forecast["forecastYear"]) == latest_forecast_year
            and str(forecast["cpiIndexLabel"]) == latest_base_label
        )
    ]

    comparable_periods = sorted(
        {
            str(point["period"])
            for forecast in comparable_forecasts
            for point in forecast["monthlyPoints"]  # type: ignore[index]
            if point.get("period")
        }
    )

    metadata = {
        "sourceProvider": "Federaal Planbureau",
        "sourceTitle": "Consumptieprijsindex - inflatievooruitzichten",
        "sourceUrl": INFLATION_SOURCE_URL,
        "sourceDownloadUrl": INFLATION_WORKBOOK_URL,
        "workbookLastModified": response_headers.get("last-modified"),
        "latestForecastMonth": latest_forecast_month,
        "latestForecastLabel": latest_forecast["forecastLabel"],
        "latestSourcePublicationDate": latest_forecast["sourcePublicationDate"],
        "forecastCount": len(forecasts),
        "comparableBaseIndexLabel": latest_base_label,
        "comparableForecastMonths": [
            forecast["forecastMonth"] for forecast in comparable_forecasts
        ],
        "comparableForecastLabels": [
            forecast["forecastLabel"] for forecast in comparable_forecasts
        ],
        "comparableForecastCount": len(comparable_forecasts),
        "comparisonPeriodStart": comparable_periods[0] if comparable_periods else None,
        "comparisonPeriodEnd": comparable_periods[-1] if comparable_periods else None,
    }

    return forecasts, metadata


def extract_frontmatter(content: str) -> tuple[str, str] | None:
    match = re.match(r"^---\n(.*?)\n---\n?", content, re.DOTALL)
    if not match:
        return None
    return match.group(1), content[match.end() :]


def upsert_frontmatter_field(frontmatter: str, field_name: str, value: str) -> tuple[str, bool]:
    pattern = rf"^{re.escape(field_name)}:\s*(.+)$"
    replacement = f"{field_name}: {value}"
    match = re.search(pattern, frontmatter, re.MULTILINE)
    if match:
        existing_value = match.group(1).strip()
        if existing_value == value:
            return frontmatter, False
        return re.sub(pattern, replacement, frontmatter, flags=re.MULTILINE), True

    insertion_anchor = "sourceUrl:"
    if insertion_anchor in frontmatter and field_name == "sourcePublicationDate":
        updated = re.sub(
            rf"({re.escape(insertion_anchor)}\s*[^\n]+)",
            rf"\1\n{replacement}",
            frontmatter.rstrip("\n"),
        )
        return updated + "\n", True

    return frontmatter.rstrip("\n") + f"\n{replacement}\n", True


def update_content_publication_date(publication_date: str) -> bool:
    if not CONTENT_FILE.exists():
        return False

    content = CONTENT_FILE.read_text(encoding="utf-8")
    parsed = extract_frontmatter(content)
    if not parsed:
        return False

    frontmatter, rest = parsed
    updated_frontmatter, changed = upsert_frontmatter_field(
        frontmatter,
        "sourcePublicationDate",
        publication_date,
    )
    if not changed:
        return False

    CONTENT_FILE.write_text(
        f"---\n{updated_frontmatter.rstrip()}\n---\n{rest.lstrip()}",
        encoding="utf-8",
    )
    return True


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_csv(path: Path, rows: list[dict[str, float | int | str | None]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def build_nbb_metadata(
    points: list[dict[str, float | int | str]],
    xml_bytes: bytes,
) -> tuple[dict[str, object], dict[str, object]]:
    response_sha256 = hashlib.sha256(xml_bytes).hexdigest()
    fetched_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    latest_point = points[-1]
    latest_period = str(latest_point["period"])
    latest_rate = float(latest_point["rate"])
    publication_date = month_end_iso(latest_period)
    rates = [float(point["rate"]) for point in points]

    metadata = {
        "sourceProvider": "Nationale Bank van België (NBB)",
        "sourceTitle": "MFI rentetarieven (MIR) - hypothecaire rente op nieuwe contracten (> 10 jaar rentevast)",
        "sourceUrl": SERIES_URL,
        "sourcePublicationDate": publication_date,
        "latestPeriod": latest_period,
        "latestRate": latest_rate,
        "minRate": min(rates),
        "maxRate": max(rates),
        "observationCount": len(points),
        "fetchedAt": fetched_at,
        "responseSha256": response_sha256,
        "series": {
            "frequency": "M",
            "item": "R_N",
            "sector": "2250",
            "instrument": "A2C",
            "maturity": "A_P",
            "quartile": "Z",
            "factor": "Z",
        },
    }

    remote_metadata = {
        "url": SERIES_URL,
        "latest_period": latest_period,
        "source_publication_date": publication_date,
        "latest_rate": latest_rate,
        "response_sha256": response_sha256,
        "fetched_at": fetched_at,
        "observation_count": len(points),
    }

    return metadata, remote_metadata


def build_inflation_metadata(
    forecasts: list[dict[str, object]],
    metadata: dict[str, object],
    workbook_bytes: bytes,
    response_headers: dict[str, str],
) -> tuple[dict[str, object], dict[str, object]]:
    response_sha256 = hashlib.sha256(workbook_bytes).hexdigest()
    fetched_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    metadata_payload = {
        **metadata,
        "fetchedAt": fetched_at,
        "responseSha256": response_sha256,
    }

    latest_forecast = forecasts[-1]
    remote_metadata = {
        "landing_url": INFLATION_SOURCE_URL,
        "download_url": INFLATION_WORKBOOK_URL,
        "workbook_last_modified": response_headers.get("last-modified"),
        "latest_forecast_month": latest_forecast["forecastMonth"],
        "latest_source_publication_date": latest_forecast["sourcePublicationDate"],
        "response_sha256": response_sha256,
        "fetched_at": fetched_at,
        "forecast_count": len(forecasts),
    }

    return metadata_payload, remote_metadata


def flatten_inflation_forecasts(
    forecasts: list[dict[str, object]],
) -> list[dict[str, float | int | str | None]]:
    rows: list[dict[str, float | int | str | None]] = []

    for forecast in forecasts:
        for point in forecast["monthlyPoints"]:  # type: ignore[index]
            rows.append(
                {
                    "forecast_month": str(forecast["forecastMonth"]),
                    "forecast_label": str(forecast["forecastLabel"]),
                    "source_publication_date": str(forecast["sourcePublicationDate"]),
                    "base_index_label": str(forecast["cpiIndexLabel"]),
                    "period": str(point["period"]),
                    "cpi_index": point.get("cpiIndex"),
                    "cpi_growth_rate": point.get("cpiGrowthRate"),
                    "health_index": point.get("healthIndex"),
                    "health_growth_rate": point.get("healthGrowthRate"),
                    "smoothed_health_index": point.get("smoothedHealthIndex"),
                    "pivotal_index": point.get("pivotalIndex"),
                }
            )

    return rows


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        xml_bytes = fetch_xml(SERIES_URL)
        inflation_workbook_bytes, inflation_headers = fetch_inflation_workbook()
    except (HTTPError, URLError, TimeoutError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Failed to fetch remote data: {exc}", file=sys.stderr)
        return 1

    nbb_points = load_nbb_points(xml_bytes)
    if not nbb_points:
        print("No NBB observations found for the requested series.", file=sys.stderr)
        return 1

    try:
        inflation_forecasts, inflation_metadata_base = parse_inflation_workbook(
            inflation_workbook_bytes,
            inflation_headers,
        )
    except (ValueError, KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        print(f"Failed to parse inflation workbook: {exc}", file=sys.stderr)
        return 1

    nbb_metadata, nbb_remote_metadata = build_nbb_metadata(nbb_points, xml_bytes)
    inflation_metadata, inflation_remote_metadata = build_inflation_metadata(
        inflation_forecasts,
        inflation_metadata_base,
        inflation_workbook_bytes,
        inflation_headers,
    )

    write_json(SERIES_FILE, nbb_points)
    write_csv(CSV_FILE, nbb_points, ["period", "rate"])
    write_json(METADATA_FILE, nbb_metadata)
    write_json(PUBLIC_SERIES_FILE, nbb_points)
    write_csv(PUBLIC_CSV_FILE, nbb_points, ["period", "rate"])
    write_json(PUBLIC_METADATA_FILE, nbb_metadata)

    inflation_rows = flatten_inflation_forecasts(inflation_forecasts)
    inflation_fieldnames = [
        "forecast_month",
        "forecast_label",
        "source_publication_date",
        "base_index_label",
        "period",
        "cpi_index",
        "cpi_growth_rate",
        "health_index",
        "health_growth_rate",
        "smoothed_health_index",
        "pivotal_index",
    ]

    write_json(INFLATION_FORECASTS_FILE, inflation_forecasts)
    write_csv(INFLATION_FORECASTS_CSV_FILE, inflation_rows, inflation_fieldnames)
    write_json(INFLATION_METADATA_FILE, inflation_metadata)
    write_json(PUBLIC_INFLATION_FORECASTS_FILE, inflation_forecasts)
    write_csv(PUBLIC_INFLATION_FORECASTS_CSV_FILE, inflation_rows, inflation_fieldnames)
    write_json(PUBLIC_INFLATION_METADATA_FILE, inflation_metadata)

    write_json(
        REMOTE_METADATA_FILE,
        {
            "nbb": nbb_remote_metadata,
            "inflation_forecasts": inflation_remote_metadata,
        },
    )
    update_content_publication_date(str(nbb_metadata["sourcePublicationDate"]))

    print(f"Wrote {len(nbb_points)} NBB observations to {SERIES_FILE}")
    print(f"Wrote {len(inflation_forecasts)} inflation forecast vintages to {INFLATION_FORECASTS_FILE}")
    print(
        "Latest inflation forecast: "
        f"{inflation_metadata['latestForecastLabel']} ({inflation_metadata['latestSourcePublicationDate']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
