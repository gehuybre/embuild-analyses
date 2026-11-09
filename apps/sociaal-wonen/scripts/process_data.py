#!/usr/bin/env python3
"""Verwerk KTP-, MJP- en SSI-bronbladen naar geanonimiseerde categorieën."""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

import openpyxl

from geo_lib import (APP_DIR, SvgProjector, build_current_municipalities, name_index, norm,
                     province_of)
from shapely.ops import unary_union

DATA = APP_DIR / "data"
REF = APP_DIR / "reference"
OUT = APP_DIR / "public/data"

# Bronbestanden worden automatisch gevonden: de nieuwste `JJJJ_MM_DD_KTP.xlsx` en `JJJJ_MM_DD_MJP.xlsx` in data/.
HORIZON_META = {
    "kt": {"pattern": "*_KTP.xlsx", "label": "Korte termijn", "omschrijving": "Verrichtingen die klaar zijn voor aanbesteding"},
    "lt": {"pattern": "*_MJP.xlsx", "label": "Meerjarenplanning", "omschrijving": "Verrichtingen waarvoor een voorontwerp werd geadviseerd"},
}
HORIZONS: dict[str, dict] = {}


def find_sources() -> None:
    """Zoekt per horizon de nieuwste xlsx (op bestandsnaam) en leidt de peildatum af uit het datumvoorvoegsel."""
    for hz, m in HORIZON_META.items():
        files = sorted(p for p in DATA.glob(m["pattern"]) if not p.name.startswith("~$"))
        if not files:
            raise SystemExit(f"Geen bronbestand {m['pattern']} gevonden in {DATA}")
        f = files[-1]
        d = re.match(r"(\d{4})_(\d{2})_(\d{2})_", f.name)
        if not d:
            raise SystemExit(f"{f.name}: bestandsnaam moet beginnen met JJJJ_MM_DD_ (bv. 2026_08_14_{m['pattern'][2:]})")
        HORIZONS[hz] = {"label": m["label"], "omschrijving": m["omschrijving"], "file": f.name,
                        "peildatum": f"{d.group(1)}-{d.group(2)}-{d.group(3)}"}


def peildatum() -> str:
    return max(h["peildatum"] for h in HORIZONS.values())


SHEETS = {"FS4 Nieuwbouw": "nieuwbouw", "FS4 Renovatie": "renovatie"}
SSI_SHEETS = {"kt": "SSI KTP", "lt": "SSI MJP"}
HEADER = ["Woonproject", "Verrichting", "Initiatiefnemers", None, "Provincie", "Gemeente", "Projectomschrijving",
          "Datum Beslissing", "Huur", "Extra info", "Type", "Kostprijs", "Maximumprijs VMSW", "Bedrag UP"]
SSI_HEADER = ["Woonproject", "Identificatie", "Initiatiefnemers", None, "Provincie", "Gemeente",
              "Projectomschrijving", "Datum Beslissing", "Huur", "Koop", "FS4", "SSI"]
SSI_HEADERS = {
    "kt": SSI_HEADER,
    "lt": ["Woonproject", "Identificatie", "Initiatiefnemers", None, "Provincie", "Gemeente",
           "Projectomschrijving", "Datum Beslissing", "Huur", "Koop", "Bedrag UP", None],
}
TYPES = {
    "NB": "Nieuwbouw",
    "VVP": "Vervangingsbouw verworven patrimonium",
    "RVP": "Renovatie verworven patrimonium",
    "GW": "Aankoop goede woning",
    "VEP": "Vervangingsbouw eigen patrimonium",
    "REP": "Renovatie eigen patrimonium",
    "ONBEKEND": "Type niet vermeld in de bron",
}
CATEGORIES = {
    "nieuwbouw": "Nieuwbouw",
    "vervangingsbouw": "Vervangingsbouw",
    "renovatie": "Renovatie",
    "ssi": "SSI (Subsidie Sloop en Infrastructuur)",
}
COUNT_BANDS = [
    (0, "Geen huurwoningen"),
    (10, "1–10"),
    (25, "11–25"),
    (50, "26–50"),
    (float("inf"), "Meer dan 50"),
]
COST_BANDS = [
    (1_000_000, "Minder dan €1 mln"),
    (5_000_000, "€1–5 mln"),
    (10_000_000, "€5–10 mln"),
    (float("inf"), "Meer dan €10 mln"),
]
EXCLUDED_PROCEDURES = ("raamcontract",)
PLAATSINGEN = ["Reguliere procedure", "CBO", "D&B"]  # CBO en D&B blijven volledig gescheiden; varianten per jaar worden samengenomen


