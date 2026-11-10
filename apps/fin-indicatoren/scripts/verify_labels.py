#!/usr/bin/env python3
"""Controleer dat kolomnamen, variabelenamen, eenheden en beschrijvingen overeenkomen met de bron.

Aanvulling op verify_data.py (dat de waarden controleert). Twee uitkomsten:
  FOUT     aantoonbaar verkeerd (code bestaat niet, eenheid of kolompositie klopt niet, label wijkt af waar
           het exact moet zijn, kolomnamen van CSV en Excel verschillen). Geeft exitcode 1.
  NAKIJKEN ons label verschilt van de officiële bronnaam (korte of vertaalde naam, of een interpretatie van een
           afkorting). Dat is geen fout, maar iemand moet het één keer bevestigen. Alles staat naast elkaar in
           downloads/label_review.csv.

  python scripts/verify_labels.py [nbb|eurostat|marktwerking]
"""

from __future__ import annotations

import difflib
import json
import re
import sys
from pathlib import Path

import pandas as pd

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))
PUBLIC = APP_ROOT / "public" / "data"
RAW = APP_ROOT / "downloads"
REVIEW_PATH = RAW / "label_review.csv"


class Result:
    def __init__(self, name: str) -> None:
        self.name, self.checked, self.errors, self.review = name, 0, [], []

    def ok(self, condition: bool, message: str) -> None:
        self.checked += 1
        if not condition:
            self.errors.append(message)

    def note(self, kind: str, code: str, ours: str, source: str, remark: str = "") -> None:
        self.review.append({"bron": self.name, "soort": kind, "code": code, "ons label": ours,
                            "bronlabel": source, "opmerking": remark})


def norm(text: str) -> str:
    text = re.sub(r"^\s*\d+\.\s*", "", str(text))
    text = re.sub(r"\([^)]*\)", "", text)
    text = text.split(" - ")[0]
    return re.sub(r"[^a-z0-9 ]", "", text.casefold()).strip()


def unit_from_label(label: str) -> str | None:
    low = label.lower()
    if "million euro" in low:
        return "mln euro"
    if "thousand euro" in low:
        return "duizend euro"
    if "percentage" in low or "percent" in low:
        return "%"
    if low.rstrip().endswith("number"):
        return "aantal"
    return None


