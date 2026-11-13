#!/usr/bin/env python3
"""Controle van alle cijfers in het GIP-document tegen de brondocumenten.

Gebruik: python3 controle_gip_document.py <document.docx> <uitvoer.xlsx>

Per getal: context uit de tekst, het getal, het brondocument, de pagina, het
bronfragment en een directe link (pagina-anker) naar de PDF. Cijfers die berekend
zijn, worden onafhankelijk herberekend uit de brondata (results/*.json).
"""
import json, re, subprocess, sys, zipfile
from pathlib import Path
from urllib.parse import quote
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

BASE = Path("/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/apps/gip-projecten")
SRC = BASE / "bronnen"
RES = BASE / "results"
DOCX, OUT = Path(sys.argv[1]), Path(sys.argv[2])

DOCS = {
    "M":  ("Mededeling GIP 2026 (VR 22 mei 2026)", "VR 2026 2205 MED.0202-1 GIP MOW 2026 - mededeling BIS.pdf"),
    "T26": ("GIP-tabel 2026", "VR_2026 2025_1407_MED.0277-4_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_g3zk8e.pdf"),
    "T25": ("GIP-tabel 2025-2027", "VR_2025_1407_MED.0277-4_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_g3zk8e.pdf"),
    "GP": ("Bijlage Grote Projecten (14 juli 2025)", "3_-_BIJLAGE_-_GIP_-_Grote_Projecten_yvc7un.pdf"),
    "R":  ("Verslag Rekenhof (juni 2026)", "2026_27_GIP.pdf"),
    "K":  ("Commissieverslag over het Rekenhofverslag (9 sept 2026)", "het Rekenhof over het Geïntegreerd Investeringsprogramma (GIP).pdf"),
    "Q":  ("Schriftelijke vraag 1666 met antwoord", "Geïntegreerd investeringsprogramma (GIP) 2027-2031 - Geactualiseerde projectfiches.pdf"),
    "V":  ("Vraag om uitleg 4295, commissie 11 juni 2026", "over de oproep van Embuild Vlaanderen om bijkomend te investeren in mobiliteitsinfrastructuur.pdf"),
    "N25": ("GIP-nota 2025-2029 (14 juli 2025)", "VR_2025_1407_MED.0277-2_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_agvt6z-2.pdf"),
}

def norm(t):
    t = t.replace("­", "")
    t = re.sub(r"-\s*\n\s*", "", t)
    return re.sub(r"\s+", " ", t)

PAGES = {}
for k, (_, f) in DOCS.items():
    raw = subprocess.run(["pdftotext", "-layout", str(SRC / f), "-"], capture_output=True, text=True).stdout
    PAGES[k] = [norm(p) for p in raw.split("\f")]

def link(k, page):
    return "file://" + quote(str(SRC / DOCS[k][1])) + f"#page={page}"

def find(k, rx):
    r = re.compile(rx, re.I)
    for i, p in enumerate(PAGES[k], 1):
        m = r.search(p)
        if m:
            s = max(0, m.start() - 90); e = min(len(p), m.end() + 90)
            return i, "..." + p[s:e] + "..."
    return None, ""

# ---------- tekst uit het document ----------
x = zipfile.ZipFile(DOCX).read("word/document.xml").decode()
def txt(p):
    t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
    return t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&apos;", "'").strip()
DATA_HEADS = ("Programma (mio", "Programma, budget", "Project (mio")
paras, tables = [], []
for blk in re.split(r"(<w:tbl>.*?</w:tbl>)", x, flags=re.S):
    if blk.startswith("<w:tbl>"):
        first = txt(re.search(r"<w:p[ >].*?</w:p>", blk, re.S).group())
        if first.startswith(DATA_HEADS):
            rows = [[txt(c) for c in re.findall(r"<w:tc>.*?</w:tc>", r, re.S)] for r in re.findall(r"<w:tr[ >].*?</w:tr>", blk, re.S)]
            tables.append((first, rows)); continue
    paras += [t for t in (txt(p) for p in re.findall(r"<w:p[ >].*?</w:p>", blk, re.S)) if t]
units, i = [], 0
while i < len(paras):
    if re.fullmatch(r"[-+]?\d[\d.,]*%?", paras[i]) and i + 1 < len(paras):
        units.append(paras[i] + " " + paras[i + 1]); i += 2
    else:
        units.append(paras[i]); i += 1

def context(anchor, token):
    for p in units:
        if anchor in p:
            for s in re.split(r"(?<=[.!?])\s+", p):
                if token in s:
                    return s
            return p
    return None