def plaatsing_of(procedure: str | None) -> str:
    p = (procedure or "").casefold()
    if "cbo" in p:
        return "CBO"
    if "d&b" in p or "design & build" in p:
        return "D&B"
    return PLAATSINGEN[0]
PROVINCE_FIX = {"LIMBUG": "LIMBURG"}
NO_MUNI = {"geen": "Gemeente niet gespecificeerd", "meerdere": "Meerdere gemeenten"}

report: list[str] = []  # regels voor het kwaliteitsrapport


def num(v, where: str) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("€", "").replace("\xa0", "").replace(" ", "").strip()
    if s in ("-", ""):
        return None
    if re.fullmatch(r"-?[\d.]+,\d+|-?[\d.]+", s):
        return float(s.replace(".", "").replace(",", "."))
    raise SystemExit(f"Onleesbaar getal {v!r} bij {where}")


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def work_category(group: str, typ: str) -> str:
    if typ in {"VVP", "VEP"}:
        return "vervangingsbouw"
    if typ in {"RVP", "REP"}:
        return "renovatie"
    return group


def is_included(record: dict) -> bool:
    if record["type"] == "GW":
        return False
    procedure = (record["procedure"] or "").casefold()
    return not any(excluded in procedure for excluded in EXCLUDED_PROCEDURES)


def count_band(value: float | None) -> str:
    if value is None:
        return "Niet vermeld"
    if value <= 0:
        return COUNT_BANDS[0][1]
    return next(label for upper, label in COUNT_BANDS[1:] if value <= upper)


def cost_band(value: float | None) -> str:
    if value is None:
        return "Niet beschikbaar in bron"
    if value < COST_BANDS[0][0]:
        return COST_BANDS[0][1]
    return next(label for upper, label in COST_BANDS[1:] if value <= upper)


def resolve_location(initiators: str, province: str, municipality: str | None, description: str,
                     fixes: list[dict], aliases: dict, idx: dict, where: str,
                     fallback_wm: str | None = None) -> tuple[str, str | None, str, str]:
    wm = fallback_wm or wm_for(initiators, aliases, where)
    fixed_reason = None
    for fx in fixes:
        if fx["initiatiefnemer"] and norm(fx["initiatiefnemer"]) in norm(initiators or "") \
                and fx["omschrijving_bevat"].lower() in description.lower():
            municipality, fixed_reason = fx["gemeente_correct"], fx["reden"]
    if municipality is None:
        status = "geen"
        nis = None
    elif "/" in municipality:
        status = "meerdere"
        nis = None
    elif norm(municipality) in idx and len(idx[norm(municipality)]) == 1:
        status = "ok"
        nis = idx[norm(municipality)][0]["nis"]
    else:
        raise SystemExit(f"Gemeente {municipality!r} niet gevonden of dubbelzinnig ({where})")

    province_src = PROVINCE_FIX.get((province or "").strip(), (province or "").strip())
    prov = province_of(nis) if nis else province_src
    if nis and province_src != prov and not fixed_reason:
        report.append(f"- {where}: provincie afgeleid uit de gemeente.")
    if fixed_reason:
        report.append(f"- {where}: gemeente gecorrigeerd. {fixed_reason}")
    return wm, nis, status, prov


def strip_prefix(n: str) -> str:
    """'woonmaatschappijdenderzuid' en 'wmdenderzuid' -> 'denderzuid' (n is al genormaliseerd)."""
    for pre in ("woonmaatschappij", "wm"):
        if n.startswith(pre) and len(n) > len(pre) + 2:
            return n[len(pre):]
    return n


AUTO_MATCHED: set[str] = set()


def load_reference():
    legend = {l["id"]: l for l in json.loads((REF / "pdf_extract/legend.json").read_text(encoding="utf-8"))}
    aliases = {norm(r["alias"]): r["wm_id"] for r in read_csv(REF / "wm_aliases.csv")}
    for wid, l in legend.items():  # naamvarianten van de legende zelf worden automatisch herkend
        for k in (norm(l["naam"]), strip_prefix(norm(l["naam"]))):
            aliases.setdefault(k, wid)
    unknown_ids = set(aliases.values()) - set(legend)
    if unknown_ids:
        raise SystemExit(f"wm_aliases.csv verwijst naar onbekende id's: {unknown_ids}")
    return legend, aliases, read_csv(REF / "gemeente_fixes.csv"), read_csv(REF / "gemeente_wm_overrides.csv")


