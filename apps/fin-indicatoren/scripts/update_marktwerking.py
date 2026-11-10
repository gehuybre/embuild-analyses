#!/usr/bin/env python3
"""Verwerk de horizontale screening van sectoren (FOD Economie) voor de fin-indicatoren blog.

Bron: 'Marktwerking in België: horizontale screening van marktsectoren', editie 2026 (referentiejaar 2024),
bijlage 'Indicatoren per sector' (.xlsx). FOD Economie publiceert dit jaarlijks zonder API. Jaarlijks bijwerken:
  1. download de nieuwe bijlage (.xlsx) van de publicatiepagina (zie PUBLICATION_URL)
  2. python scripts/update_marktwerking.py --source <pad-of-url-naar-bestand> --edition 2027 --publication-url <nieuwe-pagina>
Kolomkoppen worden herkend op tekst; een onbekende kop of werkblad stopt het script, zodat een gewijzigde
opbouw niet ongemerkt verkeerde cijfers oplevert.

Uitvoer:
  public/data/marktwerking.json            compacte dataset voor de blog
  public/data/marktwerking/*.csv           lange/brede tabellen
  public/data/marktwerking-data.xlsx       Excel-werkboek
  downloads/marktwerking/*.csv             ruwe werkbladen (cel per cel) voor manuele controle
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

DATA_DIR = APP_ROOT / "data" / "marktwerking"
PUBLIC_DATA_DIR = APP_ROOT / "public" / "data"
CSV_DIR = PUBLIC_DATA_DIR / "marktwerking"
JSON_PATH = PUBLIC_DATA_DIR / "marktwerking.json"
XLSX_PATH = PUBLIC_DATA_DIR / "marktwerking-data.xlsx"
DEFAULT_SOURCE = DATA_DIR / "marktwerking-belgie-horizontale-screening-sectoren-indicatoren-2026.xlsx"
DEFAULT_EDITION = 2026
PUBLICATION_URL = "https://economie.fgov.be/nl/publicaties/marktwerking-belgie-6"
SOURCE_FILES = [
    ("Bijlage Indicatoren per sector (xlsx)", "https://economie.fgov.be/nl/file/7474008/download?token=-Ibhn2wg"),
    ("Methodologie (pdf)", "https://economie.fgov.be/nl/file/7474003/download?token=cUnSyJ3F"),
    ("Resultaten (pdf)", "https://economie.fgov.be/nl/file/7474004/download?token=cawyzZgQ"),
]

# Indicatoren van de samengestelde indicator, omschreven volgens het methodologisch rapport 2026.
# riskWhen: bij welke waarde van de indicator het risico op marktverstoring hoger is (rang 1 = hoogste risico).
# verify_data.py controleert dit tegen de bronrangen.
RISK_WHEN = {"SI": "hoog", "AB": "laag", "HHI": "hoog", "IMP": "laag", "NM": "hoog", "VOL": "laag", "STAB": "hoog"}
INDICATORS = [
    ("SI", "Samengestelde indicator",
     "Eenvoudig gemiddelde van de genormaliseerde individuele indicatoren (min-max, 0 tot 1). Een waarde dicht bij 1 wijst op een hoger risico op marktverstoring."),
    ("AB", "Aantal ondernemingen",
     "Aantal Belgische ondernemingen actief op de binnenlandse markt. Weinig ondernemingen geeft een groter risico op collusie."),
    ("HHI", "Concentratie (HHI)",
     "Herfindahl-Hirschman-index: som van de kwadraten van de marktaandelen. Een hoge waarde wijst op een kleiner aantal spelers of een ongelijke verdeling; bij een monopolie is de HHI 1."),
    ("IMP", "Importpenetratie",
     "Enkel voor industrie: ingevoerde producten van de sector ten opzichte van het zichtbare verbruik in België. Een hoge waarde betekent meer buitenlandse concurrentie."),
    ("NM", "Nettomarge",
     "Bedrijfsresultaat (rubriek 9901) gedeeld door de omzet. Een hoge marge over meerdere jaren kan wijzen op een marktverstoring."),
    ("VOL", "Volatiliteit van marktaandelen",
     "Marktaandeel dat verschuift van bedrijven in verval naar bedrijven in ontwikkeling. Een lage waarde wijst op een erg stabiele verdeling, wat kan wijzen op concurrentieproblemen of toegangsbarrières."),
    ("STAB", "Stabiliteitsgraad",
     "Actieve ondernemingen in de laatste drie jaar ten opzichte van het huidige jaar. Hoe hoger, hoe minder significante toetredingen."),
]
HEADER_TO_CODE = {
    "SI Gewoon gemidd.": "SI", "Aant. bedr.": "AB", "HHI": "HHI", "Importpenetratie": "IMP",
    "Nettomarge": "NM", "Volatiliteit": "VOL", "Stabiliteit": "STAB",
}
MEASURES = [
    ("NET_GLOB", "Netto marge (geglobaliseerd)", "%"),
    ("NET_MED", "Netto marge (mediaan)", "%"),
    ("LOSS", "Aandeel bedrijven met exploitatieverlies", "%"),
    ("HHI", "Concentratie (HHI)", "index"),
]
MEASURE_HEADERS = {
    "Netto marge (geglobaliseerd)": "NET_GLOB",
    "Netto marge (mediaan)": "NET_MED",
    "Aandeel van bedrijven met een exploitatieverlies (rub. 9901)": "LOSS",
}
BOUW_PREFIXES = ("41", "42", "43")
MATERIAL_PREFIX = "23"  # NACE 23: vervaardiging van andere niet-metaalhoudende minerale producten (cement, beton, glas, ...)
GROUP_BOUW, GROUP_MATERIAL = "Bouw", "Bouwmaterialen (industrie)"


def resolve_source(source: str | None) -> Path:
    if not source:
        return DEFAULT_SOURCE
    if source.startswith(("http://", "https://")):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        target = DATA_DIR / "download.xlsx"
        request = urllib.request.Request(source, headers={"User-Agent": "embuild-data-blog/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        return target
    return Path(source)


def clean_text(value) -> str:
    """Herstelt het stuurteken \\x1a dat in oudere edities voor 'ë' of '²' stond."""
    return str(value).strip().replace("m\x1a", "m²").replace("\x1a", "ë")


def nace_code(value) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def number(value):
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return str(value).strip()


def parse_screening(book: pd.ExcelFile) -> tuple[list[dict], dict[str, int]]:
    rows: list[dict] = []
    turnover_years: dict[str, int] = {}
    for sheet, group, prefixes in (
        ("SI_Diensten", GROUP_BOUW, BOUW_PREFIXES),
        ("SI_industrieën", GROUP_MATERIAL, (MATERIAL_PREFIX,)),
    ):
        raw = book.parse(sheet, header=None)
        top, sub = raw.iloc[2], raw.iloc[3]
        turnover_col = next(c for c in range(raw.shape[1]) if "Binnenlandse omzet" in str(top[c]))
        turnover_years[group] = int(re.search(r"(\d{4})", str(top[turnover_col])).group(1))
        value_start = next(c for c in range(raw.shape[1]) if "Waarden indicatoren" in str(top[c]))
        rank_start = next(c for c in range(raw.shape[1]) if "Rankschikking" in str(top[c]))
        total = int(re.search(r"van (\d+)", str(top[rank_start])).group(1))

        def columns(start: int, stop: int) -> dict[str, int]:
            found = {}
            for c in range(start, stop):
                header = str(sub[c])
                if header not in HEADER_TO_CODE:
                    raise SystemExit(f"Onbekende indicatorkop '{header}' in werkblad {sheet}: opbouw van de bijlage is gewijzigd")
                found[HEADER_TO_CODE[header]] = c
            return found

        value_cols = columns(value_start, rank_start)
        rank_cols = columns(rank_start, raw.shape[1])
        for _, row in raw.iloc[4:].iterrows():
            code = nace_code(row[0])
            if code in ("nan", "") or not code.startswith(prefixes):
                continue
            values = {k: number(row[c]) for k, c in value_cols.items()}
            ranks = {k: number(row[c]) for k, c in rank_cols.items()}
            rows.append({
                "nace": code,
                "label": clean_text(row[1]),
                "group": group,
                "turnover": number(row[turnover_col]),
                "firms": values.get("AB"),
                "rankOf": total,
                "ranks": {k: v for k, v in ranks.items() if v is not None},
                "values": {k: v for k, v in values.items() if v is not None},
            })
    return rows, turnover_years


def parse_evolution(book: pd.ExcelFile) -> tuple[list[int], list[dict], dict[str, dict[str, list]], pd.DataFrame]:
    series: dict[str, dict] = {}
    values: dict[str, dict[str, list]] = {code: {} for code, *_ in MEASURES}
    long_rows: list[dict] = []
    years: list[int] | None = None
    units = {code: unit for code, _l, unit in MEASURES}
    labels = {code: label for code, label, _u in MEASURES}

    def add(key, nace, label, group, measure, data):
        series.setdefault(key, {"key": key, "nace": nace, "label": label, "group": group, "firms": None, "turnover": None})
        values[measure][key] = data
        for year, value in zip(years, data):
            if value is not None:
                long_rows.append({"Groep": group, "NACE-code": nace, "Omschrijving": label, "Maat": labels[measure],
                                  "Eenheid": units[measure], "Jaar": year, "Waarde": value})

    for sheet, prefix, scope, keep in (
        ("NettoMarge_Diensten-NACE-2", "d2", "Diensten (NACE 2)", None),
        ("NettoMarge_Diensten-NACE-5", "d5", "Diensten (NACE 4/5)", None),
        ("NettoMarge_Industrieën-NACE-2", "i2", "Industrie (NACE 2)", None),
        ("NettoMarge_Industrieën-NACE-5", "i5", "Bouwmaterialen (NACE 4/5)", (MATERIAL_PREFIX,)),
    ):
        raw = book.parse(sheet, header=None)
        top, sub = raw.iloc[2], raw.iloc[3]
        blocks = {}
        for c in range(2, raw.shape[1]):
            if str(top[c]) != "nan":
                if str(top[c]) not in MEASURE_HEADERS:
                    raise SystemExit(f"Onbekende maat '{top[c]}' in werkblad {sheet}")
                blocks[MEASURE_HEADERS[str(top[c])]] = c
        sheet_years = [int(float(sub[blocks["NET_GLOB"] + i])) for i in range(11)]
        years = years or sheet_years
        if sheet_years != years:
            raise SystemExit(f"Jaren in {sheet} wijken af: {sheet_years}")
        for _, row in raw.iloc[4:].iterrows():
            code = nace_code(row[0])
            if code in ("nan", ""):
                continue
            if keep and not code.startswith(keep):
                continue
            group = scope
            if prefix in ("d2", "d5") and code.startswith(BOUW_PREFIXES):
                group = "Bouw (NACE 2)" if prefix == "d2" else "Bouw (NACE 4/5)"
            for measure, start in blocks.items():
                data = [number(row[start + i]) for i in range(len(years))]
                data = [round(v * 100, 3) if isinstance(v, float) else None for v in data]
                add(f"{prefix}_{code}", code, clean_text(row[1]), group, measure, data)

    for sheet, prefix, keep in (("HHI_Diensten", "d5", None), ("HHI_Industrieën", "i5", (MATERIAL_PREFIX,))):
        raw = book.parse(sheet, header=None)
        sub = raw.iloc[3]
        hhi_years = [int(float(sub[2 + i])) for i in range(raw.shape[1] - 2)]
        if hhi_years != years:
            raise SystemExit(f"Jaren in {sheet} wijken af: {hhi_years}")
        for _, row in raw.iloc[4:].iterrows():
            code = nace_code(row[0])
            if code in ("nan", "") or (keep and not code.startswith(keep)):
                continue
            key = f"{prefix}_{code}"
            data = [round(v, 5) if isinstance(v, float) else None for v in (number(row[2 + i]) for i in range(len(years)))]
            if key not in series:
                group = ("Bouw (NACE 4/5)" if code.startswith(BOUW_PREFIXES) else "Diensten (NACE 4/5)") if prefix == "d5" else "Bouwmaterialen (NACE 4/5)"
                add(key, code, clean_text(row[1]), group, "HHI", data)
            else:
                add(key, code, series[key]["label"], series[key]["group"], "HHI", data)
    return years, list(series.values()), values, pd.DataFrame(long_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", help="pad of URL naar het .xlsx-bestand (standaard: bewaarde editie)")
    parser.add_argument("--edition", type=int, default=DEFAULT_EDITION)
    parser.add_argument("--publication-url", default=PUBLICATION_URL)
    parser.add_argument("--no-excel", action="store_true")
    args = parser.parse_args()

    from scripts.raw_export import export_xls_sheets

    source = resolve_source(args.source)
    book = pd.ExcelFile(source)
    raw_dir = APP_ROOT / "downloads" / "marktwerking"
    shutil.rmtree(raw_dir, ignore_errors=True)  # geen resten van vorige edities
    export_xls_sheets(source, raw_dir)
    screening, turnover_years = parse_screening(book)
    years, series, values, margins_long = parse_evolution(book)

    payload = {
        "edition": args.edition,
        "sourceUrl": args.publication_url,
        "sourceFiles": [{"label": label, "url": url} for label, url in SOURCE_FILES] if args.edition == DEFAULT_EDITION else [],
        "sourceFile": source.name,
        "marginYears": years,
        "turnoverYear": {"screening": turnover_years[GROUP_BOUW]},
        "indicators": [{"code": c, "label": l, "description": d, "riskWhen": RISK_WHEN[c]} for c, l, d in INDICATORS],
        "screening": screening,
        "margins": {
            "measures": [{"code": c, "label": l, "unit": u} for c, l, u in MEASURES],
            "series": series,
            "values": values,
        },
    }
    def sector_count(sheet: str) -> int:
        frame = book.parse(sheet, header=None).iloc[4:]
        return int(sum(1 for v in frame[0] if nace_code(v) not in ("nan", "")))

    groups = {}
    for item in series:
        groups[item["group"]] = groups.get(item["group"], 0) + 1
    hhi_keys = list(values["HHI"])
    count = lambda name: sum(1 for r in screening if r["group"] == name)  # noqa: E731
    payload["sheetInfo"] = [
        {"sheet": "SI_Diensten", "use": "Screening: dienstensectoren van de bouw (NACE 41, 42, 43)", "used": count(GROUP_BOUW), "total": sector_count("SI_Diensten")},
        {"sheet": "SI_industrieën", "use": "Screening: bouwmaterialen (NACE 23)", "used": count(GROUP_MATERIAL), "total": sector_count("SI_industrieën")},
        {"sheet": "HHI_Diensten", "use": "Evolutie van de concentratie (HHI), alle diensten op 4/5 cijfers", "used": sum(1 for k in hhi_keys if k.startswith("d5_")), "total": sector_count("HHI_Diensten")},
        {"sheet": "HHI_Industrieën", "use": "Evolutie van de concentratie (HHI), bouwmaterialen (NACE 23)", "used": sum(1 for k in hhi_keys if k.startswith("i5_")), "total": sector_count("HHI_Industrieën")},
        {"sheet": "NettoMarge_Diensten-NACE-2", "use": "Evolutie van de marges: diensten op 2 cijfers, inclusief bouw (41, 42, 43)", "used": sum(1 for k in series if k["key"].startswith("d2_")), "total": sector_count("NettoMarge_Diensten-NACE-2")},
        {"sheet": "NettoMarge_Diensten-NACE-5", "use": "Evolutie van de marges: diensten op 4/5 cijfers, inclusief alle bouwsubsectoren", "used": sum(1 for k in series if k["key"].startswith("d5_")), "total": sector_count("NettoMarge_Diensten-NACE-5")},
        {"sheet": "NettoMarge_Industrieën-NACE-2", "use": "Evolutie van de marges: industrie op 2 cijfers", "used": sum(1 for k in series if k["key"].startswith("i2_")), "total": sector_count("NettoMarge_Industrieën-NACE-2")},
        {"sheet": "NettoMarge_Industrieën-NACE-5", "use": "Evolutie van de marges: bouwmaterialen (NACE 23)", "used": sum(1 for k in series if k["key"].startswith("i5_")), "total": sector_count("NettoMarge_Industrieën-NACE-5")},
    ]
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(CSV_DIR, ignore_errors=True)
    CSV_DIR.mkdir(parents=True, exist_ok=True)

    wide = []
    year = turnover_years[GROUP_BOUW]
    for row in screening:
        entry = {"NACE-code": row["nace"], "Omschrijving": row["label"], "Groep": row["group"],
                 f"Binnenlandse omzet {year} (mln euro)": row["turnover"], "Rangschikking uit": row["rankOf"]}
        for code, label, _d in INDICATORS:
            entry[f"Rang {label}"] = row["ranks"].get(code)
        for code, label, _d in INDICATORS:
            entry[f"Waarde {label}"] = row["values"].get(code)
        wide.append(entry)
    screening_df = pd.DataFrame(wide)
    screening_df.to_csv(CSV_DIR / "marktwerking_screening_bouw.csv", index=False)
    margins_long.to_csv(CSV_DIR / "marktwerking_evolutie.csv", index=False)

    if args.no_excel and JSON_PATH.exists():
        previous = json.loads(JSON_PATH.read_text(encoding="utf-8")).get("excelDownload")
        if previous:
            payload["excelDownload"] = previous  # de downloadknop mag nooit verdwijnen
    if not args.no_excel:
        from scripts.excel_common import build_workbook

        payload["excelDownload"] = {
            "href": "data/marktwerking-data.xlsx",
            "filename": build_workbook(
                organisation="Embuild Vlaanderen",
                title="Marktwerking en marges in de bouw",
                source=f"FOD Economie - Marktwerking in België: horizontale screening van marktsectoren ({args.edition})",
                sheets=[
                    ("Screening bouw", screening_df, "tblScreening",
                     "Bouwsubsectoren (NACE 4 en 5 cijfers) en bouwmaterialen: rang en waarde per indicator."),
                    ("Evolutie", margins_long, "tblEvolutie",
                     "Netto marges en concentratie (HHI) per sector, 2014 t.e.m. 2024."),
                ],
                notes=[
                    "Rang 1 is de sector met het hoogste risico op marktverstoring volgens die indicator (methodologisch rapport 2026). De rang is op 354 dienstensectoren en 190 industriële sectoren (kolom Rangschikking uit).",
                    "De samengestelde indicator is het eenvoudig gemiddelde van de genormaliseerde indicatoren (0 tot 1); dicht bij 1 betekent een hoger risico. Importpenetratie bestaat enkel voor industriële sectoren.",
                    "Bouwmaterialen zijn de industriële sectoren van NACE 23 (cement, beton, glas, keramiek, ...). Bouw zijn de dienstensectoren van NACE 41, 42 en 43.",
                    "Marges zijn omgerekend van fractie naar procent. Geglobaliseerd = totaal over alle bedrijven; mediaan = typisch bedrijf. HHI is een index tussen 0 en 1.",
                    "Voor de definitie van de indicatoren: zie het methodologisch rapport op de publicatiepagina van FOD Economie.",
                ],
                xlsx_path=XLSX_PATH,
                download_suffix="Marktwerking bouw",
            ),
        }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    from scripts.availability import refresh_availability_label

    refresh_availability_label()
    print(f"Marktwerking {args.edition}: {len(screening)} sectoren in de screening, {len(series)} reeksen voor de evolutie.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