# ---------- brondata ----------
o = json.load(open(RES / "gip_data_2025.json")); n = json.load(open(RES / "gip_data_2026.json"))
def line(d, name, y): return sum(p[y] for p in d["projects"] if p["project"] == name) / 1e6
def prog(d, y): return {p["name"]: p[y] / 1e6 for p in d["programSummary"]}
OW = "Oosterweel Kanaaltunnels & R1"; LF = "Leefbaarheid - fase II"
O26, N26 = prog(o, "budget2026"), prog(n, "budget2026")
O26["Grote werken in het wegennet"] -= line(o, OW, "budget2026"); N26["Grote werken in het wegennet"] -= line(n, OW, "budget2026")
O26["Duurzaam personenvervoer en modal shift"] -= line(o, LF, "budget2026"); N26["Duurzaam personenvervoer en modal shift"] -= line(n, LF, "budget2026")
diff = {k: N26.get(k, 0) - O26.get(k, 0) for k in set(O26) | set(N26)}
tot = {y: o["metadata"]["by_year"][y] / 1e6 for y in ("2025", "2026", "2027")}; tot_n = n["metadata"]["total_budget"] / 1e6
ex_o = line(o, OW, "budget2026") + line(o, LF, "budget2026"); ex_n = line(n, OW, "budget2026") + line(n, LF, "budget2026")
comp_o, comp_n = tot["2026"] - ex_o, tot_n - ex_n
gp = [b for b in o["bigProjects"] if b["level"] == "project"]
yrs = [str(y) for y in range(2025, 2041)]
bt = {y: sum(b["impact_mio"][y] for b in gp) for y in yrs}
capex = sum(b["total_mio"] for b in gp)
cum = sum(bt.values()); cum_early = sum(bt[y] for y in yrs[:5])
M_list_count = None
mp = PAGES["M"][1] + " " + PAGES["M"][2]
seg = mp[mp.find("Hiervoor wordt in het GIP 2026"):mp.find("Budgetten die nodig zijn voor dringende")]
M_list_count = len(re.findall(r" - ", seg))

rows_out = []  # (sectie, context, getal, type, doc, pagina, fragment, link, status, opmerking)
def add(sec, anchor, token, typ, doc, page, frag, status, note="", doc2=None, rx2=None):
    ctx = context(anchor, token) or ("(anker niet gevonden in document: %s)" % anchor)
    st = status if context(anchor, token) else "⚠ context ontbreekt"
    l2 = lab2 = ""
    if doc2:
        p2, _ = find(doc2, rx2)
        if p2:
            l2, lab2 = link(doc2, p2), f"{DOCS[doc2][0]}, p. {p2}"
    rows_out.append((sec, ctx, token, typ, DOCS[doc][0] if doc else "Herberekend uit brondata", page, frag, link(doc, page) if doc and page else "", st, note, lab2, l2))

def L(sec, anchor, token, doc, rx, note=""):
    p, f = find(doc, rx)
    add(sec, anchor, token, "Letterlijk in bron", doc, p, f, "✔ gevonden" if p else "⚠ niet gevonden", note)

DEFAULT_SRC = {
    "216": ("T26", r"Oosterweel Kanaaltunnels & R1", "T25", r"Oosterweel Kanaaltunnels & R1"),
    "-216": ("T26", r"Oosterweel Kanaaltunnels & R1", "T25", r"Oosterweel Kanaaltunnels & R1"),
    "9,5%": ("T26", r"Oosterweel Kanaaltunnels & R1", "T25", r"Oosterweel Kanaaltunnels & R1"),
    "2.052": ("T26", r"Oosterweel Kanaaltunnels & R1", "T26", r"Leefbaarheid - fase II"),
    "2.268": ("T25", r"Oosterweel Kanaaltunnels & R1", "T25", r"Leefbaarheid - fase II"),
    "220": ("M", r"2\.004\.315 duizend euro", "T25", r"Oosterweel algemeen"),
    "-104": ("T26", r"personenvervoer", "T25", r"personenvervoer"),
    "-75": ("R", r"Regulier onderhoud behoort niet tot de scope van het GIP", "T25", r"Regulier onderhoud"),
    "-25": ("T26", r"zeehavens", "T25", r"zeehavens"),
    "ruim 1,6 miljard": ("T26", r"Oosterweel Kanaaltunnels & R1", "M", r"638 miljoen euro voor leefbaarheidsprojecten"),
    "7,5 miljard": ("T25", r"2\.501\.074\.896", "T25", r"2\.585\.429\.280"),
    "1,3 miljard": ("T26", r"3\.685\.246\.893", "T25", r"2\.423\.646\.67"),
    "+35": ("T26", r"Asset Management", "T25", r"Asset Management"),
    "+19": ("T26", r"luchthavens", "T25", r"luchthavens"),
    "12%": ("GP", r"Werken aan de Ring R0", None, None),
    "16,0": ("GP", r"Werken aan de Ring R0", None, None),
    "200": ("R", r"Regulier onderhoud behoort niet tot de scope van het GIP", "T26", r"personenvervoer"),
}
def D(sec, anchor, token, value, expected, tol, desc, doc=None, rx=None, note="", doc2=None, rx2=None):
    ok = abs(value - expected) <= tol
    p, f = (find(doc, rx) if doc else (None, ""))
    if not p and token in DEFAULT_SRC:
        doc, rx, doc2, rx2 = DEFAULT_SRC[token]
        p, f = find(doc, rx)
    add(sec, anchor, token, "Berekend", doc if p else None, p, (f + " || " if f else "") + desc if f else desc, "✔ herberekend" if ok else "⚠ AFWIJKING (berekend %s)" % round(value, 2), note or desc, doc2, rx2)