def wm_for(name: str, aliases: dict, where: str) -> str:
    n = norm(name or "")
    if n in aliases:
        return aliases[n]
    if strip_prefix(n) in aliases:  # bv. "Woonmaatschappij X" in de bron en "WM X" in de legende
        AUTO_MATCHED.add(f"{name} -> {aliases[strip_prefix(n)]}")
        return aliases[strip_prefix(n)]
    # "Wonen in Limburg - Kantoor X (Koop)" en dergelijke
    for a, wid in aliases.items():
        if a and n.startswith(a):
            return wid
    raise SystemExit(f"Onbekende initiatiefnemer {name!r} ({where}); voeg toe aan reference/wm_aliases.csv")


def read_horizon(hz: str, legend, aliases, fixes, idx):
    wb = openpyxl.load_workbook(DATA / HORIZONS[hz]["file"], data_only=True)
    records, totals = [], defaultdict(lambda: defaultdict(float))
    text_adj = defaultdict(lambda: defaultdict(float))  # tekstcellen die de SUM van het blad overslaat
    for sheet, group in SHEETS.items():
        ws = wb[sheet]
        header = [c.value for c in ws[4]][:14]
        if header != HEADER:
            raise SystemExit(f"{hz}/{sheet}: onverwachte kolomkoppen {header}")
        for rown, r in enumerate(ws.iter_rows(min_row=5, max_col=14, values_only=True), start=5):
            where = f"{hz}/{sheet}/rij {rown}"
            if not r[0] and not r[2]:
                # totaalrij (formule): bewaren voor de controle
                if r[8] is not None:
                    for k, c in (("huur", 8), ("kostprijs", 11), ("maximumprijs_vmsw", 12), ("bedrag_up", 13)):
                        v = num(r[c], where)
                        if v is not None:  # niet elk veld heeft een som in de totaalrij
                            totals[group][k] += v
                continue
            initiators = (r[2] or "").strip()
            for k, c in (("huur", 8), ("kostprijs", 11), ("maximumprijs_vmsw", 12), ("bedrag_up", 13)):
                if isinstance(r[c], str) and num(r[c], where) is not None:
                    text_adj[group][k] += num(r[c], where)
                    report.append(f"- {where}: een financiële broncel staat als tekst; meegenomen in de broncontrole.")
            gem_raw = r[5].strip() if isinstance(r[5], str) else None
            omschr = (r[6] or "").strip()
            wm, nis, status, prov = resolve_location(
                initiators, r[4], gem_raw, omschr, fixes, aliases, idx, where
            )

            typ = (r[10] or "").strip() or "ONBEKEND"
            if typ not in TYPES:
                raise SystemExit(f"Onbekend type {typ!r} ({where})")
            d = r[7]
            procedure = (r[9] or "").strip() or None if isinstance(r[9], str) else None
            records.append({
                "horizon": hz, "groep": group, "wm": wm, "nis": nis, "status": status,
                "categorie": work_category(group, typ),
                "gemeente_label": NO_MUNI.get(status) if status != "ok" else None,
                "provincie": prov, "type": typ,
                "huur": num(r[8], where), "kostprijs": num(r[11], where),
                "maximumprijs_vmsw": num(r[12], where), "bedrag_up": num(r[13], where),
                "datum": d.date().isoformat() if isinstance(d, datetime) else None,
                "omschrijving": omschr, "procedure": procedure, "plaatsing": plaatsing_of(procedure),
                "initiatiefnemer_bron": initiators,
            })
            if typ == "ONBEKEND":
                report.append(f"- {where}: geen type in de bron; opgenomen onder de broncategorie.")
            if status != "ok":
                report.append(f"- {where}: {NO_MUNI[status].lower()}; staat niet op de kaart.")
    # verwacht totaal = bladtotaal + tekstcellen die het blad zelf niet meetelt
    expected = {g: {k: v + text_adj[g].get(k, 0.0) for k, v in t.items()} for g, t in totals.items()}
    return records, expected