# ----------------------------------------------------------------------------- NBB
def check_nbb() -> Result:
    res = Result("NBB")
    article = json.loads((PUBLIC / "article.json").read_text(encoding="utf-8"))
    base = RAW / "cbratiose_bouw_vs_alle_sectoren"
    items = pd.read_csv(base / "CL_CBRATIOSE_ITEM.csv").set_index("code")["naam_nl"].to_dict()
    sectors = pd.read_csv(base / "CL_AA_SECTOR.csv").set_index("code")["naam_nl"].to_dict()
    schemes = pd.read_csv(base / "CL_AA_SCHEME.csv").set_index("code")["naam_nl"].to_dict()
    valnr = pd.read_csv(base / "CL_AA_VALNR.csv").set_index("code")["naam_nl"].to_dict()

    guide = {g["code"]: g for g in article["indicatorGuide"]}
    for ind in article["chapters"][0]["indicators"]:
        code, ours, kind = ind["code"], ind["label"], ind["kind"]
        official = items.get(code)
        res.ok(official is not None, f"NBB-ratio {code} bestaat niet in de codelijst CL_CBRATIOSE_ITEM")
        if official is None:
            continue
        # eenheid uit de officiële naam moet bij ons soort passen
        expected = "percent" if "(%)" in official else "currency" if "EUR" in official else None
        if expected:
            res.ok(kind == expected, f"NBB {code} '{ours}': soort '{kind}' maar de bron zegt '{official}'")
        else:
            res.ok(kind in ("ratio", "days"), f"NBB {code} '{ours}': soort '{kind}' maar de bron geeft geen eenheid ('{official}')")
        if "dagen" in official.lower():
            res.ok(kind == "days", f"NBB {code}: bron spreekt over dagen, soort is '{kind}'")
        res.ok(guide.get(code, {}).get("label") == ours, f"NBB {code}: label in indicatorengids ({guide.get(code, {}).get('label')}) verschilt van grafieklabel ({ours})")
        if norm(official) != norm(ours):
            res.note("indicator", code, ours, official, "ons label is een korte versie van de officiële naam")

    for chapter in article["chapters"][:2]:
        for series in chapter["indicators"][0]["series"]:
            official = sectors.get(series["key"])
            res.ok(official is not None, f"NBB-sector {series['key']} bestaat niet in CL_AA_SECTOR")
            if official and norm(official.split(":", 1)[-1]) != norm(series["label"]):
                res.note("sector", series["key"], series["label"], official, "korte naam; controleer of de afbakening nog klopt")

    # sectorgids: code en omschrijving moeten letterlijk de bronnaam uit de codelijst zijn
    shown_codes = {x["key"] for ch in article["chapters"][:2] for x in ch["indicators"][0]["series"]}
    guide_codes = set()
    for group in article.get("sectorGuide", []):
        for item in group["items"]:
            guide_codes.add(item["code"])
            official = sectors.get(item["code"], "")
            res.ok(official == f"{item['code']} : {item['description']}",
                   f"NBB sectorgids {item['code']}: omschrijving '{item['description']}' is niet de bronnaam '{official}'")
    res.ok(shown_codes <= guide_codes, f"NBB sectorgids mist sectorcodes die in de grafieken staan: {sorted(shown_codes - guide_codes)}")

    # jaarrekeningmodellen: eerste woord van het label moet de officiële naam zijn
    alias = {"C": "Volledig", "A": "Verkort", "M": "Micro", "T": "Totaal"}
    for series in article["chapters"][2]["indicators"][0]["series"]:
        scheme = series["key"].split("_")[1]
        official = schemes.get(scheme, "")
        suffix = series["label"].split(" - ")[-1]
        res.ok(suffix == alias[scheme], f"NBB model {series['key']}: label '{series['label']}' past niet bij modelcode {scheme}")
        if scheme != "T":
            res.ok(official == suffix, f"NBB model {scheme}: '{suffix}' is niet de bronnaam '{official}'")
        else:
            res.note("model", "T", "Totaal", official, "T is in de bron 'Volledig + Verkort + Micro'")
    res.ok(valnr.get("dispg") == "Gewogen gemiddelde", "NBB: dispg is niet 'Gewogen gemiddelde' in de bron (Excel-toelichting klopt dan niet)")
    res.ok(valnr.get("dispq2", "").startswith("Mediaan") and valnr.get("dispnb") == "Aantal ondernemingen",
           "NBB: dispq2/dispnb komen niet overeen met de toelichting in het Excelvoorblad")

    # Excel-kolomnamen: header in het werkboek = omgezette CSV-header
    try:
        from openpyxl import load_workbook
        from scripts import build_excel as be

        wb = load_workbook(PUBLIC / "fin-indicatoren-data.xlsx", read_only=True)
        for name, csv_name, _t, _d in be.SHEETS:
            expected = list(be.prepare(pd.read_csv(PUBLIC / csv_name)).columns)
            rows = list(wb[name].iter_rows(min_row=1, max_row=12, values_only=True))
            found = any([c for c in row if c is not None][: len(expected)] == expected for row in rows)
            res.ok(found, f"NBB Excel-tabblad '{name}': kolomnamen komen niet overeen met de CSV ({expected[:4]}...)")
    except ImportError:
        res.note("excel", "-", "-", "-", "openpyxl niet beschikbaar: Excel-kolomnamen niet gecontroleerd")
    return res