S1, S2, S3, S4, S5, S6, S7, S8 = "Samenvatting", "Context", "Investeringen tot 2028", "Update 2026", "Doorkijk 2040", "Rekenhof", "Parlement", "Conclusies"
A1 = "Voor 2026 is er ongeveer 216"
# Samenvatting
D(S1, A1, "216", comp_o - comp_n, 216, 0.5, f"{comp_o:.1f} (versie 2025) min {comp_n:.1f} (versie 2026), beide zonder Oosterweel Kanaaltunnels en Leefbaarheid fase II")
D(S1, A1, "9,5%", (comp_o - comp_n) / comp_o * 100, 9.5, 0.05, "216 / 2.268", note="Procentueel verschil op vergelijkbare basis")
L(S1, "Op 14 juli 2025 keurde", "14 juli 2025", "M", r"Op 14 juli 2025 werd een eerste GIP 2025-2027 goedgekeurd")
L(S1, "Op 14 juli 2025 keurde", "2025 tot en met 2027", "M", r"GIP 2025-2027 goedgekeurd")
L(S1, "Op 14 juli 2025 keurde", "2040", "K", r"Voor de grote projecten is dat naar 2040")
L(S1, "In mei 2026 volgde", "mei 2026", "Q", r"22 mei 2026")
D(S1, "2.052", "2.052", comp_n, 2052, 0.5, "Budget 2026 versie mei 2026 zonder Oosterweel Kanaaltunnels en Leefbaarheid fase II")
D(S1, "De cijfers voor 2026 stijgen", "3,7 miljard", tot_n, 3700, 50, "Totaalrij GIP-tabel 2026 = 3.685.246.893 euro; afgerond 3,7", doc="T26", rx=r"3\.685\.246\.893", note="De mededeling zelf noemt 3,6 miljard; het tabeltotaal is 3.685 mio, afgerond 3,7.")
D(S1, "De cijfers voor 2026 stijgen", "ruim 1,6 miljard", ex_n, 1600, 100, f"Oosterweel Kanaaltunnels {line(n,OW,'budget2026'):.0f} + Leefbaarheid fase II {line(n,LF,'budget2026'):.0f} = {ex_n:.0f} mio", note="Totaal buiten gewoon budget volgens mededeling: 3.685 min 2.004 = 1.681 mio (alle Oosterweel-lijnen plus leefbaarheid).")
D(S1, "De daling van 216", "-104", diff["Duurzaam personenvervoer en modal shift"], -104, 0.5, "Personenvervoer en modal shift, vergelijkbare basis")
D(S1, "De daling van 216", "-75", diff["Regulier onderhoud en exploitatie"], -75, 0.5, "Regulier onderhoud en exploitatie: 74,8 naar 0", doc="T25", rx=r"Regulier onderhoud en exploitatie")
D(S1, "De daling van 216", "-25", diff["Grote investeringen in de zeehavens"], -25, 0.5, "Zeehavens 70,75 naar 45,52")
# Context
L(S2, "Het GIP is het investeringsprogramma", "4,3 miljard", "M", r"4,3 miljard euro \(VAK\) per jaar")
L(S2, "Het GIP is het investeringsprogramma", "2 miljard", "M", r"ongeveer 2 miljard euro voorzien voor investeringen")
L(S2, "Het GIP is het investeringsprogramma", "1,78 miljard", "M", r"1,78 miljard euro extra investeringsmiddelen")
L(S2, "Het GIP is het investeringsprogramma", "2025 tot 2029", "M", r"periode 2025-2029")
L(S2, "Eerste GIP goedgekeurd", "14 juli 2025", "M", r"Op 14 juli 2025 werd een eerste GIP")
L(S2, "Actualisatie goedgekeurd", "22 mei 2026", "Q", r"22 mei 2026")
L(S2, "Vraag in de parlementscommissie", "11 juni 2026", "V", r"11 juni 2026")
L(S2, "Het Rekenhof keurt zijn verslag", "16 juni 2026", "R", r"16 juni 2026")
L(S2, "Parlementaire vraag: waarom", "7 juli 2026", "Q", r"7 juli 2026")
L(S2, "Verslag van de commissiebespreking", "9 september 2026", "K", r"9 september 2026")
# Investeringen tot 2028
for y, t, lab in (("2025", "2.585", "2025"), ("2026", "2.424", "2026"), ("2027", "2.501", "2027")):
    tot_str = f"{o['metadata']['stated_total'][y]:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    D(S3, "De versie van juli 2025 plande", t, tot[y], float(t.replace(".", "")), 0.5, f"Totaalrij {lab} = {tot_str} euro", doc="T25", rx=re.escape(tot_str))