def read_ssi(hz: str, aliases: dict, fixes: list[dict], idx: dict) -> list[dict]:
    wb = openpyxl.load_workbook(DATA / HORIZONS[hz]["file"], data_only=True)
    sheet = SSI_SHEETS[hz]
    if sheet not in wb.sheetnames:
        raise SystemExit(f"{hz}: bronblad {sheet!r} ontbreekt")
    ws = wb[sheet]
    header = [c.value for c in ws[4]][:12]
    if header != SSI_HEADERS[hz]:
        raise SystemExit(f"{hz}/{sheet}: onverwachte kolomkoppen {header}")
    records = []
    for rown, r in enumerate(ws.iter_rows(min_row=5, max_col=12, values_only=True), start=5):
        if not r[0] and not r[2]:
            continue
        where = f"{hz}/{sheet}/rij {rown}"
        initiators = (r[2] or "").strip()
        description = (r[6] or "").strip()
        municipality = r[5].strip() if isinstance(r[5], str) else None
        wm, nis, status, prov = resolve_location(
            initiators, r[4], municipality, description, fixes, aliases, idx, where, fallback_wm="SSI"
        )
        records.append({
            "horizon": hz, "groep": "ssi", "wm": wm, "nis": nis, "status": status,
            "categorie": "ssi", "gemeente_label": NO_MUNI.get(status) if status != "ok" else None,
            "provincie": prov, "type": "SSI",
            "huur": num(r[8], where), "kostprijs": num(r[11] if hz == "kt" else r[10], where),
            "maximumprijs_vmsw": None, "bedrag_up": None,
            "datum": None, "omschrijving": "", "procedure": None, "plaatsing": PLAATSINGEN[0], "initiatiefnemer_bron": initiators,
        })
        if status != "ok":
            report.append(f"- {where}: {NO_MUNI[status].lower()}; staat niet op de kaart.")
    wb.close()
    return records


def public_record(record: dict) -> dict:
    return {
        "wm": record["wm"],
        "nis": record["nis"],
        "gemeente_label": record["gemeente_label"],
        "provincie": record["provincie"],
        "categorie": record["categorie"],
        "plaatsing": record["plaatsing"],
        "huur_categorie": count_band(record["huur"]),
        "kostprijs_categorie": cost_band(record["kostprijs"]),
    }


def aggregate_records(records: list[dict]) -> list[dict]:
    grouped = defaultdict(lambda: {"huur": 0.0, "kostprijs": 0.0, "has_cost": False})
    for record in records:
        key = (
            record["wm"], record["nis"], record["status"], record["provincie"],
            record["categorie"], record["plaatsing"],
        )
        values = grouped[key]
        values["huur"] += record["huur"] or 0
        if record["kostprijs"] is not None:
            values["kostprijs"] += record["kostprijs"]
            values["has_cost"] = True
    result = []
    for key, values in sorted(grouped.items(), key=lambda item: tuple(str(v) for v in item[0])):
        wm, nis, status, province, category, plaatsing = key
        result.append(public_record({
            "wm": wm,
            "nis": nis,
            "gemeente_label": NO_MUNI.get(status) if status != "ok" else None,
            "provincie": province,
            "categorie": category,
            "plaatsing": plaatsing,
            "huur": values["huur"],
            "kostprijs": values["kostprijs"] if values["has_cost"] else None,
        }))
    return result


def municipality_bands(records: list[dict], municipalities: list[dict]) -> list[dict]:
    grouped = defaultdict(lambda: {"huur": 0.0, "kostprijs": 0.0, "has_cost": False})
    for record in records:
        if not record["nis"]:
            continue
        target = grouped[record["nis"]]
        target["huur"] += record["huur"] or 0
        if record["kostprijs"] is not None:
            target["kostprijs"] += record["kostprijs"]
            target["has_cost"] = True
    names = {m["nis"]: m["naam"] for m in municipalities}
    return [
        {
            "nis": nis,
            "naam": names[nis],
            "huur_categorie": count_band(values["huur"]),
            "kostprijs_categorie": cost_band(values["kostprijs"] if values["has_cost"] else None),
        }
        for nis, values in sorted(grouped.items())
    ]


def check_totals(hz, records, totals):
    """Totalen uit de bladen (totaalrij, plus tekstcellen die het blad niet meetelt) moeten kloppen met onze som."""
    lines = []
    for group, t in totals.items():
        for k, expected in t.items():
            got = sum((r[k] or 0) for r in records if r["groep"] == group)
            ok = abs(got - expected) < 1.0
            lines.append((hz, group, k, expected, got, ok))
            if not ok:
                raise SystemExit(f"Totaal {hz}/{group}/{k}: blad {expected} <> ingelezen {got}")
    return lines


