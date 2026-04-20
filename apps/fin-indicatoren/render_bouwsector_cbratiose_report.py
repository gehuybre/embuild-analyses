#!/usr/bin/env python3
"""Render a sector comparison report for NBB CBRATIOSE data."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import argparse
import math
import os
import subprocess
import textwrap
import xml.etree.ElementTree as ET

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from matplotlib.ticker import FuncFormatter
from matplotlib.lines import Line2D
import pandas as pd
import requests


PDF_FRONTMATTER = """---
lang: nl-BE
papersize: a4
fontsize: 11pt
geometry:
  - margin=2cm
header-includes:
  - \\usepackage{booktabs}
  - \\usepackage{longtable}
  - \\usepackage{array}
  - \\usepackage{float}
---
"""

CHART_COLORS = {
    "bouw": "#0f4c81",
    "alle": "#9f3a38",
    "accent": "#4f7c5d",
    "muted": "#7f8c8d",
}

STATUS_STYLES = {
    "sterk": {"bg": "#e6f4ea", "edge": "#3f7d4e", "text": "#1e5b2f"},
    "gemengd": {"bg": "#fff3e0", "edge": "#b77722", "text": "#9a5d0d"},
    "kwetsbaar": {"bg": "#fdecea", "edge": "#b33a3a", "text": "#8d2626"},
    "verbetert": {"text": "#1e5b2f"},
    "vrij stabiel": {"text": "#6b7280"},
    "verslechtert": {"text": "#8d2626"},
}

SCHEME_ORDER = ["C", "A", "M", "T"]
SCHEME_LABELS = {
    "C": "Volledig",
    "A": "Verkort",
    "M": "Micro",
    "T": "Volledig + Verkort + Micro",
}

SDMX_NS = {
    "generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
    "common": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common",
    "structure": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure",
}

PEER_SECTOR_CODES = [
    "PU210",
    "PU220",
    "PU290",
    "PU300",
    "PU310",
    "PU320",
    "PU330",
    "PU340",
    "PU405",
    "PU409",
    "PU410",
    "PU420",
]

LOWER_SUBSECTOR_CODES = [
    "DE4521",
    "DE4522",
    "DE4531",
    "DE4533",
    "DE4542",
    "DE4543",
    "DE4544",
]

PEER_DATA_URL = (
    "https://nsidisseminate-stat.nbb.be/rest/data/"
    "BE2,DF_CBRATIOSE,1.0/"
    "A.R001+R002+R004+R006+R010+R013+R014+R019+R020+R021+R022+R023."
    + "+".join(PEER_SECTOR_CODES)
    + ".dispg.T?dimensionAtObservation=AllDimensions"
)

LOWER_SUBSECTOR_DATA_URL = (
    "https://nsidisseminate-stat.nbb.be/rest/data/"
    "BE2,DF_CBRATIOSE,1.0/"
    "A.R001+R002+R004+R006+R010+R013+R014+R019+R020+R021+R022+R023."
    + "+".join(LOWER_SUBSECTOR_CODES)
    + ".dispg.T?dimensionAtObservation=AllDimensions"
)

LOWER_SUBSECTOR_LABELS = {
    "DE4521": "Burgerlijke en utiliteitsbouw",
    "DE4522": "Dakbedekking",
    "DE4531": "Elektrische installatie",
    "DE4533": "Loodgieterswerk",
    "DE4542": "Schrijnwerk",
    "DE4543": "Vloer- en wandafwerking",
    "DE4544": "Schilderen en glaszetten",
}

LOWER_SUBSECTOR_COLORS = {
    "DE4521": "#0f4c81",
    "DE4522": "#2f6f9f",
    "DE4531": "#4f7c5d",
    "DE4533": "#809a4f",
    "DE4542": "#a86b2d",
    "DE4543": "#b45f5f",
    "DE4544": "#6d5b9a",
}

USED_RATIO_CODES = ["R001", "R002", "R004", "R006", "R010", "R013", "R014", "R019", "R020", "R021", "R022", "R023"]

MAIN_ANOMALIES = [
    {"scheme_code": "M", "ratio_code": "R001", "year": 2021, "column": "value_pu300", "note": "Micro-brutomarge bouwsector 2021 vertoont een eenmalige piek."},
    {"scheme_code": "M", "ratio_code": "R001", "year": 2021, "column": "value_pu450", "note": "Micro-brutomarge alle sectoren 2021 vertoont een eenmalige piek."},
    {"scheme_code": "M", "ratio_code": "R002", "year": 2021, "column": "value_pu300", "note": "Micro-nettomarge bouwsector 2021 vertoont een eenmalige piek."},
    {"scheme_code": "M", "ratio_code": "R002", "year": 2021, "column": "value_pu450", "note": "Micro-nettomarge alle sectoren 2021 vertoont een eenmalige piek."},
    {"scheme_code": "A", "ratio_code": "R001", "year": 2011, "column": "value_pu450", "note": "Verkorte brutomarge alle sectoren 2011 wijkt sterk af van 2010 en 2012."},
    {"scheme_code": "A", "ratio_code": "R002", "year": 2011, "column": "value_pu450", "note": "Verkorte nettomarge alle sectoren 2011 wijkt sterk af van 2010 en 2012."},
    {"scheme_code": "A", "ratio_code": "R020", "year": 2022, "column": "value_pu450", "note": "Verkort leverancierskrediet alle sectoren 2022 vertoont een uitzonderlijke sprong."},
]

PEER_ANOMALIES = [
    {"sector_code": "PU220", "ratio_code": "R004", "year": 2019, "note": "Energie en water: toegevoegde waarde per personeelslid valt in 2019 naar nul."},
    {"sector_code": "PU220", "ratio_code": "R004", "year": 2021, "note": "Energie en water: toegevoegde waarde per personeelslid valt in 2021 opnieuw naar nul."},
    {"sector_code": "PU220", "ratio_code": "R004", "year": 2022, "note": "Energie en water: toegevoegde waarde per personeelslid blijft in 2022 op nul."},
    {"sector_code": "PU220", "ratio_code": "R001", "year": 2021, "note": "Energie en water: brutomarge 2021 valt naar nul en herstelt nadien."},
    {"sector_code": "PU220", "ratio_code": "R002", "year": 2021, "note": "Energie en water: nettomarge 2021 valt naar nul en herstelt nadien."},
    {"sector_code": "PU220", "ratio_code": "R019", "year": 2021, "note": "Energie en water: klantenkrediet 2021 valt naar nul."},
    {"sector_code": "PU220", "ratio_code": "R019", "year": 2022, "note": "Energie en water: klantenkrediet 2022 blijft op nul."},
    {"sector_code": "PU220", "ratio_code": "R020", "year": 2021, "note": "Energie en water: leverancierskrediet 2021 valt naar nul en herstelt nadien."},
]

LOWER_SUBSECTOR_ANOMALIES = [
    {"sector_code": "DE4543", "ratio_code": "R004", "year": 2020, "note": "Vloer- en wandafwerking: toegevoegde waarde per personeelslid valt in 2020 naar nul."},
    {"sector_code": "DE4543", "ratio_code": "R004", "year": 2021, "note": "Vloer- en wandafwerking: toegevoegde waarde per personeelslid blijft in 2021 op nul."},
    {"sector_code": "DE4543", "ratio_code": "R004", "year": 2022, "note": "Vloer- en wandafwerking: toegevoegde waarde per personeelslid blijft in 2022 op nul."},
    {"sector_code": "DE4543", "ratio_code": "R006", "year": 2020, "note": "Vloer- en wandafwerking: personeelskostenquote valt in 2020 naar nul."},
    {"sector_code": "DE4543", "ratio_code": "R006", "year": 2021, "note": "Vloer- en wandafwerking: personeelskostenquote blijft in 2021 op nul."},
    {"sector_code": "DE4543", "ratio_code": "R006", "year": 2022, "note": "Vloer- en wandafwerking: personeelskostenquote blijft in 2022 op nul."},
]
LOWER_SUBSECTOR_ANOMALIES.extend(
    {"sector_code": "DE4543", "ratio_code": ratio_code, "year": 2022, "note": "Vloer- en wandafwerking: in 2022 vallen alle gebruikte ratio's tegelijk naar nul."}
    for ratio_code in USED_RATIO_CODES
    if ratio_code not in {"R004", "R006"}
)


@dataclass(frozen=True)
class Theme:
    key: str
    area: str
    metrics: tuple[str, str]
    latest_basis_scheme: str
    metric_directions: tuple[bool, bool]
    y_formats: tuple[str, str]
    description: str
    how_to_read: str


@dataclass(frozen=True)
class Assessment:
    area: str
    status_label: str
    trend_label: str
    summary: str
    metrics: str


THEMES = [
    Theme(
        key="profitability",
        area="Winstgevendheid",
        metrics=("R001", "R002"),
        latest_basis_scheme="T",
        metric_directions=(True, True),
        y_formats=("percent", "percent"),
        description="Deze groep toont hoeveel van de omzet als marge overblijft. Voor een sectorvergelijking is vooral relevant of de bouwsector structureel meer of minder marge vasthoudt dan het bredere sectorgemiddelde.",
        how_to_read="Een lagere brutomarge maar hogere nettoverkoopmarge betekent dat de bouwsector minder overhoudt op de kernactiviteit, maar onder de lijn beter afsluit. Dat is dus niet automatisch zwak of sterk; het vraagt nuance.",
    ),
    Theme(
        key="liquidity",
        area="Liquiditeit",
        metrics=("R013", "R014"),
        latest_basis_scheme="T",
        metric_directions=(True, True),
        y_formats=("ratio", "ratio"),
        description="Liquiditeit toont hoe comfortabel een sector zijn kortetermijnverplichtingen kan dragen. In deze dataset gaat het om sectorale ratio's, niet om de absolute cashpositie van een individueel bedrijf.",
        how_to_read="Current ratio kijkt ruim, quick ratio strenger. Als de bouwsector hoger scoort op current ratio maar niet op quick ratio, zit de buffer vaker vast in voorraden, projecten of onderhanden werk.",
    ),
    Theme(
        key="balance",
        area="Balansweerbaarheid",
        metrics=("R010", "R021"),
        latest_basis_scheme="T",
        metric_directions=(True, True),
        y_formats=("percent", "percent"),
        description="Deze groep vergelijkt hoeveel financiele draagkracht de bouwsector heeft tegenover het brede sectorgemiddelde. Cashflow op eigen vermogen en financiele onafhankelijkheid vullen elkaar aan.",
        how_to_read="Een hogere cashflow op eigen vermogen kan samengaan met een lagere financiele onafhankelijkheid. Dan draait de sector wel cash, maar rust de balans relatief meer op schuld dan gemiddeld.",
    ),
    Theme(
        key="payments",
        area="Betalingscyclus",
        metrics=("R019", "R020"),
        latest_basis_scheme="T",
        metric_directions=(False, True),
        y_formats=("days", "days"),
        description="Deze groep toont hoeveel dagen klanten- en leverancierskrediet in de sector zit. Voor de bouw is dit belangrijk omdat projectfacturatie en betalingsritmes sterk doorwegen op cash.",
        how_to_read="Minder dagen klantenkrediet is beter. Meer leverancierskrediet kan tijdelijk helpen, maar compenseert een lange inningsduur niet altijd volledig.",
    ),
    Theme(
        key="productivity",
        area="Productiviteit en kostdruk",
        metrics=("R004", "R006"),
        latest_basis_scheme="T",
        metric_directions=(True, False),
        y_formats=("currency", "percent"),
        description="Deze groep vergelijkt hoeveel toegevoegde waarde een personeelslid gemiddeld produceert en hoeveel van die toegevoegde waarde opnieuw opgaat aan personeelskosten.",
        how_to_read="Een lagere toegevoegde waarde per personeelslid samen met een hogere personeelskostquote wijst op een structureel dunnere productiviteitsbuffer in de bouwsector.",
    ),
    Theme(
        key="investment",
        area="Investeringen en vernieuwing",
        metrics=("R022", "R023"),
        latest_basis_scheme="T",
        metric_directions=(True, True),
        y_formats=("percent", "percent"),
        description="Deze groep vergelijkt hoeveel de sector investeert in materiele vaste activa en hoe snel het productieve kapitaal vernieuwt.",
        how_to_read="Een sector kan een gemiddelde investeringsintensiteit hebben maar toch een hogere vernieuwingsgraad. Dat wijst erop dat investeringen gerichter naar vervanging of modernisering gaan.",
    ),
]

TABLE_HEADERS = {
    "profitability": ("Bruto", "Netto"),
    "liquidity": ("Current", "Quick"),
    "balance": ("CF/EV", "Onafh."),
    "payments": ("Klanten", "Lever."),
    "productivity": ("TW/pers.", "PK/TW"),
    "investment": ("Invest.", "Vernieuw."),
}

PANEL_METRIC_LABELS = {
    "R001": "Brutoverkoopmarge",
    "R002": "Nettoverkoopmarge",
    "R004": "Toegevoegde waarde per personeelslid",
    "R006": "Personeelskosten / toegevoegde waarde",
    "R010": "Cashflow / eigen vermogen",
    "R013": "Liquiditeit in ruime zin",
    "R014": "Liquiditeit in enge zin",
    "R019": "Aantal dagen klantenkrediet",
    "R020": "Aantal dagen leverancierskrediet",
    "R021": "Financiële onafhankelijkheidsgraad",
    "R022": "Investeringen / toegevoegde waarde",
    "R023": "Vernieuwingsgraad materiële activa",
}

PEER_THEME_TITLES = {
    "profitability": "Winstgevendheid",
    "liquidity": "Liquiditeit",
    "balance": "Balansweerbaarheid",
    "payments": "Betalingscyclus",
    "productivity": "Productiviteit en kostdruk",
    "investment": "Investeringen en vernieuwing",
}

MODEL_GUIDANCE = [
    {
        "code": "C",
        "label": "Volledig",
        "meaning": "Model voor grote vennootschappen.",
        "interpretation": "Lees dit als de populatie met de rijkste rapportering. Deze cijfers zijn vaak het meest gedetailleerd, maar niet noodzakelijk representatief voor de doorsnee onderneming in de sector.",
    },
    {
        "code": "A",
        "label": "Verkort",
        "meaning": "Model voor kleine, niet-beursgenoteerde vennootschappen.",
        "interpretation": "Dit model is in veel sectoren de grootste groep. Het is vaak nuttig als middenlaag tussen grote ondernemingen en microvennootschappen.",
    },
    {
        "code": "M",
        "label": "Micro",
        "meaning": "Model voor microvennootschappen; subcategorie van de kleine vennootschappen.",
        "interpretation": "Microcijfers zijn het gevoeligst voor volatiliteit en uitschieters. Vergelijk ze vooral met andere microreeksen en minder met het volledige model.",
    },
    {
        "code": "T",
        "label": "Volledig + Verkort + Micro",
        "meaning": "Aggregaat over de drie jaarrekeningmodellen samen.",
        "interpretation": "Dit is de breedste sectormix. Ik gebruik dit model voor de vergelijking tussen de bouwsector en andere afzonderlijke sectoren, omdat je dan geen modelmix per sector hoeft te vergelijken. Dit is een interpretatie op basis van de officiële API-codelijst.",
    },
]

INDICATOR_GUIDANCE = [
    {
        "theme": "Winstgevendheid",
        "metric": "Brutoverkoopmarge",
        "formula": "Bedrijfswinst plus afschrijvingen/waardeverminderingen/provisies gedeeld door omzet, maal 100.",
        "reading": "Toont hoeveel operationele marge de sector op de omzet houdt vóór je naar de volledige financierings- en belastingstructuur kijkt.",
    },
    {
        "theme": "Winstgevendheid",
        "metric": "Nettoverkoopmarge",
        "formula": "Bedrijfswinst, gecorrigeerd voor bepaalde kapitaalsubsidies, gedeeld door omzet, maal 100.",
        "reading": "Ligt dichter bij wat finaal van de verkoop overblijft dan de brutoverkoopmarge.",
    },
    {
        "theme": "Liquiditeit",
        "metric": "Liquiditeit in ruime zin",
        "formula": "Vlottende activa gedeeld door schulden op ten hoogste één jaar plus overlopende rekeningen van het passief.",
        "reading": "Een ruime dekking van kortetermijnschulden. In de bouw kan deze ratio goed lijken terwijl een deel van de buffer vastzit in projecten of voorraad.",
    },
    {
        "theme": "Liquiditeit",
        "metric": "Liquiditeit in enge zin",
        "formula": "Vorderingen op ten hoogste één jaar plus geldbeleggingen en liquide middelen, gedeeld door schulden op ten hoogste één jaar.",
        "reading": "Strengere liquiditeitstest zonder de bredere project- en voorraadbuffer.",
    },
    {
        "theme": "Balansweerbaarheid",
        "metric": "Cashflow / eigen vermogen",
        "formula": "Winst van het boekjaar plus niet-kaskosten en andere NBB-correcties, gedeeld door eigen vermogen, maal 100.",
        "reading": "Indicatie van de interne cashgeneratie in verhouding tot de eigen vermogensbasis.",
    },
    {
        "theme": "Balansweerbaarheid",
        "metric": "Financiële onafhankelijkheidsgraad",
        "formula": "Eigen vermogen gedeeld door totaal passiva, maal 100.",
        "reading": "Klassieke solvabiliteitsmaat: hoe hoger, hoe meer schokabsorptie in de balans.",
    },
    {
        "theme": "Betalingscyclus",
        "metric": "Aantal dagen klantenkrediet",
        "formula": "Handelsvorderingen gedeeld door omzetbasis, vermenigvuldigd met 365 dagen.",
        "reading": "Benadering van hoe lang het duurt voor klanten betalen.",
    },
    {
        "theme": "Betalingscyclus",
        "metric": "Aantal dagen leverancierskrediet",
        "formula": "Handelsschulden gedeeld door aankopen/dienstenbasis, vermenigvuldigd met 365 dagen.",
        "reading": "Benadering van hoe lang de sector leverancierskrediet gebruikt.",
    },
    {
        "theme": "Productiviteit en kostdruk",
        "metric": "Toegevoegde waarde per personeelslid",
        "formula": "Toegevoegde waarde gedeeld door gemiddeld personeelsbestand in voltijdse equivalenten.",
        "reading": "Geeft weer hoeveel economische waarde gemiddeld per personeelslid wordt gecreëerd.",
    },
    {
        "theme": "Productiviteit en kostdruk",
        "metric": "Personeelskosten / toegevoegde waarde",
        "formula": "Bezoldigingen, sociale lasten en pensioenen gedeeld door toegevoegde waarde, maal 100.",
        "reading": "Toont welk deel van de gecreëerde waarde meteen weer naar personeelskosten gaat.",
    },
    {
        "theme": "Investeringen en vernieuwing",
        "metric": "Investeringen / toegevoegde waarde",
        "formula": "Aangeschafte materiële vaste activa gedeeld door toegevoegde waarde, maal 100.",
        "reading": "Meet hoe investeringsintensief de sector is tegenover zijn gecreëerde waarde.",
    },
    {
        "theme": "Investeringen en vernieuwing",
        "metric": "Vernieuwingsgraad materiële activa",
        "formula": "Aangeschafte materiële vaste activa gedeeld door de boekwaarde/aanschaffingsbasis van materiële vaste activa, maal 100.",
        "reading": "Geeft aan hoe snel de materiële kapitaalstock vernieuwt.",
    },
]


def format_percent(value: float | None, digits: int = 1) -> str:
    if value is None or pd.isna(value):
        return "-"
    return f"{value:.{digits}f}%".replace(".", ",")


def format_ratio(value: float | None, digits: int = 2) -> str:
    if value is None or pd.isna(value):
        return "-"
    return f"{value:.{digits}f}".replace(".", ",")


def format_days(value: float | None, digits: int = 1) -> str:
    if value is None or pd.isna(value):
        return "-"
    return f"{value:.{digits}f} dagen".replace(".", ",")


def format_euro(value: float | None, digits: int = 0) -> str:
    if value is None or pd.isna(value):
        return "-"
    return f"EUR {value:,.{digits}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def formatter_for(kind: str) -> FuncFormatter:
    if kind == "currency":
        return FuncFormatter(lambda value, _pos: f"EUR {value:,.0f}".replace(",", "X").replace(".", ",").replace("X", "."))
    if kind == "percent":
        return FuncFormatter(lambda value, _pos: f"{value:.0f}%".replace(".", ","))
    if kind == "ratio":
        return FuncFormatter(lambda value, _pos: f"{value:.2f}".replace(".", ","))
    if kind == "days":
        return FuncFormatter(lambda value, _pos: f"{value:.0f}")
    return FuncFormatter(lambda value, _pos: f"{value}")


def text_format(value: float | None, kind: str) -> str:
    if kind == "currency":
        return format_euro(value)
    if kind == "percent":
        return format_percent(value)
    if kind == "ratio":
        return format_ratio(value)
    if kind == "days":
        return format_days(value)
    return format_ratio(value)


def load_frame(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    frame["year"] = frame["year"].astype(int)
    return frame


def sanitize_main_frame(frame: pd.DataFrame) -> pd.DataFrame:
    sanitized = frame.copy()
    for anomaly in MAIN_ANOMALIES:
        mask = (
            (sanitized["scheme_code"] == anomaly["scheme_code"])
            & (sanitized["ratio_code"] == anomaly["ratio_code"])
            & (sanitized["year"] == anomaly["year"])
        )
        sanitized.loc[mask, anomaly["column"]] = pd.NA
    return sanitized


def sanitize_series_frame(frame: pd.DataFrame, anomalies: list[dict[str, object]]) -> pd.DataFrame:
    sanitized = frame.copy()
    for anomaly in anomalies:
        mask = (
            (sanitized["sector_code"] == anomaly["sector_code"])
            & (sanitized["ratio_code"] == anomaly["ratio_code"])
            & (sanitized["year"] == anomaly["year"])
        )
        sanitized.loc[mask, "value"] = pd.NA
    return sanitized


def anomaly_note_lines() -> list[str]:
    main_notes = sorted({str(item["note"]) for item in MAIN_ANOMALIES})
    peer_notes = sorted({str(item["note"]) for item in PEER_ANOMALIES})
    lower_notes = sorted({str(item["note"]) for item in LOWER_SUBSECTOR_ANOMALIES})
    lines = [
        "## Datakwaliteit en anomalieën",
        "",
        "Verdachte bronpunten zijn in dit rapport als `n.v.t.` behandeld. Ze blijven wel zichtbaar in de ruwe download- en analysebestanden.",
        "",
        "Hoofdanalyse per model:",
        "",
    ]
    for note in main_notes:
        lines.append(f"- {note}")
    lines.extend(["", "Vergelijking met andere sectoren:", ""])
    for note in peer_notes:
        lines.append(f"- {note}")
    lines.extend(["", "Vergelijking tussen bouwsubsectoren:", ""])
    for note in lower_notes:
        lines.append(f"- {note}")
    lines.append("")
    return lines


def parse_codelist_labels(path: Path, lang: str = "nl") -> dict[str, str]:
    root = ET.fromstring(path.read_bytes())
    labels: dict[str, str] = {}
    for code in root.findall(".//structure:Code", SDMX_NS):
        code_id = code.attrib["id"]
        name = None
        for node in code.findall("common:Name", SDMX_NS):
            if node.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") == lang:
                name = (node.text or "").strip()
                break
        labels[code_id] = name or code_id
    return labels


def parse_generic_data(xml_bytes: bytes) -> list[dict[str, object]]:
    root = ET.fromstring(xml_bytes)
    rows: list[dict[str, object]] = []
    for obs in root.findall(".//generic:Obs", SDMX_NS):
        row: dict[str, object] = {}
        for value in obs.findall("generic:ObsKey/generic:Value", SDMX_NS):
            row[value.attrib["id"]] = value.attrib["value"]
        obs_value = obs.find("generic:ObsValue", SDMX_NS)
        row["OBS_VALUE"] = float(obs_value.attrib["value"]) if obs_value is not None else None
        rows.append(row)
    return rows


def sector_short_label(label: str) -> str:
    label = label.split(":", 1)[-1].strip()
    replacements = {
        "Landbouw, jacht, bosbouw en visserij": "Landbouw",
        "Energie- en waterhuishouding": "Energie en water",
        "Geheel van de verwerkende industrie": "Verwerkende industrie",
        "Bouwnijverheid": "Bouwnijverheid",
        "Handel en reparatie van auto's en consumptieartikelen": "Handel en reparatie",
        "Verblijfsaccommodaties, restaurants en cafés": "Horeca",
        "Vervoer en telecommunicatie": "Vervoer en telecom",
        "Diensten aan ondernemingen en particulieren": "Diensten",
        "Activiteiten van holdings": "Holdings",
        "Kunst, amusement en recreatie": "Kunst en recreatie",
        "Gezondheidszorg en maatschappelijke dienstverlening": "Gezondheidszorg",
        "Financiële sector": "Financiële sector",
    }
    return replacements.get(label, label)


def lower_subsector_short_label(code: str, label: str) -> str:
    return LOWER_SUBSECTOR_LABELS.get(code, label.split(":", 1)[-1].strip())


def ensure_peer_sector_frame(root_dir: Path) -> pd.DataFrame:
    download_dir = root_dir / "downloads" / "cbratiose_bouw_vs_andere_sectoren"
    analysis_dir = root_dir / "analysis" / "cbratiose_bouw_vs_andere_sectoren"
    xml_path = download_dir / "data.xml"
    csv_path = analysis_dir / "cbratiose_bouw_vs_andere_sectoren_long.csv"
    sector_codelist_path = root_dir / "downloads" / "cbratiose_bouw_vs_alle_sectoren" / "CL_AA_SECTOR.xml"
    ratio_codelist_path = root_dir / "downloads" / "cbratiose_bouw_vs_alle_sectoren" / "CL_CBRATIOSE_ITEM.xml"

    if csv_path.exists():
        frame = pd.read_csv(csv_path)
        frame["year"] = frame["year"].astype(int)
        return frame

    download_dir.mkdir(parents=True, exist_ok=True)
    analysis_dir.mkdir(parents=True, exist_ok=True)

    response = requests.get(PEER_DATA_URL, timeout=60)
    response.raise_for_status()
    xml_bytes = response.content
    xml_path.write_bytes(xml_bytes)

    rows = parse_generic_data(xml_bytes)
    frame = pd.DataFrame(rows)
    sector_labels = parse_codelist_labels(sector_codelist_path)
    ratio_labels = parse_codelist_labels(ratio_codelist_path)

    frame["year"] = pd.to_numeric(frame["TIME_PERIOD"], errors="coerce").astype(int)
    frame["value"] = pd.to_numeric(frame["OBS_VALUE"], errors="coerce")
    frame["sector_code"] = frame["SECTOR"]
    frame["sector_label_nl"] = frame["sector_code"].map(sector_labels)
    frame["sector_short_label"] = frame["sector_label_nl"].map(sector_short_label)
    frame["ratio_code"] = frame["CBRATIOSE_ITEM"]
    frame["ratio_label_nl"] = frame["ratio_code"].map(ratio_labels)

    keep_columns = [
        "year",
        "ratio_code",
        "ratio_label_nl",
        "sector_code",
        "sector_label_nl",
        "sector_short_label",
        "value",
    ]
    frame = frame[keep_columns].sort_values(["ratio_code", "sector_code", "year"], kind="stable")
    frame.to_csv(csv_path, index=False)
    return frame


def ensure_lower_subsector_frame(root_dir: Path) -> pd.DataFrame:
    download_dir = root_dir / "downloads" / "cbratiose_bouwsubsectoren"
    analysis_dir = root_dir / "analysis" / "cbratiose_bouwsubsectoren"
    xml_path = download_dir / "data.xml"
    csv_path = analysis_dir / "cbratiose_bouwsubsectoren_long.csv"
    sector_codelist_path = root_dir / "downloads" / "cbratiose_bouw_vs_alle_sectoren" / "CL_AA_SECTOR.xml"
    ratio_codelist_path = root_dir / "downloads" / "cbratiose_bouw_vs_alle_sectoren" / "CL_CBRATIOSE_ITEM.xml"

    if csv_path.exists():
        frame = pd.read_csv(csv_path)
        frame["year"] = frame["year"].astype(int)
        return frame

    download_dir.mkdir(parents=True, exist_ok=True)
    analysis_dir.mkdir(parents=True, exist_ok=True)

    response = requests.get(LOWER_SUBSECTOR_DATA_URL, timeout=60)
    response.raise_for_status()
    xml_bytes = response.content
    xml_path.write_bytes(xml_bytes)

    rows = parse_generic_data(xml_bytes)
    frame = pd.DataFrame(rows)
    sector_labels = parse_codelist_labels(sector_codelist_path)
    ratio_labels = parse_codelist_labels(ratio_codelist_path)

    frame["year"] = pd.to_numeric(frame["TIME_PERIOD"], errors="coerce").astype(int)
    frame["value"] = pd.to_numeric(frame["OBS_VALUE"], errors="coerce")
    frame["sector_code"] = frame["SECTOR"]
    frame["sector_label_nl"] = frame["sector_code"].map(sector_labels)
    frame["sector_short_label"] = frame.apply(
        lambda row: lower_subsector_short_label(str(row["sector_code"]), str(row["sector_label_nl"])),
        axis=1,
    )
    frame["ratio_code"] = frame["CBRATIOSE_ITEM"]
    frame["ratio_label_nl"] = frame["ratio_code"].map(ratio_labels)

    keep_columns = [
        "year",
        "ratio_code",
        "ratio_label_nl",
        "sector_code",
        "sector_label_nl",
        "sector_short_label",
        "value",
    ]
    frame = frame[keep_columns].sort_values(["ratio_code", "sector_code", "year"], kind="stable")
    frame.to_csv(csv_path, index=False)
    return frame


def metric_frame(frame: pd.DataFrame, ratio_code: str, dispersion_code: str, scheme_code: str) -> pd.DataFrame:
    subset = frame[
        (frame["ratio_code"] == ratio_code)
        & (frame["dispersion_code"] == dispersion_code)
        & (frame["scheme_code"] == scheme_code)
    ].copy()
    return subset.sort_values("year", kind="stable")


def metric_latest(frame: pd.DataFrame, ratio_code: str, dispersion_code: str, scheme_code: str) -> pd.Series:
    subset = metric_frame(frame, ratio_code, dispersion_code, scheme_code)
    if subset.empty:
        raise ValueError(f"Geen data voor {ratio_code} {dispersion_code} {scheme_code}")
    return subset.iloc[-1]


def latest_non_null_row(frame: pd.DataFrame, value_column: str) -> pd.Series:
    subset = frame[frame[value_column].notna()].copy()
    if subset.empty:
        raise ValueError("Geen niet-lege observatie beschikbaar.")
    return subset.iloc[-1]


def score_gap(left: float | None, right: float | None, higher_is_better: bool) -> float:
    if left is None or right is None or pd.isna(left) or pd.isna(right):
        return 0.0
    raw_gap = float(left) - float(right)
    if not higher_is_better:
        raw_gap = -raw_gap
    scale = max(abs(float(right)), 1.0)
    return raw_gap / scale


def label_from_score(score: float) -> str:
    if score >= 0.05:
        return "sterk"
    if score <= -0.05:
        return "kwetsbaar"
    return "gemengd"


def trend_label(scores: list[float]) -> str:
    usable = [value for value in scores if not math.isnan(value)]
    if len(usable) < 4:
        return "vrij stabiel"
    start = sum(usable[:2]) / 2
    end = sum(usable[-2:]) / 2
    delta = end - start
    if delta >= 0.03:
        return "verbetert"
    if delta <= -0.03:
        return "verslechtert"
    return "vrij stabiel"


def assessment_for_theme(frame: pd.DataFrame, theme: Theme) -> Assessment:
    latest_year = int(frame["year"].max())
    ratio_a, ratio_b = theme.metrics
    latest_a = metric_latest(frame, ratio_a, "dispg", theme.latest_basis_scheme)
    latest_b = metric_latest(frame, ratio_b, "dispg", theme.latest_basis_scheme)

    score_a = score_gap(latest_a["value_pu300"], latest_a["value_pu450"], theme.metric_directions[0])
    score_b = score_gap(latest_b["value_pu300"], latest_b["value_pu450"], theme.metric_directions[1])
    label = label_from_score((score_a + score_b) / 2)

    scheme_scores: list[float] = []
    for year in sorted(frame["year"].unique()):
        year_scores: list[float] = []
        for ratio_code, direction in zip(theme.metrics, theme.metric_directions):
            subset = frame[
                (frame["year"] == year)
                & (frame["ratio_code"] == ratio_code)
                & (frame["dispersion_code"] == "dispg")
                & (frame["scheme_code"] == theme.latest_basis_scheme)
            ]
            if subset.empty:
                continue
            row = subset.iloc[0]
            year_scores.append(score_gap(row["value_pu300"], row["value_pu450"], direction))
        if year_scores:
            scheme_scores.append(sum(year_scores) / len(year_scores))
    trend = trend_label(scheme_scores)

    latest_a_fmt = text_format(latest_a["value_pu300"], theme.y_formats[0])
    latest_a_bench = text_format(latest_a["value_pu450"], theme.y_formats[0])
    latest_b_fmt = text_format(latest_b["value_pu300"], theme.y_formats[1])
    latest_b_bench = text_format(latest_b["value_pu450"], theme.y_formats[1])

    if theme.key == "profitability":
        summary = (
            f"In {latest_year} ligt de brutomarge van de bouwsector onder het brede sectorgemiddelde, "
            f"maar de nettoverkoopmarge erboven."
        )
    elif theme.key == "liquidity":
        summary = (
            f"In {latest_year} is de ruime liquiditeit van de bouwsector sterker dan gemiddeld, "
            f"terwijl de enge liquiditeit bijna gelijk loopt."
        )
    elif theme.key == "balance":
        summary = (
            f"In {latest_year} draait de bouwsector meer cashflow op eigen vermogen, "
            f"maar met een minder onafhankelijke balansstructuur."
        )
    elif theme.key == "payments":
        summary = (
            f"In {latest_year} wacht de bouwsector beduidend langer op klantenbetalingen "
            f"en leunt hij ook langer op leverancierskrediet."
        )
    elif theme.key == "productivity":
        summary = (
            f"In {latest_year} produceert de bouwsector minder toegevoegde waarde per personeelslid "
            f"en slorpen personeelskosten een groter deel van die waarde op."
        )
    else:
        summary = (
            f"In {latest_year} ligt de investeringsintensiteit van de bouwsector dicht bij het gemiddelde, "
            f"terwijl de vernieuwingsgraad hoger uitkomt."
        )

    if theme.key == "profitability":
        metrics = f"Bruto {latest_a_fmt} vs {latest_a_bench} | Netto {latest_b_fmt} vs {latest_b_bench}"
    elif theme.key == "liquidity":
        metrics = f"Current {latest_a_fmt} vs {latest_a_bench} | Quick {latest_b_fmt} vs {latest_b_bench}"
    elif theme.key == "balance":
        metrics = f"CF/EV {latest_a_fmt} vs {latest_a_bench} | Onafh. {latest_b_fmt} vs {latest_b_bench}"
    elif theme.key == "payments":
        metrics = f"Klanten {latest_a_fmt} vs {latest_a_bench} | Lever. {latest_b_fmt} vs {latest_b_bench}"
    elif theme.key == "productivity":
        metrics = f"TW/pers. {latest_a_fmt} vs {latest_a_bench} | PK/TW {latest_b_fmt} vs {latest_b_bench}"
    else:
        metrics = f"Invest. {latest_a_fmt} vs {latest_a_bench} | Vernieuw. {latest_b_fmt} vs {latest_b_bench}"
    return Assessment(area=theme.area, status_label=label, trend_label=trend, summary=summary, metrics=metrics)


def plot_stoplight_dashboard(
    assessments: list[Assessment],
    year_label: str,
    output_path: Path,
) -> None:
    fig, ax = plt.subplots(figsize=(11.8, 7.8))
    fig.patch.set_facecolor("#f6f1e8")
    ax.set_facecolor("#f6f1e8")
    ax.axis("off")

    ax.text(0.04, 0.94, f"Bouwsector versus alle sectoren - stoplichtoverzicht {year_label}", fontsize=20, fontweight="bold", color="#17324d")
    ax.text(
        0.04,
        0.89,
        "Focus: NBB-ratiovergelijking voor PU300 (Bouwnijverheid) tegenover PU450 (geheel van de sectoren), op basis van gewogen gemiddelden voor model T.",
        fontsize=10.5,
        color="#4b5563",
    )

    positions = [
        (0.03, 0.56),
        (0.355, 0.56),
        (0.68, 0.56),
        (0.03, 0.14),
        (0.355, 0.14),
        (0.68, 0.14),
    ]
    width = 0.285
    height = 0.30

    for assessment, (x, y) in zip(assessments, positions):
        status_style = STATUS_STYLES[assessment.status_label]
        trend_style = STATUS_STYLES[assessment.trend_label]
        summary_text = textwrap.fill(assessment.summary, width=38)
        tile = FancyBboxPatch(
            (x, y),
            width,
            height,
            boxstyle="round,pad=0.015,rounding_size=0.02",
            linewidth=1.8,
            edgecolor=status_style["edge"],
            facecolor=status_style["bg"],
        )
        ax.add_patch(tile)

        ax.text(x + 0.017, y + height - 0.05, assessment.area, fontsize=11.3, fontweight="bold", color="#132238")
        ax.text(
            x + 0.017,
            y + height - 0.095,
            f"Vandaag: {assessment.status_label}",
            fontsize=9.6,
            color=status_style["text"],
            fontweight="bold",
        )
        ax.text(
            x + 0.017,
            y + height - 0.125,
            f"Evolutie: {assessment.trend_label}",
            fontsize=9.4,
            color=trend_style["text"],
            fontweight="bold",
        )
        ax.text(x + 0.017, y + 0.105, summary_text, fontsize=9.1, color="#1f2937", va="top")

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def plot_theme_grid(frame: pd.DataFrame, theme: Theme, output_path: Path) -> None:
    fig, axes = plt.subplots(2, 4, figsize=(15.5, 7.8), sharex=False)
    plt.style.use("seaborn-v0_8-whitegrid")

    for col, scheme_code in enumerate(SCHEME_ORDER):
        for row_idx, ratio_code in enumerate(theme.metrics):
            ax = axes[row_idx][col]
            subset = metric_frame(frame, ratio_code, "dispg", scheme_code)
            if subset.empty:
                ax.set_visible(False)
                continue

            metric_title = PANEL_METRIC_LABELS.get(ratio_code, str(subset["ratio_label_nl"].iloc[0]).split(". ", 1)[-1])
            metric_title = textwrap.fill(metric_title, width=24)

            ax.plot(subset["year"], subset["value_pu300"], marker="o", linewidth=2.0, markersize=4.5, color=CHART_COLORS["bouw"], label="Bouwnijverheid")
            ax.plot(subset["year"], subset["value_pu450"], marker="o", linewidth=2.0, markersize=4.5, color=CHART_COLORS["alle"], label="Alle sectoren")
            ax.set_title(
                f"{SCHEME_LABELS[scheme_code]}\n{metric_title}",
                loc="left",
                fontsize=9.3,
                fontweight="bold",
                pad=6,
            )
            ax.yaxis.set_major_formatter(formatter_for(theme.y_formats[row_idx]))
            ax.grid(True, axis="y", linestyle="--", linewidth=0.6, alpha=0.6)
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
            ax.tick_params(axis="x", labelrotation=45, labelsize=8)
            ax.tick_params(axis="y", labelsize=8)

    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.02))
    fig.suptitle(f"{theme.area}: bouwsector versus alle sectoren", x=0.02, ha="left", fontsize=16, fontweight="bold", y=1.03)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def plot_counts_grid(frame: pd.DataFrame, output_path: Path) -> None:
    counts = frame[frame["dispersion_code"] == "dispnb"].copy()
    counts = (
        counts.groupby(["year", "scheme_code"], as_index=False)[["value_pu300", "value_pu450"]]
        .median()
        .sort_values(["scheme_code", "year"], kind="stable")
    )

    fig, axes = plt.subplots(1, 4, figsize=(15.5, 3.8), sharey=False)
    plt.style.use("seaborn-v0_8-whitegrid")

    for col, scheme_code in enumerate(SCHEME_ORDER):
        ax = axes[col]
        subset = counts[counts["scheme_code"] == scheme_code]
        ax.plot(subset["year"], subset["value_pu300"], marker="o", linewidth=2.0, markersize=4.0, color=CHART_COLORS["bouw"], label="Bouwnijverheid")
        ax.plot(subset["year"], subset["value_pu450"], marker="o", linewidth=2.0, markersize=4.0, color=CHART_COLORS["alle"], label="Alle sectoren")
        ax.set_title(SCHEME_LABELS[scheme_code], loc="left", fontsize=10.5, fontweight="bold")
        ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _pos: f"{value:,.0f}".replace(",", ".")))
        ax.grid(True, axis="y", linestyle="--", linewidth=0.6, alpha=0.6)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.tick_params(axis="x", labelrotation=45, labelsize=8)
        ax.tick_params(axis="y", labelsize=8)

    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.02))
    fig.suptitle("Aantal ondernemingen per model: mediane N over ratios", x=0.02, ha="left", fontsize=16, fontweight="bold", y=1.05)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def plot_peer_sector_theme(peer_frame: pd.DataFrame, theme: Theme, output_path: Path) -> None:
    fig, axes = plt.subplots(2, 1, figsize=(11.8, 7.6), sharex=True)
    plt.style.use("seaborn-v0_8-whitegrid")
    other_color_palette = ["#c7c7c7", "#bcbcbc", "#b0b0b0", "#a4a4a4", "#999999", "#8f8f8f"]

    for ax, ratio_code, y_format in zip(axes, theme.metrics, theme.y_formats):
        ratio_frame = peer_frame[peer_frame["ratio_code"] == ratio_code].copy()
        ratio_frame = ratio_frame.sort_values(["sector_code", "year"], kind="stable")

        other_codes = [code for code in PEER_SECTOR_CODES if code != "PU300"]
        for idx, sector_code in enumerate(other_codes):
            sector_data = ratio_frame[ratio_frame["sector_code"] == sector_code]
            if sector_data.empty:
                continue
            color = other_color_palette[idx % len(other_color_palette)]
            ax.plot(
                sector_data["year"],
                sector_data["value"],
                color=color,
                linewidth=1.3,
                alpha=0.9,
                zorder=1,
            )

        bouw_data = ratio_frame[ratio_frame["sector_code"] == "PU300"]
        ax.plot(
            bouw_data["year"],
            bouw_data["value"],
            color=CHART_COLORS["bouw"],
            linewidth=2.8,
            alpha=1.0,
            zorder=3,
        )

        last = bouw_data.iloc[-1]
        ax.annotate(
            "Bouwnijverheid",
            xy=(last["year"], last["value"]),
            xytext=(8, 0),
            textcoords="offset points",
            color=CHART_COLORS["bouw"],
            fontsize=9.5,
            va="center",
            fontweight="bold",
        )
        ax.set_title(PANEL_METRIC_LABELS[ratio_code], loc="left", fontsize=11, fontweight="bold")
        ax.yaxis.set_major_formatter(formatter_for(y_format))
        ax.grid(True, axis="y", linestyle="--", linewidth=0.6, alpha=0.6)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    handles = [
        Line2D([0], [0], color=CHART_COLORS["bouw"], linewidth=2.8, label="Bouwnijverheid"),
        Line2D([0], [0], color="#a8a8a8", linewidth=1.5, label="Andere sectoren"),
    ]
    fig.legend(handles=handles, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.01))
    fig.suptitle(PEER_THEME_TITLES[theme.key], x=0.02, ha="left", fontsize=16, fontweight="bold", y=1.03)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def build_peer_summary_table(peer_frame: pd.DataFrame, theme: Theme) -> list[str]:
    latest_year = int(peer_frame["year"].max())
    rows = []
    for ratio_code, y_format in zip(theme.metrics, theme.y_formats):
        subset = peer_frame[(peer_frame["ratio_code"] == ratio_code) & (peer_frame["year"] == latest_year)].copy()
        subset = subset[subset["value"].notna()].copy()
        subset = subset.sort_values("value", ascending=False, kind="stable")
        bouw = subset[subset["sector_code"] == "PU300"].iloc[0]
        higher_is_better = theme.metric_directions[0] if ratio_code == theme.metrics[0] else theme.metric_directions[1]
        if not higher_is_better:
            subset = subset.sort_values("value", ascending=True, kind="stable").reset_index(drop=True)
            rank = int(subset.index[subset["sector_code"] == "PU300"][0]) + 1
        else:
            subset = subset.reset_index(drop=True)
            rank = int(subset.index[subset["sector_code"] == "PU300"][0]) + 1
        total = len(subset)
        rows.append(
            "| "
            f"{PANEL_METRIC_LABELS[ratio_code]} | "
            f"{text_format(bouw['value'], y_format)} | "
            f"{rank}/{total} |"
        )
    return [
        f"**Positie van de bouwsector in {latest_year} binnen deze sectorselectie**",
        "",
        "| Ratio | Bouwsector | Rang |",
        "| --- | ---: | ---: |",
        *rows,
    ]


def peer_sector_list(peer_frame: pd.DataFrame) -> list[str]:
    labels = (
        peer_frame[["sector_code", "sector_short_label"]]
        .drop_duplicates()
        .assign(sector_code=lambda df: pd.Categorical(df["sector_code"], categories=PEER_SECTOR_CODES, ordered=True))
        .sort_values("sector_code", kind="stable")
    )
    return [str(label) for label in labels["sector_short_label"].tolist()]


def build_peer_sector_table_figure(peer_frame: pd.DataFrame, theme: Theme, output_path: Path) -> None:
    years = sorted(peer_frame["year"].unique())
    fig, axes = plt.subplots(2, 1, figsize=(12.4, 6.8))
    fig.patch.set_facecolor("white")

    for ax, ratio_code, y_format in zip(axes, theme.metrics, theme.y_formats):
        ax.axis("off")
        subset = peer_frame[peer_frame["ratio_code"] == ratio_code].copy()
        latest_year = max(years)
        latest_values = (
            subset[subset["year"] == latest_year][["sector_code", "value"]]
            .rename(columns={"value": "latest_value"})
        )
        pivot = (
            subset.pivot_table(index=["sector_code", "sector_short_label"], columns="year", values="value", aggfunc="first")
            .reset_index()
        )
        pivot = pivot.merge(latest_values, on="sector_code", how="left")
        pivot["latest_missing"] = pivot["latest_value"].isna()
        pivot = pivot.sort_values(["latest_missing", "latest_value", "sector_short_label"], ascending=[True, False, True], kind="stable")

        header = ["Sector"] + [str(year) for year in years]
        cell_text = []
        for _, row in pivot.iterrows():
            values = [text_format(row[year], y_format) for year in years]
            cell_text.append([row["sector_short_label"]] + values)

        table = ax.table(
            cellText=cell_text,
            colLabels=header,
            loc="center",
            cellLoc="center",
            colLoc="center",
            bbox=[0, 0, 1, 0.92],
        )
        table.auto_set_font_size(False)
        table.set_fontsize(6.9)
        table.scale(1, 1.25)

        highlighted_row_index = None
        for idx, row_values in enumerate(cell_text, start=1):
            if row_values and row_values[0] == "Bouwnijverheid":
                highlighted_row_index = idx
                break

        for (row, col), cell in table.get_celld().items():
            if row == 0:
                cell.set_facecolor("#e8eef7")
                cell.set_text_props(weight="bold", color="#1f2937")
            elif highlighted_row_index is not None and row == highlighted_row_index:
                cell.set_facecolor("#dce9f8")
                cell.set_text_props(weight="bold", color="#0f4c81")
            elif row % 2 == 0:
                cell.set_facecolor("#f8f9fb")
            else:
                cell.set_facecolor("white")
            cell.set_edgecolor("#d1d5db")
            cell.set_linewidth(0.4)

        ax.set_title(
            f"{PANEL_METRIC_LABELS[ratio_code]} (gesorteerd op {latest_year})",
            loc="left",
            fontsize=10,
            fontweight="bold",
            pad=6,
        )

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def adjust_end_label_positions(values: list[float]) -> list[float]:
    if not values:
        return []
    lower = min(values)
    upper = max(values)
    span = max(upper - lower, 1.0)
    min_gap = span * 0.08

    adjusted = values[:]
    for idx in range(1, len(adjusted)):
        adjusted[idx] = max(adjusted[idx], adjusted[idx - 1] + min_gap)

    overflow = adjusted[-1] - (upper + min_gap)
    if overflow > 0:
        adjusted = [value - overflow for value in adjusted]

    underflow = (lower - min_gap) - adjusted[0]
    if underflow > 0:
        adjusted = [value + underflow for value in adjusted]

    return adjusted


def subsector_list(lower_subsector_frame: pd.DataFrame) -> list[str]:
    labels = (
        lower_subsector_frame[["sector_code", "sector_short_label"]]
        .drop_duplicates()
        .assign(sector_code=lambda df: pd.Categorical(df["sector_code"], categories=LOWER_SUBSECTOR_CODES, ordered=True))
        .sort_values("sector_code", kind="stable")
    )
    return [str(label) for label in labels["sector_short_label"].tolist()]


def plot_lower_subsector_theme(lower_subsector_frame: pd.DataFrame, theme: Theme, output_path: Path) -> None:
    fig, axes = plt.subplots(2, 1, figsize=(11.8, 7.8), sharex=True)
    plt.style.use("seaborn-v0_8-whitegrid")

    for ax, ratio_code, y_format in zip(axes, theme.metrics, theme.y_formats):
        ratio_frame = lower_subsector_frame[lower_subsector_frame["ratio_code"] == ratio_code].copy()
        ratio_frame = ratio_frame.sort_values(["sector_code", "year"], kind="stable")
        xmin = int(ratio_frame["year"].min())
        xmax = int(ratio_frame["year"].max())
        label_x = xmax + 0.45

        label_points: list[tuple[float, str, str]] = []
        for sector_code in LOWER_SUBSECTOR_CODES:
            sector_data = ratio_frame[ratio_frame["sector_code"] == sector_code]
            if sector_data.empty:
                continue
            color = LOWER_SUBSECTOR_COLORS.get(sector_code, CHART_COLORS["muted"])
            ax.plot(
                sector_data["year"],
                sector_data["value"],
                color=color,
                linewidth=2.0,
                alpha=0.95,
            )
            valid_sector_data = sector_data[sector_data["value"].notna()]
            if valid_sector_data.empty:
                continue
            last = valid_sector_data.iloc[-1]
            label_points.append((float(last["value"]), sector_code, color))

        label_points.sort(key=lambda item: item[0])
        adjusted_positions = adjust_end_label_positions([item[0] for item in label_points])
        for (original_y, sector_code, color), adjusted_y in zip(label_points, adjusted_positions):
            label = LOWER_SUBSECTOR_LABELS.get(sector_code, sector_code)
            ax.plot([xmax, label_x - 0.05], [original_y, adjusted_y], color=color, linewidth=0.7, alpha=0.8)
            ax.text(
                label_x,
                adjusted_y,
                label,
                color=color,
                fontsize=8.7,
                va="center",
                fontweight="bold",
                bbox={"boxstyle": "round,pad=0.15", "facecolor": "white", "edgecolor": "none", "alpha": 0.8},
            )

        ax.set_title(PANEL_METRIC_LABELS[ratio_code], loc="left", fontsize=11, fontweight="bold")
        ax.yaxis.set_major_formatter(formatter_for(y_format))
        ax.grid(True, axis="y", linestyle="--", linewidth=0.6, alpha=0.6)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.set_xlim(xmin, xmax + 2.6)

    fig.suptitle(f"{PEER_THEME_TITLES[theme.key]} binnen de bouwsubsectoren", x=0.02, ha="left", fontsize=16, fontweight="bold", y=1.02)
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def build_lower_subsector_table_figure(lower_subsector_frame: pd.DataFrame, theme: Theme, output_path: Path) -> None:
    years = sorted(lower_subsector_frame["year"].unique())
    fig, axes = plt.subplots(2, 1, figsize=(12.4, 6.8))
    fig.patch.set_facecolor("white")

    for ax, ratio_code, y_format in zip(axes, theme.metrics, theme.y_formats):
        ax.axis("off")
        subset = lower_subsector_frame[lower_subsector_frame["ratio_code"] == ratio_code].copy()
        latest_year = max(years)
        latest_values = (
            subset[subset["year"] == latest_year][["sector_code", "value"]]
            .rename(columns={"value": "latest_value"})
        )
        pivot = (
            subset.pivot_table(index=["sector_code", "sector_short_label"], columns="year", values="value", aggfunc="first")
            .reset_index()
        )
        pivot = pivot.merge(latest_values, on="sector_code", how="left")
        pivot["latest_missing"] = pivot["latest_value"].isna()
        pivot = pivot.sort_values(["latest_missing", "latest_value", "sector_short_label"], ascending=[True, False, True], kind="stable")

        header = ["Subsector"] + [str(year) for year in years]
        cell_text = []
        for _, row in pivot.iterrows():
            values = [text_format(row[year], y_format) for year in years]
            cell_text.append([row["sector_short_label"]] + values)

        table = ax.table(
            cellText=cell_text,
            colLabels=header,
            loc="center",
            cellLoc="center",
            colLoc="center",
            bbox=[0, 0, 1, 0.92],
        )
        table.auto_set_font_size(False)
        table.set_fontsize(6.8)
        table.scale(1, 1.25)

        label_to_code = {value: key for key, value in LOWER_SUBSECTOR_LABELS.items()}
        for (row, col), cell in table.get_celld().items():
            if row == 0:
                cell.set_facecolor("#e8eef7")
                cell.set_text_props(weight="bold", color="#1f2937")
            elif row % 2 == 0:
                cell.set_facecolor("#f8f9fb")
            else:
                cell.set_facecolor("white")
            cell.set_edgecolor("#d1d5db")
            cell.set_linewidth(0.4)
            if row > 0 and col == 0:
                sector_code = label_to_code.get(cell.get_text().get_text())
                if sector_code:
                    cell.set_text_props(weight="bold", color=LOWER_SUBSECTOR_COLORS.get(sector_code, "#1f2937"))

        ax.set_title(
            f"{PANEL_METRIC_LABELS[ratio_code]} (gesorteerd op {latest_year})",
            loc="left",
            fontsize=10,
            fontweight="bold",
            pad=6,
        )

    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.close(fig)


def subsector_theme_narrative(lower_subsector_frame: pd.DataFrame, theme: Theme) -> str:
    latest_year = int(lower_subsector_frame["year"].max())
    parts: list[str] = []
    for ratio_code, higher_is_better, y_format in zip(theme.metrics, theme.metric_directions, theme.y_formats):
        subset = lower_subsector_frame[
            (lower_subsector_frame["ratio_code"] == ratio_code)
            & (lower_subsector_frame["year"] == latest_year)
        ].copy()
        subset = subset[subset["value"].notna()].copy()
        subset = subset.sort_values("value", ascending=not higher_is_better, kind="stable").reset_index(drop=True)
        top = subset.iloc[0]
        bottom = subset.iloc[-1]
        parts.append(
            f"op {PANEL_METRIC_LABELS[ratio_code].lower()} staat {top['sector_short_label'].lower()} bovenaan "
            f"met {text_format(top['value'], y_format)}, terwijl {bottom['sector_short_label'].lower()} onderaan staat "
            f"met {text_format(bottom['value'], y_format)}"
        )
    return f"In {latest_year} geldt binnen deze diepere bouwsubsectoren dat {parts[0]}; {parts[1]}."


def peer_rank_text(peer_frame: pd.DataFrame, ratio_code: str, higher_is_better: bool) -> tuple[int, int, float]:
    latest_year = int(peer_frame["year"].max())
    subset = peer_frame[(peer_frame["ratio_code"] == ratio_code) & (peer_frame["year"] == latest_year)].copy()
    subset = subset[subset["value"].notna()].copy()
    ascending = not higher_is_better
    subset = subset.sort_values("value", ascending=ascending, kind="stable").reset_index(drop=True)
    bouw = subset[subset["sector_code"] == "PU300"].iloc[0]
    rank = int(subset.index[subset["sector_code"] == "PU300"][0]) + 1
    return rank, len(subset), float(bouw["value"])


def peer_theme_narrative(peer_frame: pd.DataFrame, theme: Theme) -> str:
    latest_year = int(peer_frame["year"].max())
    rank_a, total_a, value_a = peer_rank_text(peer_frame, theme.metrics[0], theme.metric_directions[0])
    rank_b, total_b, value_b = peer_rank_text(peer_frame, theme.metrics[1], theme.metric_directions[1])

    metric_a_fmt = text_format(value_a, theme.y_formats[0])
    metric_b_fmt = text_format(value_b, theme.y_formats[1])

    return (
        f"Voor {latest_year} is de bouwsector binnen deze selectie van hoofdsectoren "
        f"{rank_a}/{total_a} op {PANEL_METRIC_LABELS[theme.metrics[0]].lower()} ({metric_a_fmt}) "
        f"en {rank_b}/{total_b} op {PANEL_METRIC_LABELS[theme.metrics[1]].lower()} ({metric_b_fmt})."
    )


def theme_narrative(frame: pd.DataFrame, theme: Theme) -> str:
    latest_year = int(frame["year"].max())
    metric_a = metric_latest(frame, theme.metrics[0], "dispg", theme.latest_basis_scheme)
    metric_b = metric_latest(frame, theme.metrics[1], "dispg", theme.latest_basis_scheme)
    if theme.key == "profitability":
        return (
            f"In {latest_year} ligt de brutoverkoopmarge van de bouwsector op {format_percent(metric_a['value_pu300'])} tegenover {format_percent(metric_a['value_pu450'])} voor alle sectoren, "
            f"terwijl de nettoverkoopmarge net hoger uitkomt ({format_percent(metric_b['value_pu300'])} tegenover {format_percent(metric_b['value_pu450'])}). "
            f"Dat suggereert dat de bouw minder marge op de kernactiviteit houdt, maar finaal niet slechter hoeft af te sluiten."
        )
    if theme.key == "liquidity":
        return (
            f"In {latest_year} haalt de bouwsector een current ratio van {format_ratio(metric_a['value_pu300'])} tegenover {format_ratio(metric_a['value_pu450'])}, "
            f"maar op quick ratio ligt hij met {format_ratio(metric_b['value_pu300'])} net onder het brede gemiddelde van {format_ratio(metric_b['value_pu450'])}. "
            f"De ruime buffer is dus beter, de direct beschikbare buffer niet duidelijk sterker."
        )
    if theme.key == "balance":
        return (
            f"In {latest_year} ligt cashflow op eigen vermogen in de bouwsector hoger ({format_percent(metric_a['value_pu300'])} tegenover {format_percent(metric_a['value_pu450'])}), "
            f"maar de financiele onafhankelijkheid lager ({format_percent(metric_b['value_pu300'])} tegenover {format_percent(metric_b['value_pu450'])}). "
            f"De sector draait dus cash, maar met minder balansbuffer."
        )
    if theme.key == "payments":
        spread_bouw = metric_latest(frame, "R020", "dispg", "T")["value_pu300"] - metric_latest(frame, "R019", "dispg", "T")["value_pu300"]
        spread_alle = metric_latest(frame, "R020", "dispg", "T")["value_pu450"] - metric_latest(frame, "R019", "dispg", "T")["value_pu450"]
        return (
            f"In {latest_year} wacht de bouwsector gemiddeld {format_days(metric_a['value_pu300'])} op klantenbetalingen tegenover {format_days(metric_a['value_pu450'])} in het brede gemiddelde. "
            f"Leverancierskrediet ligt ook hoger ({format_days(metric_b['value_pu300'])} tegenover {format_days(metric_b['value_pu450'])}), maar het netto betalingskussen blijft kleiner "
            f"({format_days(spread_bouw)} tegenover {format_days(spread_alle)})."
        )
    if theme.key == "productivity":
        return (
            f"In {latest_year} bedraagt de toegevoegde waarde per personeelslid in de bouwsector {format_euro(metric_a['value_pu300'])} tegenover {format_euro(metric_a['value_pu450'])}, "
            f"terwijl personeelskosten {format_percent(metric_b['value_pu300'])} van de toegevoegde waarde opslorpen tegenover {format_percent(metric_b['value_pu450'])}. "
            f"Dat wijst op een dunnere productiviteitsbuffer dan in het brede sectorgemiddelde."
        )
    return (
        f"In {latest_year} ligt de investeringsintensiteit van de bouwsector op {format_percent(metric_a['value_pu300'])} tegenover {format_percent(metric_a['value_pu450'])}, "
        f"terwijl de vernieuwingsgraad hoger uitkomt ({format_percent(metric_b['value_pu300'])} tegenover {format_percent(metric_b['value_pu450'])}). "
        f"De bouw investeert dus niet veel zwaarder dan gemiddeld, maar vernieuwt zijn materiele activa wel sneller."
    )


def latest_year_table_lines(frame: pd.DataFrame, theme: Theme) -> list[str]:
    latest_year = int(frame["year"].max())
    header_a, header_b = TABLE_HEADERS[theme.key]
    lines = [
        f"**Laatste jaar ({latest_year}) per model: gewogen gemiddelde**",
        "",
        "| Model | Bouw " + header_a + " | Alle " + header_a + " | Bouw " + header_b + " | Alle " + header_b + " |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for scheme_code in SCHEME_ORDER:
        mean_row_a = metric_latest(frame, theme.metrics[0], "dispg", scheme_code)
        mean_row_b = metric_latest(frame, theme.metrics[1], "dispg", scheme_code)
        lines.append(
            "| "
            f"{SCHEME_LABELS[scheme_code]} | "
            f"{text_format(mean_row_a['value_pu300'], theme.y_formats[0])} | "
            f"{text_format(mean_row_a['value_pu450'], theme.y_formats[0])} | "
            f"{text_format(mean_row_b['value_pu300'], theme.y_formats[1])} | "
            f"{text_format(mean_row_b['value_pu450'], theme.y_formats[1])} |"
        )
    lines.extend(
        [
            "",
            "Mediaan (`dispq2`) en aantal ondernemingen (`dispnb`) blijven beschikbaar in de analyse-CSV.",
        ]
    )
    return lines


def relative_path(path: Path, base_dir: Path) -> str:
    return Path(os.path.relpath(path, base_dir)).as_posix()


def model_explanation_lines() -> list[str]:
    lines = [
        "### Betekenis van de modellen",
        "",
    ]
    for item in MODEL_GUIDANCE:
        lines.append(f"- `{item['code']}` `{item['label']}`: {item['meaning']} {item['interpretation']}")
        lines.append("")
    lines.extend(
        [
            "Drempels volgens de NBB-groottecriteria voor vennootschappen:",
            "",
            "- `Verkort`: kleine vennootschap, dus maximaal 1 overschreden drempel. Sinds boekjaar startend vanaf 1 januari 2024: `50 FTE`, `EUR 11,25 miljoen omzet`, `EUR 6,0 miljoen balanstotaal`.",
            "- `Micro`: subcategorie van kleine vennootschappen. Sinds boekjaar startend vanaf 1 januari 2024: `10 FTE`, `EUR 0,9 miljoen omzet`, `EUR 0,45 miljoen balanstotaal`; bovendien geen moeder- of dochtervennootschap op balansdatum.",
            "- `Volledig`: grote vennootschap, dus 2 of 3 overschreden drempels, of beursgenoteerd.",
            "",
        ]
    )
    return lines


def build_markdown(
    frame: pd.DataFrame,
    peer_frame: pd.DataFrame,
    lower_subsector_frame: pd.DataFrame,
    assessments: list[Assessment],
    report_pdf_path: Path,
    assets_dir: Path,
) -> str:
    latest_year = int(frame["year"].max())
    min_year = int(frame["year"].min())
    lines: list[str] = []
    lines.extend(PDF_FRONTMATTER.strip().splitlines())
    lines.extend(
        [
            "",
            "# NBB-rapport: bouwsector versus alle sectoren",
            "",
            "Dit rapport gebruikt de NBB-dataset: https://dataviewer-stat.nbb.be/?chartId=a6e7262c-5128-4d39-8d36-dc3320f1ded8.",
            f"De grafieken bestrijken alle beschikbare jaren: **{min_year} t.e.m. {latest_year}**.",
            "De grafieken gebruiken het **gewogen gemiddelde (`dispg`)**.",
            "",
        ]
    )
    lines.extend(
        [
            "## Wat berekenen de indicatoren?",
            "",
        ]
    )
    for item in INDICATOR_GUIDANCE:
        lines.append(f"- `{item['theme']}` `{item['metric']}`: {item['formula']} Interpretatie: {item['reading']}")
        lines.append("")

    lines.extend(
        [
            "## Vergelijking met andere sectoren",
            "",
            "De bouwsector staat telkens in blauw. De andere hoofdsectoren staan als afzonderlijke grijze lijnen in dezelfde grafiek, zonder uitgebreide legenda.",
            "",
        ]
    )
    lines.append("Deze sectoren werden geanalyseerd:")
    lines.append("")
    for sector_name in peer_sector_list(peer_frame):
        lines.append(f"- {sector_name}")
    lines.append("")

    for theme in THEMES:
        peer_chart_path = assets_dir / f"bouwsector-peers-{theme.key}.png"
        peer_table_path = assets_dir / f"bouwsector-peers-table-{theme.key}.png"
        lines.extend(
            [
                "\\clearpage",
                "",
                f"### {theme.area}",
                "",
                peer_theme_narrative(peer_frame, theme),
                "",
            ]
        )
        lines.extend(build_peer_summary_table(peer_frame, theme))
        lines.extend(
            [
                "",
                f"![{PEER_THEME_TITLES[theme.key]}]({relative_path(peer_chart_path, report_pdf_path.parent)}){{ width=95% }}",
                "",
                f"![{PEER_THEME_TITLES[theme.key]} tabel]({relative_path(peer_table_path, report_pdf_path.parent)}){{ width=95% }}",
                "",
            ]
        )

    lines.extend(
        [
            "## Vergelijking tussen bouwsubsectoren",
            "",
            "Dit hoofdstuk gaat nog een niveau dieper binnen de bouwsector en vergelijkt de onderliggende bouwsubsectoren onderling, opnieuw op basis van **model `T`**.",
            "De grafieken gebruiken geen volle legenda; de lijnen worden aan het rechtereinde gelabeld zodat de vergelijking leesbaar blijft.",
            "",
            "Gebruikte bouwsubsectoren in deze vergelijking:",
            "",
        ]
    )
    for sector_name in subsector_list(lower_subsector_frame):
        lines.append(f"- {sector_name}")
    lines.append("")

    for theme in THEMES:
        subsector_chart_path = assets_dir / f"bouwsector-subsectoren-{theme.key}.png"
        subsector_table_path = assets_dir / f"bouwsector-subsectoren-table-{theme.key}.png"
        lines.extend(
            [
                "\\clearpage",
                "",
                f"### {theme.area}",
                "",
                subsector_theme_narrative(lower_subsector_frame, theme),
                "",
                f"![{theme.area} bouwsubsectoren]({relative_path(subsector_chart_path, report_pdf_path.parent)}){{ width=95% }}",
                "",
                f"![{theme.area} bouwsubsectoren tabel]({relative_path(subsector_table_path, report_pdf_path.parent)}){{ width=95% }}",
                "",
            ]
        )

    lines.extend(
        [
            "## Analyse per model",
            "",
            *model_explanation_lines(),
            "### Dekking van de dataset",
            "",
            "De grafiek hieronder toont per modeltype de mediane aantallen ondernemingen over de ratio's heen. Dat is nuttige context voor de interpretatie van de trends.",
            "",
            f"![Aantal ondernemingen per model]({relative_path(assets_dir / 'bouwsector-aantal-ondernemingen.png', report_pdf_path.parent)}){{ width=95% }}",
            "",
        ]
    )

    for theme in THEMES:
        chart_path = assets_dir / f"bouwsector-{theme.key}.png"
        lines.extend(
            [
                "\\clearpage",
                "",
                f"### {theme.area}",
                "",
                "**Wat is dit?**",
                "",
                theme.description,
                "",
                "**Hoe moet je dit lezen?**",
                "",
                theme.how_to_read,
                "",
                "**Wat betekent dit voor de bouwsector?**",
                "",
                theme_narrative(frame, theme),
                "",
            ]
        )
        lines.extend(latest_year_table_lines(frame, theme))
        lines.extend(
            [
                "",
                "**Grafiek**",
                "",
                f"![{theme.area}]({relative_path(chart_path, report_pdf_path.parent)}){{ width=95% }}",
                "",
            ]
        )

    return "\n".join(lines).strip() + "\n"


def render_pdf(markdown_path: Path, pdf_path: Path) -> None:
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "pandoc",
        markdown_path.name,
        "--pdf-engine=xelatex",
        "-o",
        str(pdf_path.resolve()),
    ]
    result = subprocess.run(
        command,
        cwd=markdown_path.parent,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or "PDF-rendering via pandoc is mislukt.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Render een bouwsectorrapport op basis van NBB CBRATIOSE-data.")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("nbb-api/analysis/cbratiose_bouw_vs_alle_sectoren/cbratiose_bouw_vs_alle_sectoren_comparison.csv"),
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=Path("nbb-api/reports/bouwsector-ratiovergelijking-nbb.md"),
    )
    parser.add_argument(
        "--pdf-output",
        type=Path,
        default=Path("nbb-api/reports/bouwsector-ratiovergelijking-nbb.pdf"),
    )
    args = parser.parse_args()

    frame = sanitize_main_frame(load_frame(args.input_csv))
    root_dir = Path(__file__).resolve().parent
    peer_frame = sanitize_series_frame(ensure_peer_sector_frame(root_dir), PEER_ANOMALIES)
    lower_subsector_frame = sanitize_series_frame(ensure_lower_subsector_frame(root_dir), LOWER_SUBSECTOR_ANOMALIES)
    latest_year = int(frame["year"].max())

    assets_dir = args.markdown_output.parent / f"{args.markdown_output.stem}-assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    assessments = [assessment_for_theme(frame, theme) for theme in THEMES]
    plot_stoplight_dashboard(assessments, str(latest_year), assets_dir / "bouwsector-stoplicht.png")
    plot_counts_grid(frame, assets_dir / "bouwsector-aantal-ondernemingen.png")
    for theme in THEMES:
        plot_theme_grid(frame, theme, assets_dir / f"bouwsector-{theme.key}.png")
        plot_peer_sector_theme(peer_frame, theme, assets_dir / f"bouwsector-peers-{theme.key}.png")
        build_peer_sector_table_figure(peer_frame, theme, assets_dir / f"bouwsector-peers-table-{theme.key}.png")
        plot_lower_subsector_theme(lower_subsector_frame, theme, assets_dir / f"bouwsector-subsectoren-{theme.key}.png")
        build_lower_subsector_table_figure(lower_subsector_frame, theme, assets_dir / f"bouwsector-subsectoren-table-{theme.key}.png")

    markdown = build_markdown(frame, peer_frame, lower_subsector_frame, assessments, args.markdown_output, assets_dir)
    args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_output.write_text(markdown, encoding="utf-8")
    render_pdf(args.markdown_output, args.pdf_output)

    print(f"Markdown: {args.markdown_output.resolve()}")
    print(f"PDF: {args.pdf_output.resolve()}")
    print(f"Assets: {assets_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
