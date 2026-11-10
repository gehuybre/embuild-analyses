"""Zet ruwe brondata om naar CSV in downloads/, zodat de cijfers manueel gecontroleerd kunnen worden.

De CSV's bevatten de bron zoals ontvangen: geen hernoemde codes, geen omrekeningen, geen filtering.
"""

from __future__ import annotations

import csv
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def sdmx_data_to_csv(xml_path: Path, csv_path: Path) -> int:
    """NBB SDMX-GenericData: één rij per waarneming met alle dimensies, de waarde en de attributen."""
    rows: list[dict[str, str]] = []
    for _event, elem in ET.iterparse(xml_path, events=("end",)):
        if _local(elem.tag) != "Obs":
            continue
        row: dict[str, str] = {}
        for child in elem.iter():
            name = _local(child.tag)
            if name == "Value":
                row[child.attrib.get("id", "")] = child.attrib.get("value", "")
            elif name == "ObsValue":
                row["OBS_VALUE"] = child.attrib.get("value", "")
        rows.append(row)
        elem.clear()
    columns = list(dict.fromkeys(key for row in rows for key in row))
    position = {c: i for i, c in enumerate(columns)}
    columns.sort(key=lambda c: (c != "TIME_PERIOD", c == "OBS_VALUE", position[c]))
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def sdmx_codelist_to_csv(xml_path: Path, csv_path: Path) -> int:
    """SDMX-codelijst: code plus alle namen per taal."""
    rows = []
    for _event, elem in ET.iterparse(xml_path, events=("end",)):
        if _local(elem.tag) != "Code":
            continue
        row = {"code": elem.attrib.get("id", "")}
        for child in elem:
            if _local(child.tag) == "Name":
                lang = child.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", "")
                row[f"naam_{lang}"] = child.text or ""
        rows.append(row)
        elem.clear()
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    return len(rows)


def export_nbb_downloads(downloads_dir: Path) -> None:
    for folder in sorted(p for p in downloads_dir.iterdir() if p.is_dir() and p.name.startswith("cbratiose")):
        data_xml = folder / "data.xml"
        if data_xml.exists():
            count = sdmx_data_to_csv(data_xml, folder / "data.csv")
            print(f"Ruwe NBB-data: {folder.name}/data.csv ({count} waarnemingen)")
        for codelist in sorted(folder.glob("CL_*.xml")):
            sdmx_codelist_to_csv(codelist, codelist.with_suffix(".csv"))


def export_xls_sheets(xls_path: Path, out_dir: Path) -> None:
    """Elk werkblad van het Excel-bronbestand als CSV, cel per cel zoals in het origineel (ook kopregels)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    book = pd.ExcelFile(xls_path)
    for index, sheet in enumerate(book.sheet_names):
        safe = "".join(c if c.isalnum() else "_" for c in sheet).strip("_")
        book.parse(sheet, header=None).to_csv(out_dir / f"{index:02d}_{safe}.csv", index=False, header=False)
