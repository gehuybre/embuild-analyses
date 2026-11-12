#!/usr/bin/env python3
"""Controleert dat alleen geanonimiseerde categorieën worden gepubliceerd."""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

XLSX_NAME = "sociaal-wonen-alle-gegevens.xlsx"
DATA = Path(__file__).resolve().parents[1] / "public/data"
EXPECTED = {
    "meta.json",
    "woonmaatschappijen.json",
    "gemeenten.json",
    "kt_aggregated.json",
    "lt_aggregated.json",
    "kt_verrichtingen.json",
    "lt_verrichtingen.json",
    "kt_municipalities.json",
    "lt_municipalities.json",
    "map.json",
    XLSX_NAME,
}
CATEGORIES = {
    "nieuwbouw": "Nieuwbouw",
    "vervangingsbouw": "Vervangingsbouw",
    "renovatie": "Renovatie",
    "ssi": "Sloop en Infrastructuur",
}
PLAATSINGEN = ["Reguliere procedure", "CBO", "D&B"]
FORBIDDEN_KEYS = {
    "projectomschrijving", "projectnaam", "woonproject", "verrichting", "identificatie",
    "datum_beslissing", "maximumprijs_vmsw", "bedrag_up", "procedure", "type",
    "huur", "kostprijs", "n", "aantal", "controletotalen",
}
XLSX_HEADERS = [
    "Planning", "Woonmaatschappij", "Provincie", "Gemeente", "Soort werken", "Plaatsingsprocedure",
    "Huurwoningen (categorie)", "Kostprijs (categorie)", "Website woonmaatschappij",
]
RECORD_KEYS = {
    "wm", "nis", "gemeente_label", "provincie", "categorie", "plaatsing",
    "huur_categorie", "kostprijs_categorie",
}
MUNICIPALITY_KEYS = {"nis", "naam", "huur_categorie", "kostprijs_categorie"}

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def walk_keys(obj, found: set[str]) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            found.add(key.lower())
            walk_keys(value, found)
    elif isinstance(obj, list):
        for value in obj:
            walk_keys(value, found)


def read_xlsx_sheet(path: Path, sheet: str) -> tuple[list[str], list[list]]:
    """Leest een werkblad zonder externe Excel-afhankelijkheid."""
    import re
    import xml.etree.ElementTree as ET

    ns = {
        "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        names = [s.get("name") for s in workbook.find("m:sheets", ns)]
        if sheet not in names:
            return names, []
        target = f"xl/worksheets/sheet{names.index(sheet) + 1}.xml"
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in item.iter(f"{{{ns['m']}}}t")))
        rows = []
        for row in ET.fromstring(archive.read(target)).find("m:sheetData", ns):
            cells: dict[int, object] = {}
            for cell in row:
                col = 0
                for char in re.match(r"[A-Z]+", cell.get("r")).group():
                    col = col * 26 + ord(char) - 64
                value = cell.find("m:v", ns)
                if cell.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in cell.iter(f"{{{ns['m']}}}t"))
                elif value is None or value.text is None:
                    continue
                elif cell.get("t") == "s":
                    val = shared[int(value.text)]
                elif cell.get("t") in ("str", "b", "e"):
                    val = value.text
                else:
                    val = float(value.text)
                cells[col - 1] = val
            width = max(cells) + 1 if cells else 0
            rows.append([cells.get(i) for i in range(width)])
    return names, rows


def check_xlsx() -> None:
    names, rows = read_xlsx_sheet(DATA / XLSX_NAME, "Gegevens")
    if names != ["Gegevens", "Toelichting"]:
        err(f"{XLSX_NAME}: verwacht alleen de bladen Gegevens en Toelichting")
        return
    headers = [str(h) for h in rows[0]]
    if headers != XLSX_HEADERS:
        err(f"{XLSX_NAME}: onverwachte of niet-geanonimiseerde kolommen")
        return
    for row in rows[1:]:
        if len(row) != len(XLSX_HEADERS) or any(not isinstance(value, str) for value in row):
            err(f"{XLSX_NAME}: verwachte uitsluitend categorische tekstwaarden")
            return
        if row[4] not in CATEGORIES.values():
            err(f"{XLSX_NAME}: onbekende werkcategorie")
            return
        if row[5] not in PLAATSINGEN:
            err(f"{XLSX_NAME}: onbekende plaatsingsprocedure")
            return
        if not row[6] or not row[7]:
            err(f"{XLSX_NAME}: woning- of kostprijscategorie ontbreekt")
            return


