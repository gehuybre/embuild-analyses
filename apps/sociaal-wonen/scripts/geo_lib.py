"""Gedeelde geometrie- en naamhulp voor de sociaal-wonen ETL.

De portal-GeoJSON (belgium_municipalities.json) is van voor de fusies van 2025. De planning (2026) gebruikt
de huidige gemeenten. Fusies worden hier eenmalig opgelost: de oude polygonen worden samengevoegd tot de
huidige gemeente, zodat de app enkel met huidige NIS-codes werkt en geen fusielogica nodig heeft.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

APP_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = APP_DIR.parents[1]
MUNI_GEO = REPO_DIR / "apps/portal/public/maps/belgium_municipalities.json"
FUSIONS_CSV = REPO_DIR / "packages/embuild-shared/src/data/nis/fusies-2025.csv"

PROVINCES = {
    "1": "ANTWERPEN",
    "23": "VLAAMS-BRABANT",
    "24": "VLAAMS-BRABANT",
    "3": "WEST-VLAANDEREN",
    "4": "OOST-VLAANDEREN",
    "7": "LIMBURG",
}


def province_of(nis: str) -> str | None:
    for prefix in ("23", "24", "1", "3", "4", "7"):
        if nis.startswith(prefix):
            return PROVINCES[prefix]
    return None


def is_flemish(nis: str) -> bool:
    return province_of(nis) is not None


def norm(name: str) -> str:
    """Sleutel voor naamvergelijking: zonder accenten, hoofdletters, spaties en leestekens."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def clean_name(raw: str) -> str:
    """'Hamme (Dendermonde) / Hamme (Termonde)' -> 'Hamme'; 'Gent / Gand' -> 'Gent'."""
    nl = raw.split(" / ")[0].strip()
    return re.sub(r"\s*\([^)]*\)\s*$", "", nl).strip()


def _parse_fusions() -> dict[str, dict]:
    """nieuwe_code -> {name, old: [codes]} voor Vlaamse fusies."""
    out: dict[str, dict] = {}
    pat = re.compile(r"\s*(.+?)\s*\((\d{5})\)")
    for line in FUSIONS_CSV.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        left, right = line.split(",\t") if ",\t" in line else line.split(",", 1)
        olds = pat.findall(left.replace("+", "\n"))
        news = pat.findall(right.replace("(voorlopige naam)", ""))
        if not news or not is_flemish(news[0][1]):
            continue
        name, code = news[0][0].strip(), news[0][1]
        out[code] = {"name": name, "old": [c for _, c in olds], "old_names": {c: n.strip() for n, c in olds}}
    return out


def build_current_municipalities() -> list[dict]:
    """Huidige (2026) Vlaamse gemeenten: nis, naam, provincie, geometrie, namen en oude codes."""
    geo = json.loads(MUNI_GEO.read_text(encoding="utf-8"))
    old = {}
    for f in geo["features"]:
        code = f["properties"]["code"]
        if is_flemish(code):
            raw = f["properties"]["LAU_NAME"]
            old[code] = {"name": clean_name(raw), "raw": raw, "geom": shape(f["geometry"])}

    fusions = _parse_fusions()
    consumed: set[str] = set()
    result = []
    for new_code, fus in fusions.items():
        parts = [old[c] for c in fus["old"] if c in old]
        if not parts:
            continue
        consumed.update(c for c in fus["old"] if c in old)
        result.append({
            "nis": new_code,
            "name": fus["name"],
            "geom": unary_union([p["geom"].buffer(0) for p in parts]),
            "old_codes": [c for c in fus["old"] if c in old],
            "aliases": {p["name"] for p in parts} | {p["raw"] for p in parts},
        })
    for code, o in old.items():
        if code in consumed:
            continue
        result.append({"nis": code, "name": o["name"], "geom": o["geom"], "old_codes": [code], "aliases": {o["raw"]}})

    for m in result:
        m["province"] = province_of(m["nis"])
        m["aliases"] = set(m["aliases"]) | {m["name"]}
        m["aliases"].update(clean_name(a) for a in list(m["aliases"]))
    return sorted(result, key=lambda m: m["nis"])


def name_index(munis: list[dict]) -> dict[str, list[dict]]:
    """genormaliseerde naam -> gemeenten (meer dan een bij homoniemen)."""
    idx: dict[str, list[dict]] = {}
    for m in munis:
        for a in m["aliases"]:
            idx.setdefault(norm(a), [])
            if m not in idx[norm(a)]:
                idx[norm(a)].append(m)
    return idx


def geom_to_feature(geom, props: dict, tolerance: float = 0.0003, digits: int = 5) -> dict:
    g = geom.simplify(tolerance, preserve_topology=True)

    def rnd(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], digits), round(c[1], digits)]
        return [rnd(x) for x in c]

    m = mapping(g)
    return {"type": "Feature", "properties": props, "geometry": {"type": m["type"], "coordinates": rnd(m["coordinates"])}}


# ---------------------------------------------------------------------------------------------
# Projectie naar SVG-paden (Web Mercator), zodat de app geen kaartbibliotheek nodig heeft.
# ---------------------------------------------------------------------------------------------
import math  # noqa: E402


def _merc(lon: float, lat: float) -> tuple[float, float]:
    return math.radians(lon), math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


class SvgProjector:
    """Past alle geometrie in een viewBox van `width` breed, zuidwest linksonder (y omgedraaid)."""

    def __init__(self, geoms, width: int = 1000, pad: int = 6):
        pts = [_merc(x, y) for g in geoms for poly in getattr(g, "geoms", [g]) for x, y in poly.exterior.coords]
        self.x0, self.x1 = min(p[0] for p in pts), max(p[0] for p in pts)
        self.y0, self.y1 = min(p[1] for p in pts), max(p[1] for p in pts)
        self.pad = pad
        self.k = (width - 2 * pad) / (self.x1 - self.x0)
        self.width = width
        self.height = round((self.y1 - self.y0) * self.k + 2 * pad)

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        x, y = _merc(lon, lat)
        return (x - self.x0) * self.k + self.pad, (self.y1 - y) * self.k + self.pad

    def path(self, geom, tolerance: float = 0.0008) -> str:
        g = geom.simplify(tolerance, preserve_topology=True)
        parts = []
        for poly in getattr(g, "geoms", [g]):
            for ring in [poly.exterior, *poly.interiors]:
                pts = [self.xy(x, y) for x, y in ring.coords[:-1]]
                if len(pts) < 3:
                    continue
                parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        return "".join(parts)

    def centroid(self, geom) -> tuple[float, float]:
        c = geom.representative_point()
        x, y = self.xy(c.x, c.y)
        return round(x, 1), round(y, 1)
