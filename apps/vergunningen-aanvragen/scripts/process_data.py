"""
Process building permit application data from Omgevingsloket Vlaanderen.

Data source: https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen

Output structure:
- nieuwbouw_*.json - New construction data
- verbouw_*.json - Renovation data
- sloop_*.json - Demolition data
- aanvrager_yearly.json - Project applicant type data
"""

import json
from pathlib import Path
import pandas as pd

def write_json(filename, data, **kwargs):
    """Write JSON outputs to the app-local results and public data directories."""
    for target_dir in OUTPUT_DIRS:
        with open(target_dir / filename, "w", encoding="utf-8") as f:
            json.dump(data, f, **kwargs)

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
RESULTS_DIR = APP_DIR / "results"
PUBLIC_DATA_DIR = APP_DIR / "public" / "data"

RESULTS_DIR.mkdir(exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIRS = [RESULTS_DIR, PUBLIC_DATA_DIR]

def simplify_handeling(h):
    if h == "Nieuwbouw":
        return "nieuwbouw"
    if h == "Verbouwen of hergebruik":
        return "verbouw"
    if h == "Sloop":
        return "sloop"
    return "onbekend"

def group_aanvrager(a):
    if a == "Natuurlijk persoon":
        return "natuurlijk_persoon"
    if a != "Onbekend":
        return "overheid_rechtspersoon"
    return "andere"

# Read main CSV
df = pd.read_csv(
    DATA_DIR / "bouwen_of_verbouwen_van_woningen.csv",
    encoding="utf-8-sig",
    decimal=",",
    thousands="."
)

# Rename columns for easier handling
df.columns = [
    "jaar",
    "besluit_type",
    "gebouw_functie",
    "handeling",
    "kwartaal",
    "aantal_projecten",
    "aantal_gebouwen",
    "aantal_gebouwen_info",
    "aantal_wooneenheden",
    "aantal_kamers",
    "woonoppervlakte_m2",
    "oppervlakte_kamerwoning_m2",
    "bovengronds_nuttig_m2",
    "bovengronds_grond_m2",
    "gesloopt_m2",
    "gesloopt_m3"
]

# Clean data
df["kwartaal_nr"] = df["kwartaal"].str.extract(r"Q(\d)").astype(int)
df["jaar"] = df["jaar"].astype(int)

# Replace "-" with meaningful labels
df["besluit_type"] = df["besluit_type"].replace("-", "Onbekend")
df["gebouw_functie"] = df["gebouw_functie"].replace("-", "Onbekend")
df["handeling"] = df["handeling"].replace("-", "Onbekend")

# Simplify gebouw functie to eengezins/meergezins/kamer
def simplify_functie(f):
    if pd.isna(f) or f == "Onbekend":
        return "onbekend"
    if "meergezins" in f:
        return "meergezins"
    elif "eengezins" in f:
        return "eengezins"
    elif "kamerwoning" in f:
        return "kamer"
    return "onbekend"

df["functie_kort"] = df["gebouw_functie"].apply(simplify_functie)

# Filter for residential building types (for nieuwbouw/verbouw)
woningen_functies = [
    "eengezinswoning",
    "meergezinswoning",
    "kamerwoning",
    "eengezins- en kamerwoning",
    "meergezins- en kamerwoning"
]

# Read yearly applicant type CSV and align to the main analysis period
df_aanvrager = pd.read_csv(
    DATA_DIR / "Kopie van bouwstatistieken_met type aanvrager_2026.csv",
    sep=";",
    encoding="utf-8-sig",
    decimal=",",
    thousands="."
)

df_aanvrager.columns = [
    "jaar",
    "gebouw_functie",
    "handeling",
    "aanvrager_type",
    "aantal_projecten",
    "aantal_gebouwen",
    "aantal_gebouwen_info",
    "aantal_wooneenheden",
    "aantal_kamers",
    "woonoppervlakte_m2",
    "oppervlakte_kamerwoning_m2",
    "bovengronds_nuttig_m2",
    "bovengronds_grond_m2",
    "gesloopt_m2",
    "gesloopt_m3",
    "project_toestand",
]

df_aanvrager["jaar"] = df_aanvrager["jaar"].astype(int)
df_aanvrager = df_aanvrager[df_aanvrager["jaar"] <= df["jaar"].max()].copy()
df_aanvrager["gebouw_functie"] = df_aanvrager["gebouw_functie"].replace("-", "Onbekend")
df_aanvrager["handeling"] = df_aanvrager["handeling"].replace("-", "Onbekend")
df_aanvrager["aanvrager_type"] = df_aanvrager["aanvrager_type"].replace("-", "Onbekend")
df_aanvrager["aanvrager_groep"] = df_aanvrager["aanvrager_type"].apply(group_aanvrager)
df_aanvrager["functie_kort"] = df_aanvrager["gebouw_functie"].apply(simplify_functie)

# ============================================================================
# SECTION 1: NIEUWBOUW (New Construction)
# ============================================================================

df_nieuwbouw = df[(df["handeling"] == "Nieuwbouw") & (df["gebouw_functie"].isin(woningen_functies))].copy()

# Quarterly totals
nieuwbouw_quarterly = df_nieuwbouw.groupby(["jaar", "kwartaal_nr"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values(["jaar", "kwartaal_nr"])

write_json("nieuwbouw_quarterly.json", [
    {"y": int(r["jaar"]), "q": int(r["kwartaal_nr"]), "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in nieuwbouw_quarterly.iterrows()
])

# Yearly totals
nieuwbouw_yearly = df_nieuwbouw.groupby(["jaar"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values("jaar")

write_json("nieuwbouw_yearly.json", [
    {"y": int(r["jaar"]), "p": int(r["aantal_projecten"]), "g": int(r["aantal_gebouwen"]),
     "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in nieuwbouw_yearly.iterrows()
])

# By type - yearly
nieuwbouw_by_type = df_nieuwbouw.groupby(["jaar", "functie_kort"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values(["jaar", "functie_kort"])

write_json("nieuwbouw_by_type.json", [
    {"y": int(r["jaar"]), "t": r["functie_kort"], "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in nieuwbouw_by_type.iterrows()
])

# ============================================================================
# SECTION 2: VERBOUW (Renovation)
# ============================================================================

df_verbouw = df[(df["handeling"] == "Verbouwen of hergebruik") & (df["gebouw_functie"].isin(woningen_functies))].copy()

# Quarterly totals
verbouw_quarterly = df_verbouw.groupby(["jaar", "kwartaal_nr"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values(["jaar", "kwartaal_nr"])

write_json("verbouw_quarterly.json", [
    {"y": int(r["jaar"]), "q": int(r["kwartaal_nr"]), "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in verbouw_quarterly.iterrows()
])

# Yearly totals
verbouw_yearly = df_verbouw.groupby(["jaar"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values("jaar")

write_json("verbouw_yearly.json", [
    {"y": int(r["jaar"]), "p": int(r["aantal_projecten"]), "g": int(r["aantal_gebouwen"]),
     "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in verbouw_yearly.iterrows()
])

# By type - yearly
verbouw_by_type = df_verbouw.groupby(["jaar", "functie_kort"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum"
}).reset_index().sort_values(["jaar", "functie_kort"])

write_json("verbouw_by_type.json", [
    {"y": int(r["jaar"]), "t": r["functie_kort"], "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "w": int(r["aantal_wooneenheden"]), "m2": round(r["woonoppervlakte_m2"], 0)}
    for _, r in verbouw_by_type.iterrows()
])

# ============================================================================
# SECTION 3: SLOOP (Demolition)
# ============================================================================

df_sloop = df[df["handeling"] == "Sloop"].copy()

# Quarterly totals - for sloop we use gesloopt_m2 and gesloopt_m3
sloop_quarterly = df_sloop.groupby(["jaar", "kwartaal_nr"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "gesloopt_m2": "sum",
    "gesloopt_m3": "sum"
}).reset_index().sort_values(["jaar", "kwartaal_nr"])

write_json("sloop_quarterly.json", [
    {"y": int(r["jaar"]), "q": int(r["kwartaal_nr"]), "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "m2": round(r["gesloopt_m2"], 0), "m3": round(r["gesloopt_m3"], 0)}
    for _, r in sloop_quarterly.iterrows()
])

# Yearly totals
sloop_yearly = df_sloop.groupby(["jaar"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "gesloopt_m2": "sum",
    "gesloopt_m3": "sum"
}).reset_index().sort_values("jaar")

write_json("sloop_yearly.json", [
    {"y": int(r["jaar"]), "p": int(r["aantal_projecten"]), "g": int(r["aantal_gebouwen"]),
     "m2": round(r["gesloopt_m2"], 0), "m3": round(r["gesloopt_m3"], 0)}
    for _, r in sloop_yearly.iterrows()
])

# By besluit type (who decides: gemeente, provincie, etc)
sloop_by_besluit = df_sloop.groupby(["jaar", "besluit_type"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "gesloopt_m2": "sum",
    "gesloopt_m3": "sum"
}).reset_index().sort_values(["jaar", "besluit_type"])

write_json("sloop_by_besluit.json", [
    {"y": int(r["jaar"]), "b": r["besluit_type"], "p": int(r["aantal_projecten"]),
     "g": int(r["aantal_gebouwen"]), "m2": round(r["gesloopt_m2"], 0), "m3": round(r["gesloopt_m3"], 0)}
    for _, r in sloop_by_besluit.iterrows()
])

# ============================================================================
# SECTION 4: PROJECT AANVRAGER TYPE
# ============================================================================

df_aanvrager_woningen = df_aanvrager[df_aanvrager["functie_kort"].isin(["eengezins", "meergezins", "kamer"])].copy()

aanvrager_yearly = df_aanvrager_woningen.groupby(["jaar", "handeling", "functie_kort", "aanvrager_groep"]).agg({
    "aantal_projecten": "sum",
    "aantal_gebouwen": "sum",
    "aantal_wooneenheden": "sum",
    "woonoppervlakte_m2": "sum",
    "gesloopt_m2": "sum",
    "gesloopt_m3": "sum",
}).reset_index().sort_values(["handeling", "functie_kort", "jaar", "aanvrager_groep"])

write_json("aanvrager_yearly.json", [
    {
        "y": int(r["jaar"]),
        "h": simplify_handeling(r["handeling"]),
        "f": r["functie_kort"],
        "a": r["aanvrager_groep"],
        "p": int(r["aantal_projecten"]),
        "g": int(r["aantal_gebouwen"]),
        "w": int(r["aantal_wooneenheden"]),
        "m2": round(r["woonoppervlakte_m2"], 0),
        "dm2": round(r["gesloopt_m2"], 0),
        "m3": round(r["gesloopt_m3"], 0),
    }
    for _, r in aanvrager_yearly.iterrows()
])

# ============================================================================
# LOOKUPS for UI
# ============================================================================

lookups = {
    "types": [
        {"code": "eengezins", "nl": "Eengezinswoning"},
        {"code": "meergezins", "nl": "Meergezinswoning"},
        {"code": "kamer", "nl": "Kamerwoning"}
    ],
    "besluit_types": [
        {"code": "Gemeente", "nl": "Gemeente"},
        {"code": "Provincie", "nl": "Provincie"},
        {"code": "Vlaamse Overheid", "nl": "Vlaamse Overheid"},
        {"code": "RVVB", "nl": "RVVB"},
        {"code": "Onbekend", "nl": "Onbekend"}
    ],
    "handelingen": [
        {"code": "nieuwbouw", "nl": "Nieuwbouw"},
        {"code": "verbouw", "nl": "Verbouwen"},
        {"code": "sloop", "nl": "Sloop"}
    ],
    "aanvrager_types": [
        {"code": "natuurlijk_persoon", "nl": "Natuurlijk persoon"},
        {"code": "overheid_rechtspersoon", "nl": "Overheid / rechtspersoon"},
        {"code": "andere", "nl": "Andere / onbekend"}
    ],
    "gebouw_functies_kort": [
        {"code": "eengezins", "nl": "Eengezinswoning"},
        {"code": "meergezins", "nl": "Meergezinswoning"},
        {"code": "kamer", "nl": "Kamerwoning"}
    ]
}

write_json("lookups.json", lookups, ensure_ascii=False, indent=2)

# Print summary
print("Processing complete!")
print(f"Data range: {df['jaar'].min()} Q1 - {df['jaar'].max()} Q{df['kwartaal_nr'].max()}")
print(f"Total rows: {len(df)}")
print(f"Nieuwbouw rows: {len(df_nieuwbouw)}")
print(f"Verbouw rows: {len(df_verbouw)}")
print(f"Sloop rows: {len(df_sloop)}")
print(f"Output files saved to: {RESULTS_DIR}")
