#!/usr/bin/env python3
"""Vergelijk de cijfers in de dashboards met de ruwe brondata in downloads/.

Elke waarde in article.json, eurostat-sbs.json en marktwerking.json wordt teruggezocht in de
ruwe CSV's van de bron, en omgekeerd. Verschillen, ontbrekende en overtollige punten worden
getoond. Exitcode 1 bij afwijkingen, zodat de workflow kan stoppen.

  python scripts/verify_data.py            # alle hoofdstukken
  python scripts/verify_data.py nbb        # enkel NBB (ook: eurostat, marktwerking)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))
PUBLIC = APP_ROOT / "public" / "data"
RAW = APP_ROOT / "downloads"


class Report:
    def __init__(self, name: str) -> None:
        self.name, self.checked, self.problems = name, 0, []

    def compare(self, where: str, shown, source, tol: float) -> None:
        self.checked += 1
        if shown is None and source is None:
            return
        if shown is None or source is None:
            self.problems.append(f"{where}: dashboard={shown} bron={source}")
        elif not math.isclose(float(shown), float(source), rel_tol=tol, abs_tol=tol):
            self.problems.append(f"{where}: dashboard={shown} bron={source}")

    def compare_sets(self, kind: str, shown: dict, source: dict, tol: float) -> None:
        for key in shown.keys() | source.keys():
            if key not in source:
                self.problems.append(f"{kind} {key}: staat in dashboard maar niet in de bron")
            elif key not in shown:
                self.problems.append(f"{kind} {key}: staat in de bron maar niet in dashboard")
            else:
                self.compare(f"{kind} {key}", shown[key], source[key], tol)

    def done(self) -> bool:
        status = "OK" if not self.problems else f"{len(self.problems)} AFWIJKINGEN"
        print(f"[{self.name}] {self.checked} punten vergeleken: {status}")
        for line in self.problems[:25]:
            print("   -", line)
        if len(self.problems) > 25:
            print(f"   ... en {len(self.problems) - 25} meer")
        return not self.problems


def verify_nbb() -> bool:
    rep = Report("NBB")
    article = json.loads((PUBLIC / "article.json").read_text(encoding="utf-8"))

    def raw(folder: str) -> pd.DataFrame:
        return pd.read_csv(RAW / folder / "data.csv", dtype={"SECTOR": str, "SCHEME": str})

    peers, subs, main = raw("cbratiose_bouw_vs_andere_sectoren"), raw("cbratiose_bouwsubsectoren"), raw("cbratiose_bouw_vs_alle_sectoren")
    # Punten die het rapport bewust verbergt (bekende anomalieën, zie render_bouwsector_cbratiose_report).
    import ast

    tree = ast.parse((APP_ROOT / "render_bouwsector_cbratiose_report.py").read_text(encoding="utf-8"))
    lists = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") in ("MAIN_ANOMALIES", "PEER_ANOMALIES", "LOWER_SUBSECTOR_ANOMALIES"):
            lists[node.targets[0].id] = ast.literal_eval(node.value)
    hidden = {(a["ratio_code"], a["sector_code"], a["year"]) for a in lists["PEER_ANOMALIES"] + lists["LOWER_SUBSECTOR_ANOMALIES"]}
    # Het rapport laat in 2022 alle gebruikte ratio's van DE4543 wegvallen (behalve R004/R006, al hierboven).
    for ind in article["chapters"][0]["indicators"]:
        if ind["code"] not in ("R004", "R006"):
            hidden.add((ind["code"], "DE4543", 2022))
    for a in lists["MAIN_ANOMALIES"]:
        owner = "bouw" if a["column"] == "value_pu300" else "alle"
        hidden.add((a["ratio_code"], f"{owner}_{a['scheme_code']}", a["year"]))
    hidden_count = 0

    def lookup(frame: pd.DataFrame, scheme: str | None) -> dict:
        sel = frame[frame.VALNR == "dispg"]
        if scheme:
            sel = sel[sel.SCHEME == scheme]
        return {(r.CBRATIOSE_ITEM, r.SECTOR, int(r.TIME_PERIOD), r.SCHEME): r.OBS_VALUE for r in sel.itertuples()}

    peer_src, sub_src, main_src = lookup(peers, "T"), lookup(subs, "T"), lookup(main, None)
    for chapter in article["chapters"]:
        shown, source = {}, {}
        for ind in chapter["indicators"]:
            for point in ind["chartData"]:
                for series in ind["series"]:
                    key = series["key"]
                    if chapter["key"] == "models":
                        scheme, sector = key.split("_")[1], "PU300" if key.startswith("bouw") else "PU450"
                        src = main_src.get((ind["code"], sector, point["sortValue"], scheme))
                    elif chapter["key"] == "peer-sectors":
                        src = peer_src.get((ind["code"], key, point["sortValue"], "T"))
                    else:
                        src = sub_src.get((ind["code"], key, point["sortValue"], "T"))
                    shown[(ind["code"], key, point["sortValue"])] = point.get(key)
                    source[(ind["code"], key, point["sortValue"])] = None if src is None or pd.isna(src) else src
        # Bronwaarden zonder dashboardpunt: enkel binnen de reeksen die het dashboard toont.
        for key in [k for k in shown if k in hidden and shown[k] is None]:
            shown.pop(key), source.pop(key)
            hidden_count += 1
        rep.compare_sets(f"{chapter['key']}", shown, source, 0.006)
    print(f"[NBB] {hidden_count} punten bewust verborgen door de anomalielijst van het rapport (dashboard toont ze als leeg)")
    return rep.done()


def verify_eurostat() -> bool:
    from scripts import update_eurostat as eu

    rep = Report("Eurostat")
    data = json.loads((PUBLIC / "eurostat-sbs.json").read_text(encoding="utf-8"))
    raw = {name: pd.read_csv(RAW / "eurostat" / f"{name}.csv", dtype=str, keep_default_na=False)
           for name in ("sbs_na_con_r2", "sbs_na_sca_r2", "sbs_ovw_act", "sbs_r_nuts06_r2", "sbs_r_nuts2021")}

    def source(dataset: str, indic_col: str, mapping: dict[str, str], geo_fix: bool = False) -> dict:
        frame = raw[dataset]
        out = {}
        for r in frame.itertuples(index=False):
            row = r._asdict()
            code = mapping.get(row[indic_col])
            if code is None or row["value"] == "":
                continue
            geo = row.get("geo")
            if geo_fix and geo == "BE10":
                geo = "BE1"
            nace = row["nace_r2"]
            nace = "ECON" if nace in (eu.ECON_OLD, eu.ECON_NEW) else nace
            out[(code, nace, geo, int(row["time"]))] = float(row["value"])
        return out

    old_map = {i[4]: i[0] for i in eu.INDICATORS}
    new_map = {i[5]: i[0] for i in eu.INDICATORS}
    for block, old_ds in (("bouw", "sbs_na_con_r2"), ("sectors", "sbs_na_sca_r2")):
        src = {**source(old_ds, "indic_sb", old_map), **source("sbs_ovw_act", "indic_sbs", new_map)}
        section = data[block]
        shown_keys = {s["key"] for s in section["series"]}
        shown = {}
        for code, series in section["values"].items():
            for nace, values in series.items():
                for year, value in zip(section["years"], values):
                    if value is not None:
                        shown[(code, nace, None, year)] = value
        src = {k: v for k, v in src.items() if k[1] in shown_keys and k[2] == "BE"}
        src = {(k[0], k[1], None, k[3]): v for k, v in src.items()}
        rep.compare_sets(block, shown, src, 1e-3)

    reg = data["regional"]
    roman = {i[4]: i[0] for i in eu.REGIONAL_INDICATORS}
    rnew = {i[5]: i[0] for i in eu.REGIONAL_INDICATORS}
    src = {**source("sbs_r_nuts06_r2", "indic_sb", roman, True), **source("sbs_r_nuts2021", "indic_sbs", rnew, True)}
    naces = {n["key"] for n in reg["nace"]}
    geos = {s["key"] for s in reg["series"]}
    src = {k: v for k, v in src.items() if k[1] in naces and k[2] in geos}
    shown = {}
    for code, by_nace in reg["values"].items():
        for nace, by_geo in by_nace.items():
            for geo, values in by_geo.items():
                for year, value in zip(reg["years"], values):
                    if value is not None:
                        shown[(code, nace, geo, year)] = value
    rep.compare_sets("regionaal", shown, src, 1e-3)
    return rep.done()


def verify_marktwerking() -> bool:
    rep = Report("Marktwerking")
    data = json.loads((PUBLIC / "marktwerking.json").read_text(encoding="utf-8"))
    sheets = {p.name[3:-4]: pd.read_csv(p, header=None, dtype=object) for p in sorted((RAW / "marktwerking").glob("*.csv"))}

    def num(v):
        try:
            f = float(v)
            return None if math.isnan(f) else f
        except (TypeError, ValueError):
            return None

    # Vaste kolomposities in het bronbestand (zie de kopregels in de CSV's).
    layouts = {
        "Bouw": ("Deel1_Diensten", "Bouw", 5, ["IC", "KI", "GOV", "HHI", "AB", "PCM", "OV", "TNF8", "VMA"], 14,
                 ["IC", "KI", "GOV", "HHI", "PCM", "OV", "TNF8", "VMA"]),
        "Bouwmaterialen (industrie)": ("Deel1_industrie", "Andere minerale producten", 6,
                 ["IC", "KI", "GOV", "HHI", "IMP", "AB", "PCM", "OV", "TNF8", "VMA"], 16,
                 ["IC", "KI", "GOV", "HHI", "IMP", "PCM", "OV", "TNF8", "VMA"]),
    }
    shown, source = {}, {}
    for row in data["screening"]:
        sheet, cat, rank0, rank_codes, val0, val_codes = layouts[row["group"]]
        frame = sheets[sheet]
        hit = frame[(frame[2] == cat) & (frame[0].astype(str).str.strip() == row["nace"])]
        if hit.empty:
            rep.problems.append(f"screening {row['nace']}: niet gevonden in bronblad {sheet}")
            continue
        r = hit.iloc[0]
        for i, code in enumerate(rank_codes):
            shown[("rang", row["group"], row["nace"], code)] = row["ranks"].get(code)
            source[("rang", row["group"], row["nace"], code)] = num(r[rank0 + i])
        for i, code in enumerate(val_codes):
            shown[("waarde", row["group"], row["nace"], code)] = row["values"].get(code)
            source[("waarde", row["group"], row["nace"], code)] = num(r[val0 + i])
    rep.compare_sets("screening", shown, source, 1e-9)

    sheet_for = {"d2": "Deel_2_Diensten__NACE_2", "d4": "Deel_2_Diensten__NACE_4", "i2": "Deel_2_Industrie__NACE_2"}
    starts = {"NET_GLOB": 4, "NET_MED": 10, "LOSS": 16}
    shown, source = {}, {}
    for s in data["margins"]["series"]:
        prefix = s["key"].split("_")[0]
        frame = sheets[sheet_for[prefix]].iloc[3:]
        hit = frame[frame[0].astype(str).str.strip() == s["nace"]]
        for measure, start in starts.items():
            for i, year in enumerate(data["marginYears"]):
                shown[(measure, s["key"], year)] = data["margins"]["values"][measure][s["key"]][i]
                v = num(hit.iloc[0][start + i]) if not hit.empty else None
                source[(measure, s["key"], year)] = None if v is None else v * 100
    rep.compare_sets("marges", shown, source, 1e-3)
    return rep.done()


def main() -> int:
    wanted = set(sys.argv[1:]) or {"nbb", "eurostat", "marktwerking"}
    checks = {"nbb": verify_nbb, "eurostat": verify_eurostat, "marktwerking": verify_marktwerking}
    results = [checks[name]() for name in checks if name in wanted]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