def resolve_gemeente_wm(munis, legend, overrides, labels, data_by_nis):
    """Werkingsgebied per gemeente: override > PDF-kleur > planningsdata. Geeft ook de reviewlijst."""
    ov = {o["nis"]: o for o in overrides}
    pdf = defaultdict(list)
    for r in labels:
        pdf[r["nis"]].append(r)
    out, review = [], []
    for m in munis:
        nis = m["nis"]
        data_wms = data_by_nis.get(nis, {})
        cand = pdf.get(nis, [])
        pdf_wms = {c["wm_id"] for c in cand}
        worst = max((float(c["afstand"]) for c in cand), default=None)
        reasons, source, wm = [], None, None
        if nis in ov:
            wm, source = ov[nis]["wm_id"], "override"
            reasons.append(f"override: {ov[nis]['reden']}")
        elif len(pdf_wms) == 1:
            wm, source = next(iter(pdf_wms)), "pdf"
            if worst is not None and worst > 4:
                reasons.append(f"onzekere kleurmatch (afstand {worst}, tweede keuze {cand[0]['tweede_wm_id']})")
        elif len(pdf_wms) > 1:
            reasons.append("fusiegemeente met verschillende kleuren op de kaart: " + ", ".join(sorted(pdf_wms)))
            top = max(data_wms, key=data_wms.get) if data_wms else None
            wm, source = (top, "data") if top else (sorted(pdf_wms)[0], "pdf")
        if wm is None:
            reasons.append("geen PDF-label en geen planningsdata")
        if wm and data_wms and wm not in data_wms and source != "override":
            reasons.append("planning noemt andere woonmaatschappij(en): " + ", ".join(sorted(data_wms)))
            if source == "pdf" and worst is not None and worst > 4 and len(data_wms) == 1:
                wm, source = next(iter(data_wms)), "data"
                reasons.append("kleurmatch onzeker en planning eenduidig: planning gekozen")
        out.append({"nis": nis, "naam": m["name"], "provincie": m["province"], "wm_id": wm, "bron": source})
        if reasons and source != "override":
            review.append({"nis": nis, "gemeente": m["name"], "gekozen_wm": wm, "bron": source,
                           "pdf_wm": "|".join(sorted(pdf_wms)), "kleurafstand": worst if worst is not None else "",
                           "planning_wm": "|".join(sorted(data_wms)), "reden": "; ".join(reasons),
                           "definitief_wm": ""})
    return out, review


DOWNLOAD_NAME = "sociaal-wonen-alle-gegevens.xlsx"
PROV_LABEL = {"ANTWERPEN": "Antwerpen", "LIMBURG": "Limburg", "OOST-VLAANDEREN": "Oost-Vlaanderen",
              "VLAAMS-BRABANT": "Vlaams-Brabant", "WEST-VLAANDEREN": "West-Vlaanderen"}
DOWNLOAD_COLUMNS = [
    "Planning", "Woonmaatschappij", "Provincie", "Gemeente", "Soort werken", "Plaatsingsprocedure",
    "Huurwoningen (categorie)", "Kostprijs (categorie)",
]


