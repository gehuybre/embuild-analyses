from __future__ import annotations

import hashlib
import json
import re
import argparse
from datetime import datetime, timezone
from pathlib import Path

from process_monthly_data import (
    BESTAT_ANNUAL_GEO_HIERARCHY,
    BESTAT_ANNUAL_STARTERS_VIEW,
    BESTAT_ANNUAL_STOPPERS_VIEW,
    BESTAT_BASE_URL,
    BESTAT_GEO_FILTER_BUTTON,
    BESTAT_PERIOD_FILTER_BUTTON,
    DATA_DIR,
    PROVINCE_FILTER_LABELS,
    RESULTS_DIR,
    BeautifulSoup,
    extract_bestat_filter_rowkeys,
    extract_bestat_selection_field,
    extract_bestat_spinner_max,
    extract_updated_viewstate,
    open_bestat_filter,
    parse_bestat_yearly_table,
    parse_annual_activity_headers,
    requests,
    submit_bestat_tree_filter,
    submit_bestat_year_filter,
    trigger_bestat_layout_submit,
)

SOURCE_DIR = DATA_DIR / "annual-arrondissement-flows"


def arrondissement_code(label: str) -> str:
    shared = Path(__file__).resolve().parents[3] / "packages/embuild-shared/src/lib/geo-utils.ts"
    matches = re.findall(r"\{ code: '(\d+)', name: '([^']+)', provinceCode: '\d+' \}", shared.read_text())
    aliases = {"Arrondissement Aat": "51000", "Arrondissement Doornik-Moeskroen": "57000"}
    codes = {name: code for code, name in matches}
    codes.update(aliases)
    if label not in codes:
        raise ValueError(f"Unknown Statbel arrondissement: {label}")
    return codes[label]


