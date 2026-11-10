#!/usr/bin/env python3
"""Haal Eurostat Structural Business Statistics (SBS) op voor de fin-indicatoren blog.

Bron: Eurostat dissemination API (JSON-stat 2.0), zie
https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started

Eurostat publiceert SBS in twee reeksen die niet naadloos aansluiten:
  * 2005-2020  (SBS-verordening):  sbs_na_con_r2, sbs_na_sca_r2, sbs_r_nuts06_r2
  * 2021 e.v.  (EBS-verordening):  sbs_ovw_act, sbs_r_nuts2021
Dit script voegt beide samen op gemeenschappelijke indicatoren en markeert per waarneming
de bronreeks (kolom 'reeks'), zodat de reeksbreuk zichtbaar blijft.

Onderhoud: per dataset wordt de 'updated'-timestamp van Eurostat bewaard in
data/.eurostat_metadata.json. Zonder wijziging bij Eurostat wordt niets opnieuw opgehaald
(tenzij --force). Uitvoer:
  public/data/eurostat/*.csv          lange tabellen (ook voor Excel)
  public/data/eurostat-sbs.json       compacte dataset voor de interactieve blog
  public/data/eurostat-sbs-data.xlsx  Excel-werkboek (via build_eurostat_excel.py)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
TOC_URL = "https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started"
PUBLIC_DATA_DIR = APP_ROOT / "public" / "data"
CSV_DIR = PUBLIC_DATA_DIR / "eurostat"
RAW_DIR = APP_ROOT / "downloads" / "eurostat"
JSON_PATH = PUBLIC_DATA_DIR / "eurostat-sbs.json"
META_PATH = APP_ROOT / "data" / ".eurostat_metadata.json"
USER_AGENT = "embuild-data-blog/1.0"

OLD, NEW = "SBS 2005-2020", "EBS 2021 e.v."

# Gemeenschappelijke indicatoren: (code, label, eenheid, soort, oude code, nieuwe code, schaal)
# 'soort' stuurt de opmaak: count | meur | teur | pct. 'schaal' zet de oude waarde om naar de nieuwe eenheid.
INDICATORS = [
    ("ENT", "Ondernemingen", "aantal", "count", "V11110", "ENT_NR", 1),
    ("EMP", "Tewerkgestelde personen", "aantal", "count", "V16110", "EMP_NR", 1),
    ("SAL", "Werknemers", "aantal", "count", "V16130", "SAL_NR", 1),
    ("EMP_ENT", "Tewerkgestelde personen per onderneming", "aantal", "decimal", "V92100", "EMP_ENT_NR", 1),
    ("TURN", "Omzet", "mln euro", "meur", "V12110", "NETTUR_MEUR", 1),
    ("PROD", "Productiewaarde", "mln euro", "meur", "V12120", "VAL_OUT_MEUR", 1),
    ("VA", "Toegevoegde waarde", "mln euro", "meur", "V12150", "AV_MEUR", 1),
    ("GOS", "Brutobedrijfsoverschot", "mln euro", "meur", "V12170", "GOS_MEUR", 1),
    ("PERS", "Personeelskosten", "mln euro", "meur", "V13310", "EXPN_SAL_BEN_MEUR", 1),
    ("WAGE", "Lonen en wedden", "mln euro", "meur", "V13320", "WAGE_MEUR", 1),
    ("INV", "Bruto-investeringen in materiële vaste activa", "mln euro", "meur", "V15110", "GRSINV_TNCA_MEUR", 1),
    ("LABPROD", "Arbeidsproductiviteit (toegevoegde waarde per persoon)", "duizend euro", "teur", "V91110", "LABPRY_TEUR", 1),
    ("PERS_SAL", "Gemiddelde personeelskost per werknemer", "duizend euro", "teur", "V91210", "AVG_EXPN_SAL_BEN_TEUR", 1),
    ("GOR", "Bruto-exploitatiemarge (bedrijfsoverschot / omzet)", "%", "pct", "V92110", "GOR_PC", 1),
    ("INV_RATE", "Investeringsratio (investeringen / toegevoegde waarde)", "%", "pct", "V94415", "GRSINV_TNCA_AV_PC", 1),
]
INDICATOR_BY_CODE = {item[0]: item for item in INDICATORS}

# Regionale indicatoren (lokale eenheden, niet ondernemingen!)
REGIONAL_INDICATORS = [
    ("LOC", "Vestigingen (lokale eenheden)", "aantal", "count", "V11210", "LOC_NR", 1),
    ("EMP_LOC", "Tewerkgestelde personen in vestigingen", "aantal", "count", "V16110", "EMP_LOC_NR", 1),
    ("WAGE_LOC", "Lonen en wedden in vestigingen", "mln euro", "meur", "V13320", "WAGE_LOC_MEUR", 1),
]

# Nederlandstalige namen voor bouw (NACE-BEL 2008) en secties. Onbekende codes vallen terug op de Engelse naam.
NACE_NL = {
    "F": "Bouwnijverheid (totaal)",
    "F41": "Algemene bouw van gebouwen",
    "F411": "Ontwikkeling van bouwprojecten",
    "F4110": "Ontwikkeling van bouwprojecten",
    "F412": "Bouw van woningen en niet-residentiële gebouwen",
    "F4120": "Bouw van woningen en niet-residentiële gebouwen",
    "F42": "Weg- en waterbouw",
    "F421": "Bouw van wegen en spoorwegen",
    "F4211": "Bouw van wegen en autosnelwegen",
    "F4212": "Bouw van spoorwegen en metro",
    "F4213": "Bouw van bruggen en tunnels",
    "F422": "Bouw van leidingen en nutsvoorzieningen",
    "F4221": "Bouw van leidingen voor vloeistoffen en gassen",
    "F4222": "Bouw van elektriciteits- en telecommunicatienetten",
    "F429": "Overige weg- en waterbouw",
    "F4291": "Waterbouw",
    "F4299": "Overige weg- en waterbouw (n.e.g.)",
    "F43": "Gespecialiseerde bouwactiviteiten",
    "F431": "Slopen en grondverzet",
    "F4311": "Slopen",
    "F4312": "Grondverzet en terreinvoorbereiding",
    "F4313": "Proefboringen",
    "F432": "Elektrische installaties, loodgieterswerk en andere installaties",
    "F4321": "Elektrische installatie",
    "F4322": "Loodgieterswerk, verwarming en airconditioning",
    "F4329": "Overige bouwinstallatie",
    "F433": "Afwerking van gebouwen",
    "F4331": "Pleisterwerk",
    "F4332": "Schrijnwerk (plaatsen)",
    "F4333": "Vloer- en wandbekleding",
    "F4334": "Schilderen en glaszetten",
    "F4339": "Overige afwerking van gebouwen",
    "F439": "Overige gespecialiseerde bouwactiviteiten",
    "F4391": "Dakbedekking",
    "F4399": "Overige gespecialiseerde bouwactiviteiten (n.e.g.)",
    "B": "Winning van delfstoffen",
    "C": "Industrie",
    "D": "Energievoorziening",
    "E": "Waterbedeling en afvalbeheer",
    "G": "Groot- en kleinhandel",
    "H": "Vervoer en opslag",
    "I": "Logies en eetgelegenheden",
    "J": "Informatie en communicatie",
    "L": "Verhuur en exploitatie van vastgoed",
    "M": "Vrije beroepen en wetenschap",
    "N": "Administratieve en ondersteunende diensten",
    "P": "Onderwijs",
    "Q": "Gezondheidszorg en sociale hulp",
    "R": "Kunst, amusement en recreatie",
    "ECON": "Marktgerichte economie (totaal)",
}
SECTION_CODES = ["B", "C", "D", "E", "G", "H", "I", "J", "L", "M", "N", "P", "Q", "R"]
# Totaal van de marktgerichte economie: andere afbakening vóór en vanaf 2021 (zie 'reeks').
ECON_OLD, ECON_NEW = "B-N_S95_X_K", "B-S_X_O_S94"

# NUTS-regio's: gewesten (NUTS1) en provincies (NUTS2). Brussel heet BE10 in NUTS2 en BE1 in NUTS1.
GEO_LABELS = {
    "BE": ("België", "land"),
    "BE1": ("Brussels Hoofdstedelijk Gewest", "gewest"),
    "BE2": ("Vlaams Gewest", "gewest"),
    "BE3": ("Waals Gewest", "gewest"),
    "BE21": ("Antwerpen", "provincie"),
    "BE22": ("Limburg", "provincie"),
    "BE23": ("Oost-Vlaanderen", "provincie"),
    "BE24": ("Vlaams-Brabant", "provincie"),
    "BE25": ("West-Vlaanderen", "provincie"),
    "BE31": ("Waals-Brabant", "provincie"),
    "BE32": ("Henegouwen", "provincie"),
    "BE33": ("Luik", "provincie"),
    "BE34": ("Luxemburg", "provincie"),
    "BE35": ("Namen", "provincie"),
}
REGIONAL_NACE = ["F", "F41", "F42", "F43"] + SECTION_CODES


def level_of(code: str) -> int:
    """Niveau in de bouw: 1 = F, 2 = F41, 3 = F411, 4 = F4110."""
    return len(code) - 1 if code.startswith("F") else 0


def fetch(dataset: str, params: list[tuple[str, str]], retries: int = 4) -> dict:
    query = urllib.parse.urlencode([("format", "JSON"), ("lang", "EN"), *params])
    request = urllib.request.Request(f"{API}/{dataset}?{query}", headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code in (400, 404):
                raise
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("onbereikbaar")


def parse_jsonstat(payload: dict) -> pd.DataFrame:
    """Zet een JSON-stat 2.0 antwoord om naar een lange tabel (één rij per waarneming)."""
    dims = payload["id"]
    sizes = payload["size"]
    index_lists = []
    for dim in dims:
        index = payload["dimension"][dim]["category"]["index"]
        if isinstance(index, dict):
            index = [k for k, _ in sorted(index.items(), key=lambda kv: kv[1])]
        index_lists.append(index)
    rows = []
    values = payload.get("value", {})
    status = payload.get("status", {})
    if isinstance(values, list):
        values = {str(i): v for i, v in enumerate(values) if v is not None}
    for flat_str, value in values.items():
        flat = int(flat_str)
        coords = []
        for size, labels in zip(reversed(sizes), reversed(index_lists)):
            coords.append(labels[flat % size])
            flat //= size
        row = dict(zip(dims, reversed(coords)))
        row["value"] = value
        row["flag"] = status.get(flat_str, "")
        rows.append(row)
    frame = pd.DataFrame(rows, columns=[*dims, "value", "flag"])
    for dim in dims:
        if dim in ("time", "freq"):
            continue
        labels = payload["dimension"][dim]["category"].get("label", {})
        frame[f"{dim}_label"] = frame[dim].map(labels)
    return frame


def dataset_updated(dataset: str) -> str:
    """Eurostat 'updated'-timestamp via een minimale aanvraag."""
    probe = fetch(dataset, [("geo", "BE"), ("time", "2020")] if dataset in ("sbs_na_con_r2", "sbs_na_sca_r2", "sbs_r_nuts06_r2") else [("geo", "BE"), ("time", "2024")])
    return str(probe.get("updated", ""))


RAW_FRAMES: dict[str, list[pd.DataFrame]] = {}


def keep_raw(dataset: str, frames: list[pd.DataFrame]) -> None:
    RAW_FRAMES.setdefault(dataset, []).extend(frames)


def write_raw() -> None:
    """Bewaar de API-antwoorden ongewijzigd (Eurostat-codes, labels en vlaggen) per dataset."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for dataset, frames in RAW_FRAMES.items():
        raw = pd.concat(frames, ignore_index=True).drop_duplicates()
        order = [c for c in raw.columns if c not in ("value", "flag")]
        raw.sort_values(order).to_csv(RAW_DIR / f"{dataset}.csv", index=False)