def build_download_xlsx(all_records: dict, wms: list, gemeenten: list) -> list[str]:
    """Maak een download met afzonderlijke maar niet-identificeerbare categorierijen."""
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.table import Table, TableStyleInfo

    wm_name = {w["id"]: w["naam"] for w in wms}
    gem_name = {g["nis"]: g["naam"] for g in gemeenten}
    rows = []
    for hz, recs in all_records.items():
        label = HORIZONS[hz]["label"]
        for r in recs:
            rows.append([
                label,
                wm_name.get(r["wm"], r["wm"]),
                PROV_LABEL.get(r["provincie"], r["provincie"]) or "Niet vermeld",
                (gem_name.get(r["nis"]) if r["nis"] else r["gemeente_label"]) or "Gemeente niet vermeld",
                CATEGORIES[r["categorie"]],
                r["plaatsing"],
                count_band(r["huur"]),
                cost_band(r["kostprijs"]),
            ])

    rows.sort(key=lambda x: (str(x[3]).casefold(), x[0], x[1], x[4], x[5]))  # per gemeente
    wb = openpyxl.Workbook()
    wb.properties.creator = "Embuild Vlaanderen"
    wb.properties.created = wb.properties.modified = datetime.fromisoformat(peildatum())  # herhaalbare metadata
    ws = wb.active
    ws.title = "Gegevens"
    ws.append(DOWNLOAD_COLUMNS)
    for r in rows:
        ws.append(r)
    last = len(rows) + 1
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3A5F")
        c.alignment = Alignment(wrap_text=True, vertical="center")
    for i, name in enumerate(DOWNLOAD_COLUMNS, start=1):
        letter = get_column_letter(i)
        width = min(60, max(len(name), *(len(str(r[i - 1] or "")) for r in rows)) + 2) if rows else len(name) + 2
        ws.column_dimensions[letter].width = width
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 32
    tab = Table(displayName="Gegevens", ref=f"A1:{get_column_letter(len(DOWNLOAD_COLUMNS))}{max(last, 2)}")
    tab.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=True)
    ws.add_table(tab)

    t = wb.create_sheet("Toelichting")
    lines = [
        ("Sociale woonprogrammatie: categorieën per verrichting", "titel"),
        (f"Bron: VMSW, KTP, MJP en SSI, peildatum {date.fromisoformat(peildatum()).strftime('%d.%m.%Y')}.", None),
        ("", None),
        ("Hoe verloopt de programmatie?", "kop"),
        ("De initiatiefnemer bereidt een project voor. Na de vereiste beleidstoetsen komt het op de projectenlijst; daarin worden de afzonderlijke verrichtingen beoordeeld.", None),
        ("Na advies over het voorontwerp kan een verrichting op de meerjarenplanning (MJP) komen. Die planning omvat verrichtingen waarvan uitvoering of plaatsingsprocedure binnen drie jaar kan starten.", None),
        ("Een aanbestedingsklaar dossier en omgevingsvergunning zijn voorwaarden voor opname op de korte termijnplanning (KTP), waar de start binnen acht maanden wordt verwacht.", None),
        ("Na de aanbesteding dient de woonmaatschappij een gunningsdossier in. Wonen in Vlaanderen kent vervolgens middelen uit het jaarbudget toe; de werken starten pas na die toewijzing.", None),
        ("De beoordelingscommissie adviseert en beslist onder meer over schrappingen en opnames in de korte termijnplanning. Opnames op MJP en KTP gebeuren ook doorlopend door Wonen in Vlaanderen.", None),
        ("SSI betekent Subsidie Sloop en Infrastructuur. De aparte SSI-tabbladen in de bron worden als eigen categorie verwerkt; als kostprijs geldt de kolom SSI uit het bronblad (voor de meerjarenplanning de enige bedragkolom, Bedrag UP).", None),
        ("KTP en MJP zijn verschillende fasen van de programmatie en worden niet bij elkaar opgeteld.", None),
        ("", None),
        ("Over deze gegevens", "kop"),
        ("Elke rij staat voor een afzonderlijke verrichting. Projectomschrijvingen, exacte aantallen en exacte bedragen worden niet opgenomen.", None),
        ("Soort werken: nieuwbouw, vervangingsbouw, renovatie (overige renovatie samengevoegd) of SSI. Aankoop goede woning en raamcontracten zijn niet opgenomen. CBO, D&B en RC-renovatie (enkel op de KTP) zijn wel opgenomen.", None),
        ("Plaatsingsprocedure: reguliere procedure, CBO of D&B. CBO en D&B worden volledig gescheiden gehouden; varianten per jaar (bv. CBO 2024-1) zijn samengenomen.", None),
        ("De rijen staan gesorteerd per gemeente, zodat alle verrichtingen van een gemeente bij elkaar staan.", None),
        ("Huurwoningen (categorie): 1–10, 11–25, 26–50 of meer dan 50 woningen.", None),
        ("Kostprijs (categorie): minder dan €1 mln, €1–5 mln, €5–10 mln of meer dan €10 mln. Andere kosten- en subsidiebedragen zijn niet opgenomen.", None),
        ("Provincie en gemeente zijn afgeleid uit de bronlocatie. Rijen zonder eenduidige gemeente krijgen een algemene locatielabel.", None),
    ]
    t.column_dimensions["A"].width = 120
    for text, kind in lines:
        t.append([text])
        c = t.cell(row=t.max_row, column=1)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if kind == "titel":
            c.font = Font(bold=True, size=14)
        elif kind == "kop":
            c.font = Font(bold=True, color="1F3A5F")
    OUT.mkdir(parents=True, exist_ok=True)
    wb.save(OUT / DOWNLOAD_NAME)
    old_zip = OUT / "sociaal-wonen-alle-gegevens.zip"
    if old_zip.exists():
        old_zip.unlink()  # vervangen door de xlsx
    return [f"{DOWNLOAD_NAME} bijgewerkt met gecategoriseerde gegevens."]


