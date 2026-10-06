#!/usr/bin/env python3
"""Controleert public/data/ voor publicatie. Draait als prebuild en in CI. Leest enkel de gecommitte JSON,
niet de ruwe xlsx (die staan niet in git).

Privacy:  projectvelden mogen enkel voorkomen in kt_projects.json (beslissing: LT enkel geaggregeerd).
Kwaliteit: referenties kloppen, totalen kloppen, elke gemeente heeft een woonmaatschappij met website.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

XLSX_NAME = "sociaal-wonen-alle-gegevens.xlsx"
DATA = Path(__file__).resolve().parents[1] / "public/data"
EXPECTED = {"meta.json", "woonmaatschappijen.json", "gemeenten.json", "kt_aggregated.json", "lt_aggregated.json",
            "kt_projects.json", "map.json", XLSX_NAME}
PROJECT_FILES = {"kt_projects.json"}
# velden die een project identificeren of beschrijven
PROJECT_KEYS = {"projectomschrijving", "omschrijving", "projectnaam", "datum_beslissing",
                "woonproject", "verrichting", "identificatie"}
# interne dossier-ID's mogen nergens gepubliceerd worden
NEVER_KEYS = {"woonproject", "verrichting", "identificatie", "dossier", "dossiernummer"}
FIELDS = ("huur", "kostprijs", "maximumprijs_vmsw", "bedrag_up")

errors: list[str] = []


def err(msg: str):
    errors.append(msg)


def walk_keys(obj, found: set):
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k.lower())
            walk_keys(v, found)
    elif isinstance(obj, list):
        for v in obj:
            walk_keys(v, found)


def check_xlsx():
    """De download is een tidy xlsx. Geen dossier-ID's, en LT (geen projectniveau) enkel geaggregeerd."""
    import openpyxl
    wb = openpyxl.load_workbook(DATA / XLSX_NAME, read_only=True, data_only=True)
    if wb.sheetnames != ["Gegevens", "Toelichting"]:
        err(f"{XLSX_NAME}: verwacht bladen Gegevens en Toelichting, gevonden {wb.sheetnames}")
        return
    rows = list(wb["Gegevens"].iter_rows(values_only=True))
    header = [str(h) for h in rows[0]]
    bad = {h for h in header if h.strip().lower() in NEVER_KEYS}
    if bad:
        err(f"{XLSX_NAME}: verboden kolommen {sorted(bad)}")
    for need in ("Planning", "Niveau", "Projectomschrijving", "Datum opname programmatie", "Huurwoningen", "Kostprijs (EUR)"):
        if need not in header:
            err(f"{XLSX_NAME}: kolom {need} ontbreekt")
            return
    ix = {h: i for i, h in enumerate(header)}
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    project_labels = {meta["horizons"][h]["label"] for h in meta["projectdetails_horizons"]}
    sums: dict[str, list[float]] = {}
    for r in rows[1:]:
        planning = r[ix["Planning"]]
        project_level = planning in project_labels
        if r[ix["Niveau"]] != ("Project" if project_level else "Geaggregeerd"):
            err(f"{XLSX_NAME}: onverwacht niveau {r[ix['Niveau']]!r} bij {planning}")
        if not project_level and (r[ix["Projectomschrijving"]] or r[ix["Datum opname programmatie"]]):
            err(f"{XLSX_NAME}: {planning} bevat projectdetails")
        s = sums.setdefault(planning, [0, 0])
        s[0] += r[ix["Huurwoningen"]] or 0
        s[1] += r[ix["Kostprijs (EUR)"]] or 0
    ctl = meta["controletotalen"]
    for hz, h in meta["horizons"].items():
        huur = sum(v for k, v in ctl.items() if k.startswith(f"{hz}.") and k.endswith(".huur"))
        kost = sum(v for k, v in ctl.items() if k.startswith(f"{hz}.") and k.endswith(".kostprijs"))
        got = sums.get(h["label"], [0, 0])
        if abs(got[0] - huur) > 1 or abs(got[1] - kost) > 5:
            err(f"{XLSX_NAME}: totalen {h['label']} wijken af (huur {got[0]} vs {huur}, kostprijs {got[1]} vs {kost})")