def national_frame(dataset: str, regime: str, nace: list[str], indicator_col: str, mapping: dict[str, str]) -> pd.DataFrame:
    frames = []
    for chunk_start in range(0, len(mapping), 5):
        codes = list(mapping)[chunk_start:chunk_start + 5]
        params = [("geo", "BE"), *[("nace_r2", n) for n in nace], *[(indicator_col, c) for c in codes]]
        frame = parse_jsonstat(fetch(dataset, params))
        frames.append(frame)
    keep_raw(dataset, frames)
    out = pd.concat(frames, ignore_index=True)
    out = out.rename(columns={indicator_col: "src_code", "nace_r2": "nace"})
    out["indicator"] = out["src_code"].map(mapping)
    out["reeks"] = regime
    out["year"] = out["time"].astype(int)
    return out[["nace", "indicator", "year", "value", "flag", "reeks"]]


def nace_codes_in_bouw(dataset: str, geo_probe_year: str, indicator: str, indicator_col: str) -> list[str]:
    payload = fetch(dataset, [("geo", "BE"), ("time", geo_probe_year), (indicator_col, indicator)])
    return [code for code in payload["dimension"]["nace_r2"]["category"]["index"] if code.startswith("F")]


def collect_national() -> tuple[pd.DataFrame, pd.DataFrame]:
    old_map = {i[4]: i[0] for i in INDICATORS}
    new_map = {i[5]: i[0] for i in INDICATORS}

    old_bouw_codes = nace_codes_in_bouw("sbs_na_con_r2", "2019", "V11110", "indic_sb")
    new_bouw_codes = nace_codes_in_bouw("sbs_ovw_act", "2023", "ENT_NR", "indic_sbs")
    bouw_codes = sorted(set(old_bouw_codes) | set(new_bouw_codes))

    bouw_old = national_frame("sbs_na_con_r2", OLD, old_bouw_codes, "indic_sb", old_map)
    bouw_new = national_frame("sbs_ovw_act", NEW, new_bouw_codes, "indic_sbs", new_map)
    bouw = pd.concat([bouw_old, bouw_new], ignore_index=True)

    sector_old_codes = ["F", *SECTION_CODES, ECON_OLD]
    sector_new_codes = ["F", *SECTION_CODES, ECON_NEW]
    sec_old = national_frame("sbs_na_sca_r2", OLD, sector_old_codes, "indic_sb", old_map)
    sec_new = national_frame("sbs_ovw_act", NEW, sector_new_codes, "indic_sbs", new_map)
    sectors = pd.concat([sec_old, sec_new], ignore_index=True)
    sectors["nace"] = sectors["nace"].replace({ECON_OLD: "ECON", ECON_NEW: "ECON"})

    bouw = bouw[bouw["nace"].isin(bouw_codes)]
    return bouw, sectors


