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
    from scripts import update_marktwerking as mw

    res = Result("Marktwerking")
    data = json.loads((PUBLIC / "marktwerking.json").read_text(encoding="utf-8"))
    sheets = {p.name[3:-4]: pd.read_csv(p, header=None, dtype=object) for p in sorted((RAW / "marktwerking").glob("*.csv"))}

    # kolomkoppen op de verwachte posities (zelfde posities als verify_data.py gebruikt)
    layouts = [
        ("Deel1_Diensten", 5, ["IC Gewoon gemidd.", "Kap. intens.", "Gew. ond. verloop", "HHI", "Aant. bedr.", "PCM", "Overlev.", "TNF8", "Verand. mkt. aand."], 14,
         ["IC Gewoon gemidd.", "Kap. intens.", "Gew. ond. verloop", "HHI", "PCM", "Overlev.", "TNF8", "Verand. mkt. aand."]),
        ("Deel1_industrie", 6, ["Samengestelde Indic.", "Kap. intens.", "Gew. ond. verloop", "HHI", "Imp. pen.", "Aant. bedr.", "PCM", "Overlev.", "TNF8", "Verand. mkt. aand."], 16,
         ["Samengestelde Indic.", "Kap. intens.", "Gew. ond. verloop", "HHI", "Imp. pen.", "PCM", "Overlev.", "TNF8", "Verand. mkt. aand."]),
    ]
    for sheet, r0, rank_headers, v0, val_headers in layouts:
        header = sheets[sheet].iloc[3]
        top = sheets[sheet].iloc[2]
        for i, h in enumerate(rank_headers):
            res.ok(str(header[r0 + i]) == h, f"Marktwerking {sheet}: kolom {r0 + i} heet '{header[r0 + i]}', verwacht '{h}' (rang)")
        for i, h in enumerate(val_headers):
            res.ok(str(header[v0 + i]) == h, f"Marktwerking {sheet}: kolom {v0 + i} heet '{header[v0 + i]}', verwacht '{h}' (waarde)")
        res.ok("Rankschikking" in str(top[r0]) and "Waarden" in str(top[v0]), f"Marktwerking {sheet}: kopblokken 'Rankschikking'/'Waarden' staan niet op de verwachte plaats")
        res.ok(f"van {data['screening'][0]['rankOf'] if sheet == 'Deel1_Diensten' else [r for r in data['screening'] if r['group'] != 'Bouw'][0]['rankOf']}" in str(top[r0]),
               f"Marktwerking {sheet}: 'rangschikking op totaal van N' komt niet overeen met rankOf")

    # onze uitgeschreven indicatornamen (interpretatie van de afkortingen)
    header_for = {"IC": "IC Gewoon gemidd. / Samengestelde Indic.", "KI": "Kap. intens.", "GOV": "Gew. ond. verloop", "HHI": "HHI",
                  "IMP": "Imp. pen.", "AB": "Aant. bedr.", "PCM": "PCM", "OV": "Overlev.", "TNF8": "TNF8", "VMA": "Verand. mkt. aand."}
    for ind in data["indicators"]:
        res.ok(ind["code"] in header_for, f"Marktwerking indicator {ind['code']} heeft geen bronkolom")
        res.ok(ind["code"] in mw.HEADER_TO_CODE.values(), f"Marktwerking indicator {ind['code']} niet in HEADER_TO_CODE")
        res.note("afkorting", ind["code"], ind["label"], header_for.get(ind["code"], "?"), "uitschrijving van de afkorting is een interpretatie; TNF8 blijft ongewijzigd")

    # marges: kopblokken
    d2 = sheets["Deel_2_Diensten__NACE_2"]
    source_measures = {"NET_GLOB": (4, "Netto marge (geglobaliseerd)"), "NET_MED": (10, "Netto marge (mediaan)"),
                       "LOSS": (16, "Aandeel van bedrijven met een exploitatieverlies (rub. 9901)")}
    for m in data["margins"]["measures"]:
        col, source_label = source_measures[m["code"]]
        res.ok(str(d2.iloc[1][col]) == source_label, f"Marktwerking marge {m['code']}: bronkop op kolom {col} is '{d2.iloc[1][col]}', verwacht '{source_label}'")
        if m["label"] != source_label:
            res.note("maat", m["code"], m["label"], source_label, "verkorte naam")
        res.ok([int(float(v)) for v in d2.iloc[2][col:col + 6]] == data["marginYears"], f"Marktwerking marge {m['code']}: jaren in de bron wijken af van {data['marginYears']}")

    # NACE-omschrijvingen moeten letterlijk (na herstel van de tekencodering) uit de bron komen
    def source_labels(sheet: str, rows_from: int, label_col: int = 1, code_col: int = 0) -> dict[str, str]:
        frame = sheets[sheet].iloc[rows_from:]
        return {str(c).strip(): mw.clean_text(l) for c, l in zip(frame[code_col], frame[label_col]) if str(c) != "nan"}

    for row in data["screening"]:
        sheet, cat, rows_from = (("Deel1_Diensten", "Bouw", 4) if row["group"] == "Bouw" else ("Deel1_industrie", "Andere minerale producten", 4))
        frame = sheets[sheet].iloc[rows_from:]
        hit = frame[(frame[2] == cat) & (frame[0].astype(str).str.strip() == row["nace"])]
        res.ok(not hit.empty and mw.clean_text(hit.iloc[0][1]) == row["label"], f"Marktwerking screening {row['nace']}: label '{row['label']}' is niet de bronomschrijving")
    sheet_for = {"d2": "Deel_2_Diensten__NACE_2", "d4": "Deel_2_Diensten__NACE_4", "i2": "Deel_2_Industrie__NACE_2"}
    cache = {p: source_labels(s, 3) for p, s in sheet_for.items()}
    for s in data["margins"]["series"]:
        res.ok(cache[s["key"].split("_")[0]].get(s["nace"]) == s["label"], f"Marktwerking marges {s['key']}: label '{s['label']}' is niet de bronomschrijving")
    bad = [r["label"] for r in data["screening"] if "\x1a" in r["label"]] + [s["label"] for s in data["margins"]["series"] if "\x1a" in s["label"]]
    res.ok(not bad, f"Marktwerking: stuurteken \\x1a in labels: {bad[:3]}")

    # CSV-kolommen
    cols = list(pd.read_csv(PUBLIC / "marktwerking" / "marktwerking_screening_bouw.csv", nrows=1).columns)
    res.ok(cols[:6] == ["NACE-code", "Omschrijving", "Groep", "Omzet 2022 (mln euro)", "Aantal ondernemingen 2022", "Rangschikking uit"],
           f"Marktwerking screening-CSV: kopkolommen wijken af ({cols[:6]})")
    res.ok(f"Omzet {data['turnoverYear']['screening']}" in cols[3] and f"ondernemingen {data['turnoverYear']['screening']}" in cols[4], "Marktwerking screening-CSV: jaartal in kolomnaam klopt niet met turnoverYear")
    res.ok(list(pd.read_csv(PUBLIC / "marktwerking" / "marktwerking_marges.csv", nrows=1).columns) == ["Groep", "NACE-code", "Omschrijving", "Maat", "Jaar", "Waarde (%)"],
           "Marktwerking marges-CSV: kolomnamen wijken af")
    try:
        from openpyxl import load_workbook

        wb = load_workbook(PUBLIC / "marktwerking-data.xlsx", read_only=True)
        for name, csv in (("Screening bouw", "marktwerking_screening_bouw.csv"), ("Marges", "marktwerking_marges.csv")):
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