D(S3, "De versie van juli 2025 plande", "7,5 miljard", sum(tot.values()), 7500, 20, f"{sum(tot.values()):.0f} mio (som 2025 tot 2027)")
L(S3, "De versie van juli 2025 plande", "elf programma's", "K", r"elf inhoudelijke programma")
L(S3, "Voor 2028 en 2029 bevat", "1,4 miljard", "R", r"1\.400 miljoen euro in 2029")
L(S3, "Voor 2028 en 2029 bevat", "gevalideerde", "R", r"nog niet geuit in gevalideerde bedragen voor 2028 en 2029")
D(S3, "Voor 2028 en 2029 bevat", "666", bt["2028"], 666, 0.5, "Som jaarbedrag 2028 van de 17 grote projecten (bijlage Grote Projecten)", doc="GP", rx=r"Werken aan de Ring R0")
D(S3, "Voor 2028 en 2029 bevat", "489", bt["2029"], 489, 0.5, "Som jaarbedrag 2029 van de 17 grote projecten", doc="GP", rx=r"Werken aan de Ring R0")
# Update 2026
A4 = "De actualisatie van mei 2026 toont"
D(S4, A4, "3.685", tot_n, 3685, 0.5, "Totaalrij GIP-tabel 2026", doc="T26", rx=r"3\.685\.246\.893")
D(S4, A4, "2.424", tot["2026"], 2424, 0.5, "Totaalrij 2026 in GIP-tabel 2025-2027", doc="T25", rx=r"2\.423\.646\.67")
D(S4, A4, "1,3 miljard", tot_n - tot["2026"], 1300, 100, f"{tot_n:.0f} min {tot['2026']:.0f} = {tot_n-tot['2026']:.0f} mio")
L(S4, A4, "1 miljard", "M", r"meer dan 1 miljard euro voor de hoofdwerken van Oosterweel")
L(S4, A4, "638", "M", r"638 miljoen euro voor leefbaarheidsprojecten")
L(S4, A4, "2.004", "M", r"2\.004\.315 duizend euro")
D(S4, "Om beide versies eerlijk", "2.268", comp_o, 2268, 0.5, "2.423,6 min Oosterweel Kanaaltunnels 149,6 min Leefbaarheid 6,0")
D(S4, "Om beide versies eerlijk", "2.052", comp_n, 2052, 0.5, "3.685,2 min 1.006,7 min 626,2")
D(S4, "Om beide versies eerlijk", "220", 2223.1 - 2004.3, 220, 5, "Officieel: 2.004,3 versus oude basis zonder alle Oosterweel-lijnen en leefbaarheid (2.423,6 min 194,5 min 6,0 = 2.223,1)", note="Schatting: gaat uit van dezelfde afbakening in de versie 2025.")
L(S4, "Personenvervoer en modal shift (", "331", "R", r"331 miljoen euro")
L(S4, "Personenvervoer en modal shift (", "229", "R", r"229 miljoen euro")
D(S4, "Personenvervoer en modal shift (", "83", line(o, "Fiets- en voetgangersbrug Schelde incl. Scheldebalkon", "budget2026"), 83, 0.5, "Twee projectlijnen 2025-versie: 3.000.000 + 80.000.000", doc="T25", rx=r"Scheldebalkon")
D(S4, "Personenvervoer en modal shift (", "10 miljoen", line(n, "Fiets- en voetgangersbrug Schelde incl. Scheldebalkon", "budget2026"), 9.95, 0.1, "Twee projectlijnen 2026-versie: 2.160.000 + 7.792.000 = 9.952.000 (afgerond 10)", doc="T26", rx=r"Scheldebalkon")
D(S4, "Zeehavens (", "31", line(o, "Complex project Extra Containercapaciteit Antwerpen", "budget2026"), 31, 0.5, "Projectlijn 2025-versie: 31.000.000", doc="T25", rx=r"Extra Containercapaciteit")
D(S4, "Zeehavens (", "2 miljoen", line(n, "Complex project Extra Containercapaciteit Antwerpen", "budget2026"), 2.3, 0.3, "Projectlijn 2026-versie: 2.270.000 (afgerond 2)", doc="T26", rx=r"Extra Containercapaciteit")
D(S4, "Daartegenover staan", "+35", diff["Asset Management"], 35, 0.5, "Asset management 730,4 naar 765,2")
D(S4, "Daartegenover staan", "+19", diff["Investeringen in de regionale luchthavens"], 19, 0.5, "Regionale luchthavens 2,9 naar 21,8")
L(S4, "Van het gewone budget", "2.004", "M", r"2\.004\.315 duizend euro")
L(S4, "Van het gewone budget", "631", "M", r"631 miljoen euro")
D(S4, "Van het gewone budget", "bijna een derde", 631 / 2004.3, 0.3, 0.02, "631 / 2.004,3 = 31,5%", doc="M", rx=r"ongeveer 30% van de beschikbare middelen")
L(S4, "Van het gewone budget", "284", "M", r"284 miljoen euro")
D(S4, "Van het gewone budget", "achttien", M_list_count, 18, 0.1, f"Aantal projecten in de lijst van de mededeling: {M_list_count}", doc="M", rx=r"Heraanleg en optimalisatie R0", note="De mededeling somt 18 projecten op (incl. HOV Limburg); de bijlage Grote Projecten telt er 17.")
L(S4, "Van het gewone budget", "1,1 miljard", "M", r"1,1 miljard euro")
# Doorkijk
A5 = "De bijlage bij het GIP van juli 2025"
D(S5, A5, "zeventien", len(gp), 17, 0.1, "Aantal hoofdprojecten in de bijlage Grote Projecten", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, A5, "19,8 miljard", capex, 19800, 100, f"Som totaalbudgetten (capex) = {capex:.0f} mio", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "Het patroon is duidelijk", "305", bt["2025"], 305, 0.5, "Som jaarbedragen 2025", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "Het patroon is duidelijk", "666", bt["2028"], 666, 0.5, "Som jaarbedragen 2028 (hoogste jaar tot 2029)", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "Het patroon is duidelijk", "1,4 miljard", bt["2030"], 1400, 50, f"Som 2030 = {bt['2030']}", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "Het patroon is duidelijk", "2,1 miljard", bt["2032"], 2100, 50, f"Som 2032 = {bt['2032']}", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "12%", "12%", cum_early / cum * 100, 12, 0.5, f"{cum_early} / {cum} (som 2025 tot 2029 / som 2025 tot 2040)")
D(S5, "16,0", "16,0", (cum - cum_early) / 1000, 16.0, 0.1, f"{cum - cum_early} mio (som 2030 tot 2040)")
L(S5, "Het Rekenhof rekent voor", "2.182", "R", r"2\.182 miljoen euro")
L(S5, "Het Rekenhof rekent voor", "2.577", "R", r"2\.577 miljoen euro")
L(S5, "Het Rekenhof rekent voor", "bijna 90%", "R", r"bijna 90 %")
L(S5, "Het Rekenhof rekent voor", "158 miljoen", "R", r"157,9 miljoen euro in 2024")
L(S5, "Het Rekenhof rekent voor", "260 miljoen", "R", r"260,2 miljoen euro in 2030")
L(S5, "Het Rekenhof rekent voor", "971 miljoen", "R", r"970,5 miljoen euro in 2035")
# Rekenhof
A6 = "Het Rekenhof onderzocht"
L(S6, A6, "november 2025 tot mei 2026", "K", r"november 2025 en liep tot eind mei 2026")
L(S6, A6, "16 juni 2026", "R", r"16 juni 2026")
L(S6, "De ambitie was vijf jaar", "vijf jaar / tien jaar", "R", r"5 jaar \(algemeen\).{0,60}10 jaar voor grote projecten")
L(S6, "Voor 2026 is ongeveer 80", "80 miljoen", "K", r"80 miljoen euro te weinig")
L(S6, "De extra middelen in 2025", "363 / 530", "R", r"530 miljoen euro bijkomend te investeren, bleef in de praktijk beperkt tot 363")
L(S6, "De ambitie van 1,4 miljard", "20,5%", "R", r"20,5 % lager")
L(S6, "De ambitie van 1,4 miljard", "1,4 miljard", "R", r"1\.400 miljoen euro in 2029")
L(S6, "Het GIP is onvoldoende bindend", "77", "K", r"77 projecten")
L(S6, "gemiddeld GIP-budget", "2.503", "R", r"2\.503 miljoen euro")
L(S6, "mio euro te weinig begroot", "80", "K", r"80 miljoen euro te weinig")
L(S6, "mio euro extra in 2025", "363", "R", r"beperkt tot 363 miljoen euro")
# Parlement
L(S7, "Het GIP kwam twee keer aan bod", "11 juni 2026", "V", r"11 juni 2026")
L(S7, "Een inhaalbeweging", "1,8 miljard", "V", r"1,8 miljard euro extra naar het beleidsdomein")
L(S7, "Een inhaalbeweging", "1,4 miljard", "V", r"1,4 miljard euro extra die deze legislatuur")
L(S7, "Een aanzienlijk groeipad", "50 miljoen", "K", r"50 miljoen euro extra")
L(S7, "cd&v: aannemers", "1,8 miljard", "V", r"1,8 miljard euro extra voor MOW")
L(S7, "Andere leden", "14,5 miljard", "K", r"14,5\s*mil\s*jard")
L(S7, "Andere leden", "vijf- tot tienjarig", "K", r"vijf tot tien jaar")
L(S7, "Andere leden", "driejarig", "K", r"drie jaar")
L(S7, "Minister Annick De Ridder over het volgende GIP", "11 juni 2026", "V", r"11 juni 2026")
L(S7, "Voor de bouwsector zijn drie punten", "Asset Wijzer 2024", "R", r"Asset Wijzer 2024")
L(S7, "Wat de minister benadrukt", "2028 en 2029", "K", r"groeipad zal voor 2028-2029")
# Bronnen
L("Bronnen", "Vraag om uitleg nr. 4295", "4295", "V", r"4295")
L("Bronnen", "Vraag om uitleg nr. 4295", "1666", "Q", r"nr\. 1666")
L("Bronnen", "Verslag van de Commissie voor Mobiliteit", "9 september 2026", "K", r"9 september 2026")
L("Bronnen", "GIP 2026, mededeling", "22 mei 2026", "Q", r"22 mei 2026")
L("Bronnen", "GIP 2025 tot 2027, projecttabel", "14 juli 2025", "GP", r"versie 14 juli 2025")