def regional_frame(dataset: str, regime: str, indicator_col: str, mapping: dict[str, str]) -> pd.DataFrame:
    frames = []
    geos = [g for g in GEO_LABELS if g != "BE1"] + ["BE1", "BE10"]
    for code in mapping:
        params = [*[("geo", g) for g in geos], *[("nace_r2", n) for n in REGIONAL_NACE], (indicator_col, code)]
        frames.append(parse_jsonstat(fetch(dataset, params)))
    keep_raw(dataset, frames)
    out = pd.concat(frames, ignore_index=True)
    out = out.rename(columns={indicator_col: "src_code", "nace_r2": "nace"})
    out["geo"] = out["geo"].replace({"BE10": "BE1"})
    out = out.drop_duplicates(subset=["geo", "nace", "src_code", "time"])
    out["indicator"] = out["src_code"].map(mapping)
    out["reeks"] = regime
    out["year"] = out["time"].astype(int)
    return out[["geo", "nace", "indicator", "year", "value", "flag", "reeks"]]


def collect_regional() -> pd.DataFrame:
    old_map = {i[4]: i[0] for i in REGIONAL_INDICATORS}
    new_map = {i[5]: i[0] for i in REGIONAL_INDICATORS}
    return pd.concat(
        [
            regional_frame("sbs_r_nuts06_r2", OLD, "indic_sb", old_map),
            regional_frame("sbs_r_nuts2021", NEW, "indic_sbs", new_map),
        ],
        ignore_index=True,
    )