def main() -> int:
    if not DATA.exists():
        print("public/data ontbreekt; draai eerst scripts/process_data.py", file=sys.stderr)
        return 1
    files = {p.name for p in DATA.glob("*.json")} | ({XLSX_NAME} if (DATA / XLSX_NAME).exists() else set())
    for name in sorted(EXPECTED - files):
        err(f"ontbrekend bestand: {name}")
    for name in sorted(files - EXPECTED):
        err(f"onverwacht bestand in public/data: {name} (projectdata mag enkel in kt_projects.json)")
    if errors:
        return report()
    check_xlsx()
    files = {f for f in files if f.endswith(".json")}  # de xlsx is hierboven apart gecontroleerd

    load = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))  # noqa: E731
    meta, wms, gem = load("meta.json"), load("woonmaatschappijen.json"), load("gemeenten.json")
    kt, lt, ktp = load("kt_aggregated.json"), load("lt_aggregated.json"), load("kt_projects.json")
    geo = load("map.json")

    # privacy
    if meta.get("projectdetails_horizons") != ["kt"]:
        err(f"meta.projectdetails_horizons moet ['kt'] zijn, is {meta.get('projectdetails_horizons')}")
    for name in sorted(files - {"meta.json"}):  # meta beschrijft veldnamen, bevat zelf geen projectdata
        keys: set = set()
        walk_keys(load(name), keys)
        if name in PROJECT_FILES:
            bad = keys & NEVER_KEYS
        else:
            bad = keys & PROJECT_KEYS
        if bad:
            err(f"{name}: verboden velden {sorted(bad)}")
    texts = {p["projectomschrijving"] for p in ktp["projecten"] if len(p["projectomschrijving"]) >= 8}
    for name in sorted(files - PROJECT_FILES):
        raw = (DATA / name).read_text(encoding="utf-8")
        leaked = [t for t in texts if t in raw]
        if leaked:
            err(f"{name}: bevat projectomschrijvingen uit KT ({len(leaked)}), bv. {leaked[0]!r}")

    # referenties
    wm_ids = {w["id"] for w in wms}
    if len(wms) != 41:
        err(f"verwacht 41 woonmaatschappijen, gevonden {len(wms)}")
    for w in wms:
        if not str(w.get("url", "")).startswith(("http://", "https://")):
            err(f"{w['id']}: geen geldige website")
    geo_nis = {f["nis"] for f in geo["gemeenten"]}
    if len(geo["provincies"]) != 5:
        err(f"verwacht 5 provincies in map.json, gevonden {len(geo['provincies'])}")
    gem_nis = {g["nis"] for g in gem}
    if geo_nis != gem_nis:
        err(f"gemeenten.json en geometrie verschillen: {sorted(geo_nis ^ gem_nis)[:5]}")
    for g in gem:
        if g["wm_id"] not in wm_ids:
            err(f"gemeente {g['naam']}: onbekende woonmaatschappij {g['wm_id']!r}")
    for label, agg in (("kt", kt), ("lt", lt)):
        for r in agg["rijen"]:
            if r["wm"] not in wm_ids:
                err(f"{label}: onbekende woonmaatschappij {r['wm']!r}")
            if r["nis"] and r["nis"] not in geo_nis:
                err(f"{label}: NIS {r['nis']} niet in geometrie")
            if not r["nis"] and not r["gemeente_label"]:
                err(f"{label}: rij zonder NIS en zonder label ({r['wm']})")
    for p in ktp["projecten"]:
        if p["wm"] not in wm_ids or (p["nis"] and p["nis"] not in geo_nis):
            err(f"kt_projects: verwijzing niet in orde ({p['wm']}, {p['nis']})")

    # totalen
    ctrl = meta["controletotalen"]
    for hz, agg in (("kt", kt), ("lt", lt)):
        for groep in ("nieuwbouw", "renovatie"):
            for f in FIELDS:
                got = sum(r[f] for r in agg["rijen"] if r["groep"] == groep)
                exp = ctrl[f"{hz}.{groep}.{f}"]
                if abs(got - exp) > 5:
                    err(f"{hz}.{groep}.{f}: aggregaat {got} <> controletotaal {exp}")
    for f in ("huur", "kostprijs"):
        a = sum(r[f] for r in kt["rijen"])
        b = sum((p[f] or 0) for p in ktp["projecten"])
        if abs(a - b) > 5:
            err(f"kt_projects.{f} ({b}) komt niet overeen met kt_aggregated ({a})")

    return report()


def report() -> int:
    if errors:
        print("validate_public_data: FOUT")
        for e in errors:
            print(" -", e)
        return 1
    print("validate_public_data: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