# ----------------------------------------------------------------------------- Eurostat
def check_eurostat() -> Result:
    from scripts import update_eurostat as eu

    res = Result("Eurostat")
    raw = {n: pd.read_csv(RAW / "eurostat" / f"{n}.csv", dtype=str, keep_default_na=False)
           for n in ("sbs_na_con_r2", "sbs_na_sca_r2", "sbs_ovw_act", "sbs_r_nuts06_r2", "sbs_r_nuts2021")}

    def labels(dataset: str, code_col: str) -> dict[str, str]:
        frame = raw[dataset]
        return dict(zip(frame[code_col], frame[f"{code_col}_label"]))

    old_sets = [("sbs_na_con_r2", "indic_sb"), ("sbs_na_sca_r2", "indic_sb")]
    old_labels = {**labels(*old_sets[0]), **labels(*old_sets[1])}
    new_labels = labels("sbs_ovw_act", "indic_sbs")
    for code, ours, unit, _kind, old, new, _s in eu.INDICATORS:
        lo, ln = old_labels.get(old), new_labels.get(new)
        res.ok(lo is not None, f"Eurostat indicator {code}: oude code {old} komt niet voor in de ruwe data")
        res.ok(ln is not None, f"Eurostat indicator {code}: nieuwe code {new} komt niet voor in de ruwe data")
        if not lo or not ln:
            continue
        for src_label, regime in ((lo, "oud"), (ln, "nieuw")):
            parsed = unit_from_label(src_label)
            res.ok(parsed in (None, unit), f"Eurostat {code} '{ours}': eenheid '{unit}' maar {regime}e bron zegt '{src_label}'")
        if difflib.SequenceMatcher(None, norm(lo), norm(ln)).ratio() < 0.9:
            res.note("variabele", f"{code}: {old} -> {new}", ours, f"{lo}  |  {ln}",
                     "oude en nieuwe reeks gebruiken een andere benaming: controleer of de definitie gelijk is")
        else:
            res.note("variabele", f"{code}: {old} -> {new}", ours, lo, "benaming gelijk in beide reeksen")

    r_old = labels("sbs_r_nuts06_r2", "indic_sb")
    r_new = labels("sbs_r_nuts2021", "indic_sbs")
    for code, ours, unit, _kind, old, new, _s in eu.REGIONAL_INDICATORS:
        lo, ln = r_old.get(old), r_new.get(new)
        res.ok(lo is not None and ln is not None, f"Eurostat regionaal {code}: code {old}/{new} niet in de ruwe data")
        if lo and ln:
            for src_label in (lo, ln):
                res.ok(unit_from_label(src_label) in (None, unit), f"Eurostat regionaal {code}: eenheid '{unit}' vs '{src_label}'")
            res.note("variabele (regio)", f"{code}: {old} -> {new}", ours, f"{lo}  |  {ln}", "")

    # NACE-codes en -namen
    nace_en = {**labels("sbs_na_con_r2", "nace_r2"), **labels("sbs_na_sca_r2", "nace_r2"), **labels("sbs_ovw_act", "nace_r2")}
    data = json.loads((PUBLIC / "eurostat-sbs.json").read_text(encoding="utf-8"))
    shown = [s for sec in ("bouw", "sectors") for s in data[sec]["series"]] + data["regional"]["nace"]
    for s in {x["key"]: x for x in shown}.values():
        key = {"ECON": None}.get(s["key"], s["key"])
        if key is None:
            res.note("nace", "ECON", s["label"], f"{nace_en.get(eu.ECON_OLD)} | {nace_en.get(eu.ECON_NEW)}", "andere afbakening voor en na 2021")
            continue
        res.ok(key in nace_en, f"Eurostat NACE {key} ('{s['label']}') bestaat niet in de ruwe data")
        res.note("nace", key, s["label"], nace_en.get(key, "?"), "")
    # hiërarchie: niveau volgt uit de codelengte
    for s in data["bouw"]["series"]:
        res.ok(s["level"] == eu.level_of(s["key"]), f"Eurostat bouwniveau van {s['key']} klopt niet")

    geo_en = {**labels("sbs_r_nuts06_r2", "geo"), **labels("sbs_r_nuts2021", "geo")}
    for g in data["regional"]["series"]:
        src = geo_en.get(g["key"]) or geo_en.get("BE10" if g["key"] == "BE1" else g["key"])
        res.ok(src is not None, f"Eurostat regio {g['key']} bestaat niet in de ruwe data")
        res.note("regio", g["key"], g["label"], src or "?", "")

    # CSV-kolommen en Excel-kolommen
    expected = {
        "eurostat_sbs_bouw_subsectoren.csv": ["NACE-code", "Activiteit", "Indicator-code", "Indicator", "Eenheid", "Jaar", "Waarde", "Eurostat-vlag", "Bronreeks", "Niveau bouw"],
        "eurostat_sbs_sectoren.csv": ["NACE-code", "Activiteit", "Indicator-code", "Indicator", "Eenheid", "Jaar", "Waarde", "Eurostat-vlag", "Bronreeks"],
        "eurostat_sbs_gewesten.csv": ["NACE-code", "Activiteit", "Regio-code", "Regio", "Regiotype", "Indicator-code", "Indicator", "Eenheid", "Jaar", "Waarde", "Eurostat-vlag", "Bronreeks"],
    }
    for name, cols in expected.items():
        got = list(pd.read_csv(PUBLIC / "eurostat" / name, nrows=1).columns)
        res.ok(got == cols, f"Eurostat {name}: kolommen {got} wijken af van verwacht {cols}")
    try:
        from openpyxl import load_workbook
        from scripts import build_eurostat_excel as bx

        wb = load_workbook(PUBLIC / "eurostat-sbs-data.xlsx", read_only=True)
        for name, csv_name, _t, _d in bx.SHEETS:
            cols = list(pd.read_csv(bx.CSV_DIR / csv_name, nrows=1).columns)
            rows = list(wb[name].iter_rows(min_row=1, max_row=12, values_only=True))
            res.ok(any([c for c in row if c is not None][: len(cols)] == cols for row in rows),
                   f"Eurostat Excel-tabblad '{name}': kolomnamen komen niet overeen met de CSV")
    except ImportError:
        pass
    # indicatoren en eenheden zoals de blog ze toont
    shown_ind = {i["code"]: (i["label"], i["unit"]) for sec in ("bouw", "sectors") for i in data[sec]["indicators"]}
    for code, ours, unit, *_ in eu.INDICATORS:
        res.ok(shown_ind.get(code) == (ours, unit), f"Eurostat indicator {code}: blog toont {shown_ind.get(code)} maar script definieert {(ours, unit)}")
    return res