def label_for(code: str) -> str:
    return NACE_NL.get(code, code)


def finalize(frame: pd.DataFrame, indicators: list[tuple]) -> pd.DataFrame:
    frame = frame.copy()
    frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
    frame = frame.dropna(subset=["value"])
    frame["nace_label"] = frame["nace"].map(label_for)
    lookup = {i[0]: i for i in indicators}
    frame["indicator_label"] = frame["indicator"].map(lambda c: lookup[c][1])
    frame["unit"] = frame["indicator"].map(lambda c: lookup[c][2])
    sort_cols = [c for c in ("geo", "nace", "indicator", "year") if c in frame.columns]
    return frame.sort_values(sort_cols).reset_index(drop=True)


def compact(frame: pd.DataFrame, series_col: str, indicators: list[tuple]) -> dict:
    """Compacte structuur: values[indicator][serie] = lijst per jaar (null = niet beschikbaar)."""
    years = sorted(int(y) for y in frame["year"].unique())
    year_pos = {y: i for i, y in enumerate(years)}
    values: dict[str, dict[str, list]] = {}
    for (indicator, series), part in frame.groupby(["indicator", series_col]):
        row: list = [None] * len(years)
        for year, value in zip(part["year"], part["value"]):
            row[year_pos[int(year)]] = round(float(value), 4)
        values.setdefault(indicator, {})[series] = row
    return {
        "years": years,
        "indicators": [
            {"code": c, "label": label, "unit": unit, "kind": kind}
            for c, label, unit, kind, *_ in indicators
            if c in values
        ],
        "values": values,
    }