def main() -> int:
    if not DATA.exists():
        print("public/data ontbreekt; draai eerst scripts/process_data.py", file=sys.stderr)
        return 1
    files = {path.name for path in DATA.glob("*.json")} | ({XLSX_NAME} if (DATA / XLSX_NAME).exists() else set())
    for name in sorted(EXPECTED - files):
        err(f"ontbrekend bestand: {name}")
    for name in sorted(files - EXPECTED):
        err(f"onverwacht bestand in public/data: {name}")
    if errors:
        return report()

    check_xlsx()
    json_files = sorted(name for name in files if name.endswith(".json"))
    loaded = {name: json.loads((DATA / name).read_text(encoding="utf-8")) for name in json_files}
    meta = loaded["meta.json"]
    if meta.get("categories") != CATEGORIES:
        err("meta.categories bevat niet de vier afgesproken categorieën")
    if "controletotalen" in meta or "projectdetails_horizons" in meta:
        err("meta.json bevat niet-geanonimiseerde totalen of projectniveau-informatie")

    for name in json_files:
        found: set[str] = set()
        walk_keys(loaded[name], found)
        bad = found & FORBIDDEN_KEYS
        if bad:
            err(f"{name}: niet-geanonimiseerde velden {sorted(bad)}")

    municipality_nis = {g["nis"] for g in loaded["gemeenten.json"]}
    geometry_nis = {g["nis"] for g in loaded["map.json"]["gemeenten"]}
    if municipality_nis != geometry_nis:
        err("gemeenten.json en map.json verschillen")
    municipality_labels = set(meta.get("count_bands", []))
    cost_labels = set(meta.get("cost_bands", []))
    for horizon in ("kt", "lt"):
        row_files = [
            loaded[f"{horizon}_aggregated.json"],
            loaded[f"{horizon}_verrichtingen.json"],
        ]
        municipality_file = loaded[f"{horizon}_municipalities.json"]
        for row_file in row_files:
            for row in row_file["rijen"]:
                if set(row) != RECORD_KEYS:
                    err(f"{horizon}: planningrij bevat onverwachte of ontbrekende velden")
                if row.get("categorie") not in CATEGORIES:
                    err(f"{horizon}: onbekende werkcategorie")
                if row.get("plaatsing") not in PLAATSINGEN:
                    err(f"{horizon}: onbekende plaatsingsprocedure")
                if row.get("huur_categorie") not in municipality_labels:
                    err(f"{horizon}: onbekende woningenaantalcategorie")
                if row.get("kostprijs_categorie") not in cost_labels:
                    err(f"{horizon}: onbekende kostprijscategorie")
        for municipality in municipality_file["gemeenten"]:
            if set(municipality) != MUNICIPALITY_KEYS:
                err(f"{horizon}: kaartcategorie bevat onverwachte of ontbrekende velden")
            if municipality["nis"] not in geometry_nis:
                err(f"{horizon}: gemeente zonder kaartgeometrie")
            if municipality.get("huur_categorie") not in municipality_labels:
                err(f"{horizon}: onbekende woningenaantalcategorie in kaartgegevens")
            if municipality.get("kostprijs_categorie") not in cost_labels:
                err(f"{horizon}: onbekende kostprijscategorie in kaartgegevens")

    if errors:
        return report()
    print("validate_public_data: ok")
    return 0


def report() -> int:
    print("validate_public_data: FOUT")
    for error in errors:
        print(" -", error)
    return 1


if __name__ == "__main__":
    sys.exit(main())