# aanvullende claims (KPI-cellen en samenvattingen)
D(S1, "-216", "-216", comp_n - comp_o, -216, 0.5, "Kerncijfer: verschil 2026 op vergelijkbare basis")
D(S1, "18,2", "18,2", cum / 1000, 18.2, 0.05, f"Som jaarbedragen 2025 tot 2040 = {cum} mio", doc="GP", rx=r"Werken aan de Ring R0")
D(S1, "2,1 mrd euro piekjaar", "2,1", bt["2032"] / 1000, 2.1, 0.05, f"Som 2032 = {bt['2032']} mio", doc="GP", rx=r"Werken aan de Ring R0")
D(S5, "Daarna blijft ze rond", "1,4", sum(bt[y] for y in ("2036", "2037", "2038", "2039", "2040")) / 5 / 1000, 1.4, 0.05, "Gemiddelde som 2036 tot 2040 (1.392 tot 1.401 mio)", doc="GP", rx=r"Werken aan de Ring R0")
D(S4, "Drie elementen verklaren", "200", -(diff["Duurzaam personenvervoer en modal shift"] + diff["Regulier onderhoud en exploitatie"] + diff["Grote investeringen in de zeehavens"]), 204, 1, "104 + 75 + 25 = 204 (dus 'ruim 200')")
L(S4, "Volgens de officiële afbakening", "2.004", "M", r"2\.004\.315 duizend euro")
L(S6, "mio euro te weinig begroot", "80", "K", r"80 miljoen euro te weinig")
L(S6, "mio euro extra in 2025", "363", "R", r"beperkt tot 363 miljoen euro")
L(S6, "mio euro extra in 2025", "530", "R", r"530 miljoen euro bijkomend te investeren")
L(S6, "gemiddeld GIP-budget", "2.503", "R", r"2\.503 miljoen euro")
L(S6, "De extra middelen in 2025 bleven", "363 / 530", "R", r"530 miljoen euro bijkomend te investeren, bleef in de praktijk beperkt tot 363")
def fpg(doc, name):
    p, f = find(doc, re.escape(name[:25]))
    if p: return p, f
    for w in sorted(re.findall(r"[A-Za-zÀ-ÿ]{5,}", name), key=len, reverse=True):
        p, f = find(doc, re.escape(w))
        if p: return p, f
    return 1, ""
