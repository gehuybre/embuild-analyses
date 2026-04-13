#!/usr/bin/env python3
"""Fetch and process NBB MIR mortgage interest rate data."""

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
from datetime import UTC, datetime
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

BASE_API_URL = "https://nsidisseminate-stat.nbb.be/rest/data/BE2,DF_MIR,1.0"
SERIES_KEY = os.environ.get("NBB_SERIES_KEY", "M.R_N.2250.A2C.A_P.Z.Z")
START_PERIOD = os.environ.get("NBB_START_PERIOD", "2015-01")
TIMEOUT_SECONDS = int(os.environ.get("NBB_TIMEOUT_SECONDS", "60"))
SERIES_URL = (
    f"{BASE_API_URL}/{SERIES_KEY}"
    f"?startPeriod={START_PERIOD}&dimensionAtObservation=AllDimensions"
)

NS = {
    "generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
}


def fetch_xml(url: str) -> bytes:
    request = Request(
        url,
        headers={
            "Accept": "application/vnd.sdmx.genericdata+xml;version=2.1, application/xml;q=0.9, text/xml;q=0.8",
            "User-Agent": "data-blog-nbb-rente/1.0",
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(exc):
            completed = subprocess.run(
                [
                    "curl",
                    "-fsSL",
                    "-H",
                    "Accept: application/vnd.sdmx.genericdata+xml;version=2.1, application/xml;q=0.9, text/xml;q=0.8",
                    "-A",
                    "data-blog-nbb-rente/1.0",
                    url,
                ],
                capture_output=True,
                check=True,
            )
            return completed.stdout
        raise


def period_to_sort_value(period: str) -> int:
    year, month = period.split("-", 1)
    return int(year) * 100 + int(month)


def month_end_iso(period: str) -> str:
    year, month = (int(part) for part in period.split("-", 1))
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{last_day:02d}"


def load_points(xml_bytes: bytes) -> list[dict[str, float | int | str]]:
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


def write_csv(path: Path, rows: list[dict[str, float | int | str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["period", "rate"])
        writer.writeheader()
        for row in rows:
            writer.writerow({"period": row["period"], "rate": row["rate"]})


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        xml_bytes = fetch_xml(SERIES_URL)
    except (HTTPError, URLError, TimeoutError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Failed to fetch NBB data: {exc}", file=sys.stderr)
        return 1

    response_sha256 = hashlib.sha256(xml_bytes).hexdigest()
    fetched_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    points = load_points(xml_bytes)

    if not points:
        print("No NBB observations found for the requested series.", file=sys.stderr)
        return 1

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

    write_json(SERIES_FILE, points)
    write_csv(CSV_FILE, points)
    write_json(METADATA_FILE, metadata)
    write_json(PUBLIC_SERIES_FILE, points)
    write_csv(PUBLIC_CSV_FILE, points)
    write_json(PUBLIC_METADATA_FILE, metadata)
    write_json(REMOTE_METADATA_FILE, remote_metadata)
    update_content_publication_date(publication_date)

    print(f"Wrote {len(points)} observations to {SERIES_FILE}")
    print(f"Latest period: {latest_period} ({latest_rate:.2f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