def build_payload(bouw: pd.DataFrame, sectors: pd.DataFrame, regional: pd.DataFrame, updated: dict) -> dict:
    bouw_series = [
        {"key": code, "label": label_for(code), "level": level_of(code)}
        for code in sorted(bouw["nace"].unique(), key=lambda c: (len(c), c))
    ]
    # Op elk niveau ordenen volgens code zodat de hiërarchie leesbaar blijft.
    bouw_series.sort(key=lambda s: s["key"])
    sector_series = [
        {"key": code, "label": label_for(code)}
        for code in ["F", "ECON", *SECTION_CODES]
        if code in set(sectors["nace"])
    ]
    geo_series = [
        {"key": g, "label": GEO_LABELS[g][0], "type": GEO_LABELS[g][1]}
        for g in GEO_LABELS
        if g in set(regional["geo"])
    ]
    regional_nace = [
        {"key": code, "label": label_for(code)}
        for code in REGIONAL_NACE
        if code in set(regional["nace"])
    ]

    regional_compact_values: dict[str, dict[str, dict[str, list]]] = {}
    years = sorted(int(y) for y in regional["year"].unique())
    year_pos = {y: i for i, y in enumerate(years)}
    for (indicator, nace, geo), part in regional.groupby(["indicator", "nace", "geo"]):
        row: list = [None] * len(years)
        for year, value in zip(part["year"], part["value"]):
            row[year_pos[int(year)]] = round(float(value), 4)
        regional_compact_values.setdefault(indicator, {}).setdefault(nace, {})[geo] = row

    break_year = int(min(sectors.loc[sectors["reeks"] == NEW, "year"]))
    return {
        "generatedAt": pd.Timestamp.now("UTC").strftime("%Y-%m-%d"),
        "sourceUrl": "https://ec.europa.eu/eurostat/databrowser/explore/all/sbs",
        "apiGuideUrl": TOC_URL,
        "breakYear": break_year,
        "datasets": updated,
        "bouw": {**compact(bouw, "nace", INDICATORS), "series": bouw_series},
        "sectors": {**compact(sectors, "nace", INDICATORS), "series": sector_series},
        "regional": {
            "years": years,
            "indicators": [
                {"code": c, "label": label, "unit": unit, "kind": kind}
                for c, label, unit, kind, *_ in REGIONAL_INDICATORS
            ],
            "nace": regional_nace,
            "series": geo_series,
            "values": regional_compact_values,
        },
    }