# ---------- tabelcontrole ----------
T_rows = []  # (tabel, rij, kolom, getal in document, bronwaarde, brondocument, pagina, link, status)
def tnum(s): return float(s.replace(".", "").replace(",", ".")) if s not in ("", "-") else 0.0
for first, rows in tables:
    if first.startswith("Programma (mio"):
        pr = {p["name"]: p for p in o["programSummary"]}
        for r in rows[1:]:
            name = r[0]
            if name == "Totaal":
                exp = [tot["2025"], tot["2026"], tot["2027"], sum(tot.values())]
            else:
                p = pr[name]; exp = [p["budget2025"] / 1e6, p["budget2026"] / 1e6, p["budget2027"] / 1e6, p["budget_total"] / 1e6]
            for j, (cell, e) in enumerate(zip(r[1:], exp)):
                pg, _ = find("T25", r"Totaal") if name == "Totaal" else fpg("T25", name)
                T_rows.append(("Programma's per jaar", name, ["2025", "2026", "2027", "Totaal"][j], cell, f"{e:.1f}", DOCS["T25"][0], pg, link("T25", pg) if pg else "", "✔ klopt (afgerond)" if abs(tnum(cell) - e) <= 0.51 else "⚠ AFWIJKING"))
    elif first.startswith("Programma, budget"):
        for r in rows[1:]:
            name = r[0]
            if name == "Totaal":
                exp = [comp_o, comp_n, comp_n - comp_o]
            else:
                exp = [O26.get(name, 0), N26.get(name, 0), diff[name]]
            for j, (cell, e) in enumerate(zip(r[1:], exp)):
                pg, _ = find("T26", r"Totaal") if name == "Totaal" else fpg("T26", name)
                T_rows.append(("Verschil 2026 per programma", name, ["Versie 2025", "Versie 2026", "Verschil"][j], cell, f"{e:.1f}", DOCS["T26"][0] + " en " + DOCS["T25"][0], pg, link("T26", pg) if pg else "", "✔ klopt (afgerond)" if abs(tnum(cell.replace("+", "")) - e) <= 0.51 else "⚠ AFWIJKING"))
    elif first.startswith("Project (mio"):
        gptxt = PAGES["GP"][0]
        byname = {b["project"]: b for b in gp}
        for r in rows[1:]:
            name = r[0]
            if name.startswith("Totaal"):
                exp = [capex] + [bt[y] for y in ("2028", "2030", "2032", "2040")]
                for j, (cell, e) in enumerate(zip(r[1:], exp)):
                    T_rows.append(("Grote projecten", name, ["Totaal", "2028", "2030", "2032", "2040"][j], cell, f"{e:.0f}", "Som van de rijen in " + DOCS["GP"][0], 1, link("GP", 1), "✔ klopt" if abs(tnum(cell) - e) < 0.5 else "⚠ AFWIJKING"))
                continue
            b = byname[name]
            # rechtstreekse controle op de brontekst: de niet-nulwaarden van de bronregel moeten overeenkomen
            m = re.search(re.escape(name) + r"\s+([\d.\s-]+?)(?=\s[A-Za-z]|$)", gptxt)
            src_tokens = re.findall(r"\d[\d.]*", m.group(1)) if m else []
            src_nums = sorted(int(t.replace(".", "")) for t in src_tokens)
            json_nums = sorted([b["total_mio"]] + [v for v in b["impact_mio"].values() if v])
            line_ok = src_nums == json_nums
            for j, y in enumerate(("2028", "2030", "2032", "2040")):
                T_rows.append(("Grote projecten", name, y, r[2 + j], str(b["impact_mio"][y]), DOCS["GP"][0], 1, link("GP", 1), ("✔ klopt" if tnum(r[2 + j]) == b["impact_mio"][y] else "⚠ AFWIJKING") + ("" if line_ok else " (bronregel niet 1-op-1 te lezen)")))
            T_rows.append(("Grote projecten", name, "Totaal", r[1], str(b["total_mio"]), DOCS["GP"][0], 1, link("GP", 1), "✔ klopt" if tnum(r[1]) == b["total_mio"] else "⚠ AFWIJKING"))