def parse_arrondissement_table(html: str, metric: str, code: str, label: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#pricePanel table.pvtTable")
    if table is None or label not in table.get_text():
        raise ValueError(f"No arrondissement table for {label}")
    headers = table.select("thead tr")
    years = [int(cell.get_text(strip=True)) for cell in headers[0].find_all(["th", "td"])
             if re.fullmatch(r"\d{4}", cell.get_text(strip=True))]
    area_headers = [cell.get_text(" ", strip=True) for row in headers for cell in row.find_all(["th", "td"])
                    if cell.get_text(" ", strip=True).startswith("Arrondissement ")
                    and "Expand all" not in cell.get_text()]
    if area_headers != [label] * len(years):
        raise ValueError(f"Unexpected arrondissement columns for {label}")
    records, _ = parse_bestat_yearly_table(html, metric, [code, None])
    missing = {}
    for row in table.select("tbody tr"):
        sector, _ = parse_annual_activity_headers([cell.get_text(" ", strip=True) for cell in row.find_all("th")])
        if not sector:
            continue
        cells = row.find_all("td")
        if len(cells) != len(years) * 2:
            raise ValueError(f"Unexpected annual cell count for {label}, sector {sector}")
        for year, cell in zip(years, cells[::2]):
            text = cell.get_text(" ", strip=True)
            if text == ".":
                missing[(year, sector)] = True
            elif not re.fullmatch(r"\d[\d\s.,]*", text):
                raise ValueError(f"Unsupported Statbel value {text!r} for {label}, {year}, {sector}")
    for record in records:
        if (record["y"], record["n1"]) in missing:
            record[metric] = None
    if not records or not any(row["n1"] == "ALL" for row in records):
        raise ValueError(f"No annual totals for {label}")
    if len(records) != len(years) * len({row["n1"] for row in records}):
        raise ValueError(f"Incomplete year/sector table for {label}")
    return records


def fetch_metric(view_id: str, metric: str) -> tuple[list[dict], list[dict], list[dict]]:
    url = f"{BESTAT_BASE_URL}?view={view_id}"
    records = []
    areas = []
    snapshots = []
    # Each selection uses a new session, so server-side filters cannot leak between areas.
    with requests.Session() as discovery:
        response = discovery.get(url, timeout=180)
        response.raise_for_status()
        dialog, _ = open_bestat_filter(
            discovery, url, extract_updated_viewstate(response.text, ""),
            BESTAT_GEO_FILTER_BUTTON, BESTAT_ANNUAL_GEO_HIERARCHY,
        )
        labels = [label for label in extract_bestat_filter_rowkeys(dialog)
                  if label.startswith("Arrondissement ") and label != "Arrondissement Brussel-Hoofdstad"]
    if not labels:
        raise ValueError("Statbel did not return any arrondissement filters")

    for label in labels:
        code = arrondissement_code(label)
        with requests.Session() as session:
            response = session.get(url, timeout=180)
            response.raise_for_status()
            state = extract_updated_viewstate(response.text, "")
            dialog, state = open_bestat_filter(session, url, state, BESTAT_PERIOD_FILTER_BUTTON, "root.Jaar")
            years = extract_bestat_spinner_max(dialog)
            if not years:
                raise ValueError(f"Missing annual range for {label}")
            state = submit_bestat_year_filter(session, state, years)
            state = trigger_bestat_layout_submit(session, url, state)
            dialog, state = open_bestat_filter(session, url, state, BESTAT_GEO_FILTER_BUTTON, BESTAT_ANNUAL_GEO_HIERARCHY)
            keys = extract_bestat_filter_rowkeys(dialog)
            field = extract_bestat_selection_field(dialog)
            if label not in keys or not field:
                raise ValueError(f"Missing geographic filter for {label}")
            state = submit_bestat_tree_filter(session, state, keys[label], field)
            trigger_bestat_layout_submit(session, url, state)
            response = session.get(url, timeout=180)
            response.raise_for_status()
            parsed = parse_arrondissement_table(response.text, metric, code, label)
            province = next((name for name, key in keys.items()
                             if name in PROVINCE_FILTER_LABELS.values() and key == keys[label].rsplit("_", 1)[0]), None)
            if province is None:
                raise ValueError(f"Missing parent province for {label}")
            province_code = next(code for code, name in PROVINCE_FILTER_LABELS.items() if name == province)
            filename = f"{metric}-{code}.html"
            raw = response.content
            (SOURCE_DIR / filename).write_bytes(raw)
            snapshots.append({"file": filename, "sha256": hashlib.sha256(raw).hexdigest(),
                              "viewUrl": url, "selection": label, "retrievedAt": datetime.now(timezone.utc).isoformat()})
            records.extend(parsed)
            areas.append({"code": code, "label": label.removeprefix("Arrondissement "), "provinceCode": province_code})
            print(f"{metric}: {label}: {len(parsed)} rows", flush=True)
    return records, areas, snapshots


def combine_metrics(starters: list[dict], stoppers: list[dict]) -> list[dict]:
    key = lambda row: (row["y"], row["g"], row["n1"])
    first = {key(row): row for row in starters}
    last = {key(row): row for row in stoppers}
    if len(first) != len(starters) or len(last) != len(stoppers) or first.keys() != last.keys():
        raise ValueError("Starters and stoppers must have matching unique year/area/sector cells")
    return [{**first[cell], "st": last[cell]["st"]} for cell in sorted(first)]


def validate_province_totals(rows: list[dict], areas: list[dict], provinces: list[dict]) -> None:
    parents = {area["code"]: area["provinceCode"] for area in areas}
    sums = {}
    missing = set()
    for row in rows:
        cell = (row["y"], parents[row["g"]], row["n1"])
        totals = sums.setdefault(cell, {"fr": 0, "st": 0})
        for metric in totals:
            if row[metric] is None:
                missing.add((cell, metric))
            else:
                totals[metric] += row[metric]
    official = {(row["y"], row["g"], row["n1"]): row for row in provinces if not row.get("p")}
    differences = [(cell, metric, total[metric], official.get(cell, {}).get(metric))
                   for cell, total in sums.items() for metric in ("fr", "st")
                   if (cell, metric) not in missing
                   if cell not in official or total[metric] != official[cell][metric]]
    if differences:
        raise ValueError(f"Arrondissement totals differ from provinces: {differences[:12]}")
    if any(cell[2] == "ALL" for cell, _ in missing):
        raise ValueError("Missing arrondissement totals: provincial validation is incomplete")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-snapshots", action="store_true", help="Rebuild using the saved official responses, without network access")
    args = parser.parse_args()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    if args.from_snapshots:
        areas = json.loads((RESULTS_DIR / "vat_yearly_flows_arrondissements_lookups.json").read_text())["arrondissements"]
        snapshots = json.loads((SOURCE_DIR / "manifest.json").read_text())["snapshots"]
        metrics = {"fr": [], "st": []}
        for snapshot in snapshots:
            raw = (SOURCE_DIR / snapshot["file"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != snapshot["sha256"]:
                raise ValueError(f"Changed snapshot: {snapshot['file']}")
            metric, code = snapshot["file"].removesuffix(".html").split("-")
            metrics[metric].extend(parse_arrondissement_table(raw.decode(), metric, code, snapshot["selection"]))
        starters, stoppers = metrics["fr"], metrics["st"]
        stop_areas, stop_snapshots = areas, []
    else:
        starters, areas, snapshots = fetch_metric(BESTAT_ANNUAL_STARTERS_VIEW, "fr")
        stoppers, stop_areas, stop_snapshots = fetch_metric(BESTAT_ANNUAL_STOPPERS_VIEW, "st")
    if areas != stop_areas:
        raise ValueError("Starters and stoppers expose different arrondissements")
    rows = combine_metrics(starters, stoppers)
    provinces = json.loads((RESULTS_DIR / "vat_yearly_flows_provinces.json").read_text())
    validate_province_totals(rows, areas, provinces)
    lookups = {
        "years": sorted({row["y"] for row in rows}),
        "arrondissements": areas,
        "sourceUrls": [f"{BESTAT_BASE_URL}?view={view}" for view in (BESTAT_ANNUAL_STARTERS_VIEW, BESTAT_ANNUAL_STOPPERS_VIEW)],
        "notes": ["Jaarfoto op 31 december; geen maand- of kwartaalcijfers en geen voorlopige schatting.",
                  "Henegouwse arrondissementgrenzen wijzigen in 2018; vergelijk niet over deze grens.",
                  "Een punt in de Statbel-tabel wordt als ontbrekende waarde bewaard, niet als nul."],
        "snapshots": snapshots + stop_snapshots,
    }
    (RESULTS_DIR / "vat_yearly_flows_arrondissements.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    (RESULTS_DIR / "vat_yearly_flows_arrondissements_lookups.json").write_text(json.dumps(lookups, ensure_ascii=False, indent=2))
    (SOURCE_DIR / "manifest.json").write_text(json.dumps({"snapshots": snapshots + stop_snapshots}, indent=2))
    summary_path = RESULTS_DIR / "summary.json"
    summary = json.loads(summary_path.read_text())
    summary["arrondissementFlows"] = {"years": lookups["years"], "count": len(areas), "sourceUrls": lookups["sourceUrls"], "notes": lookups["notes"]}
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    metadata_path = DATA_DIR / ".remote_metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["arrondissement_flows"] = {"years": lookups["years"], "sourceUrls": lookups["sourceUrls"], "updatedAt": datetime.now(timezone.utc).isoformat()}
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"Validated {len(rows)} cells in {len(areas)} arrondissements against provincial totals.")


if __name__ == "__main__":
    main()