def write_outputs(bouw: pd.DataFrame, sectors: pd.DataFrame, regional: pd.DataFrame, updated: dict) -> None:
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    columns = {
        "nace": "NACE-code",
        "nace_label": "Activiteit",
        "geo": "Regio-code",
        "geo_label": "Regio",
        "geo_type": "Regiotype",
        "indicator": "Indicator-code",
        "indicator_label": "Indicator",
        "unit": "Eenheid",
        "year": "Jaar",
        "value": "Waarde",
        "flag": "Eurostat-vlag",
        "reeks": "Bronreeks",
        "level": "Niveau bouw",
    }
    bouw_out = finalize(bouw, INDICATORS)
    bouw_out["level"] = bouw_out["nace"].map(level_of)
    sectors_out = finalize(sectors, INDICATORS)
    regional_out = finalize(regional, REGIONAL_INDICATORS)
    regional_out["geo_label"] = regional_out["geo"].map(lambda g: GEO_LABELS[g][0])
    regional_out["geo_type"] = regional_out["geo"].map(lambda g: GEO_LABELS[g][1])

    for name, frame in (
        ("eurostat_sbs_bouw_subsectoren.csv", bouw_out),
        ("eurostat_sbs_sectoren.csv", sectors_out),
        ("eurostat_sbs_gewesten.csv", regional_out),
    ):
        ordered = [c for c in columns if c in frame.columns]
        frame[ordered].rename(columns=columns).to_csv(CSV_DIR / name, index=False)

    payload = build_payload(bouw_out, sectors_out, regional_out, updated)
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--force", action="store_true", help="altijd opnieuw ophalen, ook zonder nieuwe Eurostat-update")
    parser.add_argument("--no-excel", action="store_true", help="sla het Excel-werkboek over")
    args = parser.parse_args()

    datasets = ["sbs_na_con_r2", "sbs_na_sca_r2", "sbs_r_nuts06_r2", "sbs_ovw_act", "sbs_r_nuts2021"]
    updated = {name: dataset_updated(name) for name in datasets}
    previous = json.loads(META_PATH.read_text()) if META_PATH.exists() else {}
    outputs_exist = JSON_PATH.exists() and (CSV_DIR / "eurostat_sbs_gewesten.csv").exists() and RAW_DIR.exists()
    if not args.force and outputs_exist and previous.get("datasets") == updated:
        print("Eurostat SBS: geen nieuwe update bij Eurostat, niets opnieuw opgehaald.")
        return 0

    print("Eurostat SBS: nationale reeksen ophalen ...")
    bouw, sectors = collect_national()
    print("Eurostat SBS: regionale reeksen ophalen ...")
    regional = collect_regional()
    write_outputs(bouw, sectors, regional, updated)
    write_raw()

    if not args.no_excel:
        from scripts.build_eurostat_excel import build_eurostat_excel

        excel_name = build_eurostat_excel()
        payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        payload["excelDownload"] = {"href": "data/eurostat-sbs-data.xlsx", "filename": excel_name}
        JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(
        json.dumps({"datasets": updated, "latestYear": int(sectors["year"].max())}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Eurostat SBS: {len(bouw)} + {len(sectors)} + {len(regional)} waarnemingen geschreven.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