# ---------- grafiekwaarden ----------
C_rows = []
nums = json.load(open(Path(__file__).resolve().parent / "charts" / "numbers.json")) if (Path(__file__).resolve().parent / "charts" / "numbers.json").exists() else None
if nums:
    def chk(fig, label, doc_val, exp):
        C_rows.append((fig, label, round(doc_val, 1), round(exp, 1), "✔ klopt" if abs(doc_val - exp) < 0.6 else "⚠ AFWIJKING"))
    for y in ("2025", "2026", "2027"):
        chk("Figuur 1", f"Totaal {y} (versie 2025)", nums["tot"][y], tot[y])
    chk("Figuur 1", "Totaal 2026 (versie 2026)", nums["tot"]["2026n"], tot_n)
    chk("Figuur 1", "Vergelijkbaar 2026 (versie 2026)", nums["comp"]["2026n"], comp_n)
    chk("Figuur 1", "Andere financiering 2026 (versie 2026)", nums["ex"]["2026n"], ex_n)
    for k, v in sorted(diff.items()):
        chk("Figuur 2", f"Verschil {k}", nums["diff"][k], v)
    for y in yrs:
        chk("Figuur 4", f"Totaal grote projecten {y}", nums["bt"][y], bt[y])

# ---------- dekking ----------
claimed = {}
for sec, ctx, tok, *_ in rows_out:
    claimed.setdefault(ctx, []).append(tok)
uncovered = []
tokre = re.compile(r"(?<![\w])[-+]?\d[\d.]*(?:,\d+)?%?")
SKIP = re.compile(r"^(19|20)\d\d$")
for p in units:
    if p.startswith("Figuur") or p.startswith("Pagina"):
        continue
    for sent in re.split(r"(?<=[.!?])\s+", p):
        for m in tokre.finditer(sent):
            t = m.group().strip(".")
            if SKIP.match(t) or t in ("1", "2", "3", "4"):
                continue
            if any(re.search(r"(?<!\d)" + re.escape(t) + r" (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)", sent) and re.search(re.escape(t) + r" \w+ 20\d\d", tk) for tk in [x[2] for x in rows_out]):
                continue
            ok = False
            for ctx, toks in claimed.items():
                if sent == ctx and any(t.lstrip("+-") in tk for tk in toks):
                    ok = True; break
            if not ok:
                uncovered.append((sent, t))