def write_json(name: str, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def maybe_extract_pdf():
    """Draait de PDF-extractie als de legende ontbreekt of de PDF nieuwer is."""
    legend = REF / "pdf_extract/legend.json"
    pdfs = sorted((DATA).glob("Woonmaatschappijen-in-kaart*.pdf"))
    if pdfs and (not legend.exists() or pdfs[-1].stat().st_mtime > legend.stat().st_mtime):
        print("Nieuwe PDF gevonden: werkingsgebieden worden opnieuw uitgelezen")
        r = subprocess.run([sys.executable, str(Path(__file__).with_name("extract_wm_pdf.py"))])
        if r.returncode:
            raise SystemExit("extract_wm_pdf.py faalde")


def main():
    find_sources()
    maybe_extract_pdf()
    for hz, h in HORIZONS.items():
        print(f"{hz.upper()}: {h['file']} (peildatum {h['peildatum']})")
    legend, aliases, fixes, overrides = load_reference()
    munis = build_current_municipalities()
    idx = name_index(munis)
    labels = read_csv(REF / "pdf_extract/labels_auto.csv")

    all_records: dict[str, list] = {}
    checks = []
    for hz in HORIZONS:
        fs4_records, totals = read_horizon(hz, legend, aliases, fixes, idx)
        checks += check_totals(hz, fs4_records, totals)
        source_records = fs4_records + read_ssi(hz, aliases, fixes, idx)
        all_records[hz] = [r for r in source_records if is_included(r)]
        print(f"{hz.upper()}: bronbladen gecontroleerd; gecategoriseerde records voorbereid.")

    # data-WM's per gemeente (voor kruiscontrole)
    data_by_nis: dict[str, Counter] = defaultdict(Counter)
    for recs in all_records.values():
        for r in recs:
            if r["nis"] and r["categorie"] != "ssi":
                data_by_nis[r["nis"]][r["wm"]] += r["huur"] or 1
    gemeenten, review = resolve_gemeente_wm(munis, legend, overrides, labels, data_by_nis)

    # Review-bestand met behoud van reeds ingevulde keuzes
    review_path = REF / "gemeente_wm_review.csv"
    previous = {r["nis"]: r for r in read_csv(review_path)} if review_path.exists() else {}
    for r in review:
        if r["nis"] in previous:
            r["definitief_wm"] = previous[r["nis"]].get("definitief_wm", "")
    with open(review_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(review[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(review)
    # definitieve keuzes van Gert winnen
    final = {r["nis"]: r["definitief_wm"] for r in review if r.get("definitief_wm")}
    for g in gemeenten:
        if g["nis"] in final:
            if final[g["nis"]] not in legend:
                raise SystemExit(f"definitief_wm {final[g['nis']]!r} onbekend voor {g['naam']}")
            g["wm_id"], g["bron"] = final[g["nis"]], "review"
    missing = [g["naam"] for g in gemeenten if not g["wm_id"]]
    if missing:
        raise SystemExit(f"Gemeenten zonder woonmaatschappij: {missing}")

    # woonmaatschappijen
    by_wm = defaultdict(list)
    for g in gemeenten:
        by_wm[g["wm_id"]].append(g["nis"])
    wms = []
    for wid, l in sorted(legend.items(), key=lambda kv: norm(kv[1]["naam"])):
        r, g, b = l["kleur"]
        wms.append({
            "id": wid, "naam": l["naam"], "url": l["url"],
            "werkingsgebied_label": l["werkingsgebied_label"], "provincie": l["provincie_legende"],
            "kleur": f"#{r:02x}{g:02x}{b:02x}", "gemeenten": sorted(by_wm.get(wid, [])),
        })

    # geometrie (huidige gemeenten) en provincies als SVG-paden, uit dezelfde bron zodat randen aansluiten
    proj = SvgProjector([m["geom"] for m in munis])
    map_munis = []
    for m in munis:
        cx, cy = proj.centroid(m["geom"])
        map_munis.append({"nis": m["nis"], "naam": m["name"], "provincie": m["province"], "d": proj.path(m["geom"]), "cx": cx, "cy": cy})
    map_provs = []
    for p in sorted({m["province"] for m in munis}):
        geom = unary_union([m["geom"].buffer(0.00005) for m in munis if m["province"] == p])
        map_provs.append({"naam": p, "d": proj.path(geom, tolerance=0.002)})
    write_json("map.json", {"width": proj.width, "height": proj.height,
                   "gemeenten": map_munis, "provincies": map_provs})

    # Publiceer alleen categorielabels; onderliggende bronwaarden blijven in deze ETL-stap.
    for hz, recs in all_records.items():
        write_json(f"{hz}_aggregated.json", {
            "horizon": hz,
            "peildatum": HORIZONS[hz]["peildatum"],
            "rijen": aggregate_records(recs),
        })
        write_json(f"{hz}_verrichtingen.json", {
            "horizon": hz,
            "peildatum": HORIZONS[hz]["peildatum"],
            "rijen": [public_record(r) for r in recs],
        })
        write_json(f"{hz}_municipalities.json", {
            "horizon": hz,
            "gemeenten": municipality_bands(recs, gemeenten),
        })
    for stale_name in ("kt_projects.json",):
        stale_file = OUT / stale_name
        if stale_file.exists():
            stale_file.unlink()

    write_json("woonmaatschappijen.json", wms)
    write_json("gemeenten.json", gemeenten)
    print("Download:", build_download_xlsx(all_records, wms, gemeenten)[0])

    write_json("meta.json", {
        "peildatum": peildatum(),
        "lastUpdated": date.today().isoformat(),
        "bron": f"VMSW, KTP, MJP en SSI sociale woonprogrammatie, {date.fromisoformat(peildatum()).strftime('%d.%m.%Y')}",
        "werkingsgebieden": "Woonmaatschappijen in kaart, januari 2025 (kleurafleiding uit PDF, zie reference/)",
        "horizons": {k: {"label": v["label"], "omschrijving": v["omschrijving"], "peildatum": v["peildatum"]} for k, v in HORIZONS.items()},
        "categories": CATEGORIES,
        "plaatsingen": PLAATSINGEN,
        "count_bands": [label for _, label in COUNT_BANDS],
        "cost_bands": [label for _, label in COST_BANDS] + ["Niet beschikbaar in bron"],
    })

    # kwaliteitsrapport
    lines = [
        "# Kwaliteitsrapport sociaal-wonen",
        "",
        f"Gegenereerd door `scripts/process_data.py`. Bronbestanden: {', '.join(h['file'] for h in HORIZONS.values())}.",
        "",
        "## Broncontrole",
        "",
        "De FS4-bladen zijn gecontroleerd tegen hun somrijen. De SSI-bladen zijn als afzonderlijke broncategorie ingelezen.",
        "",
        "## Beslissingen en aandachtspunten",
        "",
        "- SSI staat voor Subsidie Sloop en Infrastructuur; de SSI-tabbladen worden apart opgenomen. De kostprijs komt uit de kolom SSI van het bronblad.",
        "- Aankoop goede woning, CBO, D&B en raamcontracten zijn uitgesloten; RC-renovatie blijft opgenomen.",
        "- Vervangingsbouw is een aparte categorie; overige renovatievormen zijn samengevoegd.",
        "- Publieke uitvoer bevat geen projectomschrijving, exacte aantallen of exacte bedragen.",
        "- Provincie is afgeleid uit de gemeente (NIS), niet uit de bronkolom.",
        "",
        "## Rij-specifieke opmerkingen",
        "",
    ] + (sorted(set(report)) or ["- geen"])
    (REF / "kwaliteitsrapport.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if AUTO_MATCHED:
        print("Automatisch gekoppelde naamvarianten (controleer eventueel):", "; ".join(sorted(AUTO_MATCHED)))
    print(f"Gemeenten: {len(gemeenten)}, bronnen: {dict(Counter(g['bron'] for g in gemeenten))}")
    print(f"Review-lijst: {len(review)} gemeenten (reference/gemeente_wm_review.csv)")
    print("Totalen kloppen met de bladen:", all(c[-1] for c in checks))


def source_state() -> dict:
    return {p.name: p.stat().st_mtime for p in list(DATA.glob("*.xlsx")) + list(DATA.glob("*.pdf")) if not p.name.startswith("~$")}


def run_once() -> bool:
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            print(f"\nVerwerking gestopt: {e.code}", file=sys.stderr)
            return False
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("validate_public_data.py"))])
    return r.returncode == 0


if __name__ == "__main__":
    if "--watch" in sys.argv:
        # Verwerkt automatisch zodra een nieuwe of gewijzigde xlsx/pdf in data/ verschijnt.
        sys.stdout.reconfigure(line_buffering=True)
        print(f"Bewaakt {DATA} (Ctrl+C om te stoppen)")
        seen = {}
        while True:
            now = source_state()
            if now != seen:
                time.sleep(2)  # wacht tot het kopieren klaar is
                seen = source_state()
                print(f"\n[{datetime.now():%H:%M:%S}] wijziging gevonden, verwerken...")
                ok = run_once()
                print("Klaar, alles in orde." if ok else "Mislukt: zie de melding hierboven. Pas aan en sla opnieuw op.")
            time.sleep(3)
    else:
        sys.exit(0 if run_once() else 1)