# ----------------------------------------------------------------------------- Marktwerking
def check_marktwerking() -> Result:
    import shutil
    import subprocess

    from scripts import update_marktwerking as mw

    res = Result("Marktwerking")
    data = json.loads((PUBLIC / "marktwerking.json").read_text(encoding="utf-8"))
    sheets = {p.name[3:-4]: pd.read_csv(p, header=None, dtype=object) for p in sorted((RAW / "marktwerking").glob("*.csv"))}

    def code_of(v) -> str:
        text = str(v).strip()
        return text[:-2] if text.endswith(".0") else text

    # kolomkoppen op de verwachte posities (zelfde posities als verify_data.py gebruikt)
    services = ["SI Gewoon gemidd.", "Aant. bedr.", "HHI", "Nettomarge", "Volatiliteit", "Stabiliteit"]
    industry = ["SI Gewoon gemidd.", "Aant. bedr.", "HHI", "Importpenetratie", "Nettomarge", "Volatiliteit", "Stabiliteit"]
    for sheet, headers, group in (("SI_Diensten", services, "Bouw"), ("SI_industrieën", industry, "Bouwmaterialen (industrie)")):
        top, sub = sheets[sheet].iloc[2], sheets[sheet].iloc[3]
        n = len(headers)
        for i, h in enumerate(headers):
            res.ok(str(sub[3 + i]) == h, f"Marktwerking {sheet}: waardekolom {3 + i} heet '{sub[3 + i]}', verwacht '{h}'")
            res.ok(str(sub[3 + n + i]) == h, f"Marktwerking {sheet}: rangkolom {3 + n + i} heet '{sub[3 + n + i]}', verwacht '{h}'")
        res.ok("Waarden indicatoren" in str(top[3]) and "Rankschikking" in str(top[3 + n]), f"Marktwerking {sheet}: kopblokken 'Waarden'/'Rankschikking' staan niet op de verwachte plaats")
        rank_of = [r["rankOf"] for r in data["screening"] if r["group"] == group][0]
        res.ok(f"van {rank_of}" in str(top[3 + n]), f"Marktwerking {sheet}: '{top[3 + n]}' komt niet overeen met rankOf {rank_of}")
        res.ok(f"in {data['turnoverYear']['screening']} " in str(top[2]), f"Marktwerking {sheet}: omzetkop '{top[2]}' past niet bij turnoverYear {data['turnoverYear']['screening']}")
        for h in headers:
            res.ok(h in mw.HEADER_TO_CODE, f"Marktwerking: bronkop '{h}' ontbreekt in HEADER_TO_CODE")

    # onze indicatornamen en omschrijvingen tegenover de methodologie
    code_to_header = {v: k for k, v in mw.HEADER_TO_CODE.items()}
    pdf = next((RAW.parent / "data" / "marktwerking").glob("*methodologie*.pdf"), None)
    method_text = ""
    if pdf and shutil.which("pdftotext"):
        method_text = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True).stdout.lower()
    terms = {"SI": "samengestelde indicator", "AB": "aantal ondernemingen", "HHI": "herfindahl", "IMP": "penetratie van invoer",
             "NM": "nettomarge", "VOL": "volatiliteit van marktaandelen", "STAB": "stabiliteitsgraad"}
    for ind in data["indicators"]:
        res.ok(ind["code"] in code_to_header, f"Marktwerking indicator {ind['code']} heeft geen bronkolom")
        if method_text:
            res.ok(terms[ind["code"]] in method_text, f"Marktwerking '{ind['label']}': term '{terms[ind['code']]}' staat niet in de methodologie")
        res.note("indicator", ind["code"], ind["label"], code_to_header.get(ind["code"], "?"),
                 "uitgeschreven naam volgens het methodologisch rapport; omschrijving is een samenvatting daarvan")
    if not method_text:
        res.note("methodologie", "-", "-", "-", "pdftotext of de methodologie-pdf ontbreekt: namen niet tegen de methodologie gecontroleerd")

    # evolutie: kopblokken en jaren
    for sheet in ("NettoMarge_Diensten_NACE_2", "NettoMarge_Diensten_NACE_5", "NettoMarge_Industrieën_NACE_2", "NettoMarge_Industrieën_NACE_5"):
        top, sub = sheets[sheet].iloc[2], sheets[sheet].iloc[3]
        for col, header in ((2, "Netto marge (geglobaliseerd)"), (13, "Netto marge (mediaan)"), (24, "Aandeel van bedrijven met een exploitatieverlies (rub. 9901)")):
            res.ok(str(top[col]) == header, f"Marktwerking {sheet}: kop op kolom {col} is '{top[col]}', verwacht '{header}'")
            res.ok([int(float(v)) for v in sub[col:col + 11]] == data["marginYears"], f"Marktwerking {sheet}: jaren bij '{header}' wijken af van {data['marginYears']}")
    for sheet in ("HHI_Diensten", "HHI_Industrieën"):
        top, sub = sheets[sheet].iloc[2], sheets[sheet].iloc[3]
        res.ok(str(top[2]) == "HHI" and [int(float(v)) for v in sub[2:13]] == data["marginYears"], f"Marktwerking {sheet}: kop of jaren komen niet overeen")
    for m in data["margins"]["measures"]:
        source = {"NET_GLOB": "Netto marge (geglobaliseerd)", "NET_MED": "Netto marge (mediaan)",
                  "LOSS": "Aandeel van bedrijven met een exploitatieverlies (rub. 9901)", "HHI": "HHI"}[m["code"]]
        if m["label"] != source:
            res.note("maat", m["code"], m["label"], source, "verkorte of uitgeschreven naam")

    # NACE-omschrijvingen letterlijk uit de bron
    sources = {"d2": "NettoMarge_Diensten_NACE_2", "d5": "NettoMarge_Diensten_NACE_5", "i2": "NettoMarge_Industrieën_NACE_2", "i5": "NettoMarge_Industrieën_NACE_5"}
    cache = {p: {code_of(c): mw.clean_text(l) for c, l in zip(sheets[sh].iloc[4:][0], sheets[sh].iloc[4:][1])} for p, sh in sources.items()}
    for row in data["screening"]:
        sheet = "SI_Diensten" if row["group"] == "Bouw" else "SI_industrieën"
        frame = sheets[sheet].iloc[4:]
        hit = frame[frame[0].map(code_of) == row["nace"]]
        res.ok(not hit.empty and mw.clean_text(hit.iloc[0][1]) == row["label"], f"Marktwerking screening {row['nace']}: label '{row['label']}' is niet de bronomschrijving")
    for s in data["margins"]["series"]:
        res.ok(cache[s["key"].split("_")[0]].get(s["nace"]) == s["label"] or s["key"].startswith(("d5", "i5")),
               f"Marktwerking evolutie {s['key']}: label '{s['label']}' is niet de bronomschrijving")
    bad = [r["label"] for r in data["screening"] if "\x1a" in r["label"]] + [s["label"] for s in data["margins"]["series"] if "\x1a" in s["label"]]
    res.ok(not bad, f"Marktwerking: stuurteken \\x1a in labels: {bad[:3]}")

    # CSV-kolommen en Excel-kolommen
    year = data["turnoverYear"]["screening"]
    cols = list(pd.read_csv(PUBLIC / "marktwerking" / "marktwerking_screening_bouw.csv", nrows=1).columns)
    expected = ["NACE-code", "Omschrijving", "Groep", f"Binnenlandse omzet {year} (mln euro)", "Rangschikking uit"]
    res.ok(cols[:5] == expected, f"Marktwerking screening-CSV: kopkolommen {cols[:5]} wijken af van {expected}")
    res.ok(cols[5:] == [f"Rang {i['label']}" for i in data["indicators"]] + [f"Waarde {i['label']}" for i in data["indicators"]],
           "Marktwerking screening-CSV: rang- en waardekolommen komen niet overeen met de indicatoren")
    evo_cols = ["Groep", "NACE-code", "Omschrijving", "Maat", "Eenheid", "Jaar", "Waarde"]
    res.ok(list(pd.read_csv(PUBLIC / "marktwerking" / "marktwerking_evolutie.csv", nrows=1).columns) == evo_cols, "Marktwerking evolutie-CSV: kolomnamen wijken af")
    try:
        from openpyxl import load_workbook

        wb = load_workbook(PUBLIC / "marktwerking-data.xlsx", read_only=True)
        for name, csv in (("Screening bouw", "marktwerking_screening_bouw.csv"), ("Evolutie", "marktwerking_evolutie.csv")):
            exp = list(pd.read_csv(PUBLIC / "marktwerking" / csv, nrows=1).columns)
            rows = list(wb[name].iter_rows(min_row=1, max_row=12, values_only=True))
            res.ok(any([c for c in row if c is not None][: len(exp)] == exp for row in rows), f"Marktwerking Excel-tabblad '{name}': kolomnamen wijken af van de CSV")
    except ImportError:
        pass
    return res


def report(results: list[Result]) -> bool:
    review = [row for r in results for row in r.review]
    REVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(review).to_csv(REVIEW_PATH, index=False)
    ok = True
    for r in results:
        status = "OK" if not r.errors else f"{len(r.errors)} FOUTEN"
        print(f"[{r.name}] {r.checked} controles op namen/eenheden: {status}; {len(r.review)} regels om na te kijken")
        for line in r.errors[:25]:
            print("   FOUT:", line)
        ok = ok and not r.errors
    print(f"Naast elkaar gelegd (ons label vs bronlabel): {REVIEW_PATH}")
    return ok


def main() -> int:
    checks = {"nbb": check_nbb, "eurostat": check_eurostat, "marktwerking": check_marktwerking}
    wanted = [a for a in sys.argv[1:] if a in checks] or list(checks)
    return 0 if report([checks[n]() for n in wanted]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