def words(t): return set(re.findall(r"[a-zA-Z]{4,}", t.lower()))
for sent, t in list(uncovered):
    cands = [r for r in rows_out if r[2].lstrip("+-").replace("%", "") == t.lstrip("+-").replace("%", "") and r[8].startswith("✔") and "herhaling" not in r[3]]
    if not cands:
        continue
    best = max(cands, key=lambda r: len(words(r[1]) & words(sent)))
    rows_out.append((best[0], sent, t, best[3] + " (herhaling)", best[4], best[5], best[6], best[7], best[8], "Zelfde getal als elders in het document: " + best[1][:80], best[10], best[11]))
    uncovered.remove((sent, t))
seen = set(); unc = []
for s, t in uncovered:
    if (s, t) not in seen:
        seen.add((s, t)); unc.append((s, t))

# ---------- Excel ----------
TEAL, DARK, LT = "4F868F", "3F6B72", "D9E1E2"
wb = Workbook()
def sheet(ws, headers, data, widths, linkcol=None, linkcols=()):
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF", name="Calibri"); c.fill = PatternFill("solid", fgColor=TEAL); c.alignment = Alignment(wrap_text=True, vertical="center")
    for r in data:
        ws.append(list(r))
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
        for li in ([linkcol] if linkcol else []) + list(linkcols):
            lc = row[li]
            if lc.value:
                lc.hyperlink = lc.value; lc.value = "Open bron"; lc.font = Font(color="3F6B72", underline="single")
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("⚠"):
                c.fill = PatternFill("solid", fgColor=LT); c.font = Font(bold=True)
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

nok = sum(1 for r in rows_out if r[8].startswith("✔")); nwarn = len(rows_out) - nok
tok_ = sum(1 for r in T_rows if r[8].startswith("✔")); twarn = len(T_rows) - tok_
ws0 = wb.active; ws0.title = "Samenvatting"
lines = [("Controle cijfers GIP-analyse", ""), ("Document", DOCX.name), ("", ""),
         ("Getallen in de lopende tekst gecontroleerd", len(rows_out)), ("  waarvan in orde", nok), ("  waarvan met afwijking of niet gevonden", nwarn),
         ("Tabelcellen gecontroleerd", len(T_rows)), ("  waarvan in orde", tok_), ("  waarvan met afwijking", twarn),
         ("Grafiekwaarden gecontroleerd", len(C_rows)), ("  waarvan in orde", sum(1 for r in C_rows if r[4].startswith('✔'))),
         ("Getallen in de tekst zonder controleregel", len(unc)), ("", ""),
         ("Uitleg", "Letterlijk = het getal of de formulering staat in de brontekst (pagina en fragment getoond). Berekend = het getal is afgeleid (som, verschil, afronding) en onafhankelijk herberekend uit de brondata; waar mogelijk toont de rij ook de bronpagina waar de onderliggende cijfers staan."),
         ("Links", "De links openen de PDF op de gevonden pagina (pagina-anker). Niet elke PDF-lezer volgt het anker, de pagina staat daarom ook in een aparte kolom.")]
for a, b in lines: ws0.append([a, b])
ws0.column_dimensions["A"].width = 52; ws0.column_dimensions["B"].width = 110
ws0["A1"].font = Font(bold=True, size=14, color=DARK)
for r in ws0.iter_rows():
    for c in r: c.alignment = Alignment(wrap_text=True, vertical="top")
sheet(wb.create_sheet("Getallen in tekst"), ["Sectie", "Context uit de tekst", "Getal in de tekst", "Type", "Brondocument", "Pagina", "Bronfragment of berekening", "Link", "Status", "Opmerking", "Tweede bron", "Link tweede bron"],
      rows_out, [18, 70, 16, 16, 38, 8, 70, 14, 20, 50, 40, 14], linkcol=7, linkcols=(11,))
sheet(wb.create_sheet("Tabellen"), ["Tabel", "Rij", "Kolom", "Getal in document", "Bronwaarde (mio)", "Brondocument", "Pagina", "Link", "Status"],
      T_rows, [26, 40, 14, 16, 16, 40, 8, 14, 22], linkcol=7)
sheet(wb.create_sheet("Grafieken"), ["Figuur", "Datapunt", "In grafiek", "Herberekend", "Status"], C_rows, [12, 56, 14, 14, 16])
sheet(wb.create_sheet("Zonder controleregel"), ["Zin", "Getal"], unc, [110, 14])
wb.save(OUT)
print(f"tekst: {nok} ok / {nwarn} afwijkend | tabellen: {tok_} ok / {twarn} afwijkend | grafiek: {len(C_rows)} | zonder regel: {len(unc)}")
for r in rows_out:
    if not r[8].startswith("✔"): print("WARN", r[0], r[2], r[8], "|", r[1][:90])
for r in T_rows:
    if not r[8].startswith("✔"): print("TWARN", r[:5], r[8])
for s, t in unc: print("UNC", t, "|", s[:100])
