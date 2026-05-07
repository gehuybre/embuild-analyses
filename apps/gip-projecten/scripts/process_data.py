#!/usr/bin/env python3
"""Process GIP 2025-2027 source PDFs into frontend-ready data files."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import subprocess
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from heapq import heappop, heappush
from io import StringIO
from pathlib import Path
from typing import Any

from shapely.geometry import mapping, shape
from shapely.ops import unary_union


APP_DIR = Path(__file__).resolve().parent.parent
ANALYSES_DIR = APP_DIR.parent.parent
SOURCE_DIR = APP_DIR / "bronnen"
RESULTS_DIR = APP_DIR / "results"
PUBLIC_DATA_DIR = APP_DIR / "public" / "data"
OSM_CACHE_DIR = RESULTS_DIR / "osm_cache"
CONFIG_PATH = SOURCE_DIR / "config.yaml"
PORTAL_MAP_PATH = ANALYSES_DIR / "apps" / "portal" / "public" / "maps" / "belgium_municipalities.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
INFRASTRUCTURE_BASEMAP_CACHE = OSM_CACHE_DIR / "flanders_infrastructure_basemap.json"

MAIN_TABLE_PDF = SOURCE_DIR / "VR_2025_1407_MED.0277-4_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_g3zk8e.pdf"
BIG_PROJECTS_PDF = SOURCE_DIR / "3_-_BIJLAGE_-_GIP_-_Grote_Projecten_yvc7un.pdf"

YEARS = [2025, 2026, 2027]
LONG_TERM_YEARS = list(range(2025, 2041))
PROVINCE_ORDER = ["antwerpen", "vlaams_brabant", "west_vlaanderen", "oost_vlaanderen", "limburg"]
PROVINCE_DEFINITIONS = {
    "antwerpen": {"code": "10000", "name": "Antwerpen", "nuts_id": "BE21"},
    "vlaams_brabant": {"code": "20001", "name": "Vlaams-Brabant", "nuts_id": "BE24"},
    "west_vlaanderen": {"code": "30000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "oost_vlaanderen": {"code": "40000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "limburg": {"code": "70000", "name": "Limburg", "nuts_id": "BE22"},
}


def ensure_pdftotext() -> str:
    executable = shutil.which("pdftotext")
    if not executable:
        raise RuntimeError("pdftotext is required to process the GIP PDFs.")
    return executable


def extract_tsv(pdf_path: Path) -> list[dict[str, str]]:
    executable = ensure_pdftotext()
    completed = subprocess.run(
        [executable, "-q", "-tsv", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return list(csv.DictReader(StringIO(completed.stdout), delimiter="\t"))


def compact_text(parts: list[str]) -> str:
    text = " ".join(part for part in parts if part)
    text = re.sub(r"\s+([,;:.])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return re.sub(r"\s+", " ", text).strip()


def load_keyword_config() -> dict[str, list[str]]:
    if not CONFIG_PATH.exists():
        return {}

    categories: dict[str, list[str]] = {}
    for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
        if ":" not in line:
            continue
        category, raw_terms = line.split(":", 1)
        terms = []
        for term in raw_terms.split(","):
            cleaned = term.strip().strip("'\"")
            if not cleaned or cleaned.startswith("ergens in") or cleaned.startswith("beginnende met"):
                continue
            terms.append(cleaned)
        categories[category.strip()] = terms
    return categories


def parse_euro(text: str) -> float:
    match = re.search(r"(\d{1,3}(?:\.\d{3})*,\d{2})", text)
    if not match:
        return 0.0
    return float(match.group(1).replace(".", "").replace(",", "."))


def parse_main_table() -> tuple[list[dict[str, Any]], dict[str, float]]:
    columns = [
        ("programma", 0, 112),
        ("subprogramma", 112, 218),
        ("entiteit", 218, 371),
        ("project", 371, 558),
        ("deelproject", 558, 735),
        ("locatie", 735, 878),
        ("b2025", 878, 937),
        ("b2026", 937, 997),
        ("b2027", 997, 1300),
    ]
    money_re = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")

    def column_for_x(x: float) -> str | None:
        for name, start, end in columns:
            if start <= x < end:
                return name
        return None

    lines: dict[tuple[int, int], list[tuple[float, str]]] = defaultdict(list)
    for row in extract_tsv(MAIN_TABLE_PDF):
        if row.get("level") != "5":
            continue
        text = row.get("text", "")
        if not text or text.startswith("###"):
            continue
        lines[(int(row["page_num"]), round(float(row["top"])))].append((float(row["left"]), text))

    context = {key: "" for key in ["programma", "subprogramma", "entiteit", "project"]}
    pending = {key: [] for key, _, _ in columns}
    data_rows: list[dict[str, Any]] = []
    total_row: dict[str, float] | None = None

    for page, y in sorted(lines):
        line = {key: [] for key, _, _ in columns}
        for left, text in sorted(lines[(page, y)]):
            column = column_for_x(left)
            if column:
                line[column].append(text)

        all_text = compact_text([text for values in line.values() for text in values])
        if any(
            header in all_text
            for header in ["ProgrammaOverkoepelend", "Budget2025", "Budget2026", "Budget2027", "VR 2025", "GIP 2025-2027"]
        ):
            continue

        has_budget = any(
            "€" in line[column] or money_re.search(compact_text(line[column]))
            for column in ["b2025", "b2026", "b2027"]
        )

        if not has_budget:
            if any(line[column] for column in ["programma", "subprogramma", "entiteit", "project", "deelproject", "locatie"]):
                for column, _, _ in columns:
                    if line[column]:
                        pending[column].extend(line[column])
            continue

        merged = {column: compact_text(pending[column] + line[column]) for column, _, _ in columns}
        pending = {key: [] for key, _, _ in columns}

        for column in ["programma", "subprogramma", "entiteit", "project"]:
            if merged[column]:
                context[column] = merged[column]
            else:
                merged[column] = context[column]

        budgets = {f"budget{year}": parse_euro(merged[f"b{year}"]) for year in YEARS}
        if sum(budgets.values()) <= 0:
            continue

        if merged["programma"] == "Eindtotaal":
            total_row = budgets
            continue

        row = {
            "id": f"gip-{len(data_rows) + 1:04d}",
            "programma": merged["programma"],
            "subprogramma": merged["subprogramma"],
            "entiteit": merged["entiteit"],
            "project": merged["project"],
            "deelproject": merged["deelproject"],
            "locatie": merged["locatie"],
            **budgets,
        }
        row["budget_total"] = round(sum(budgets.values()), 2)
        data_rows.append(row)

    if total_row is None:
        raise RuntimeError("Could not find the GIP total row in the PDF.")

    parsed_total = round(sum(row["budget_total"] for row in data_rows), 2)
    stated_total = round(sum(total_row.values()), 2)
    if abs(parsed_total - stated_total) > 0.05:
        raise RuntimeError(f"Parsed total {parsed_total} does not match PDF total {stated_total}.")

    return data_rows, total_row


def parse_mio_value(text: str) -> int | None:
    if text == "-":
        return 0
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return int(text.replace(".", ""))
    return None


def parse_big_projects() -> list[dict[str, Any]]:
    year_centers = [287, 320, 352, 385, 417, 450, 482, 515, 548, 580, 613, 645, 678, 710, 743, 775]

    def year_for_x(x: float) -> int | None:
        if x < 278:
            return None
        index = min(range(len(year_centers)), key=lambda i: abs(year_centers[i] - x))
        if abs(year_centers[index] - x) <= 18:
            return LONG_TERM_YEARS[index]
        return None

    lines: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for row in extract_tsv(BIG_PROJECTS_PDF):
        if row.get("level") != "5":
            continue
        text = row.get("text", "")
        if not text or text.startswith("###"):
            continue
        lines[round(float(row["top"]))].append((float(row["left"]), text))

    parsed: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for y in sorted(lines):
        if y < 100:
            continue
        words = sorted(lines[y])
        name_parts = [text for left, text in words if left < 218]
        total_values = [
            parse_mio_value(text)
            for left, text in words
            if 218 <= left < 278 and parse_mio_value(text) is not None
        ]
        impact = {}
        for left, text in words:
            year = year_for_x(left)
            value = parse_mio_value(text)
            if year is not None and value is not None:
                impact[str(year)] = value

        if total_values:
            min_name_x = min((left for left, _ in words if left < 218), default=999)
            current = {
                "project": compact_text(name_parts),
                "total_mio": total_values[-1],
                "impact_mio": {str(year): impact.get(str(year), 0) for year in LONG_TERM_YEARS},
                "level": "project" if min_name_x <= 65 else "subproject",
            }
            parsed.append(current)
        elif impact and current and not name_parts:
            current["impact_mio"].update(impact)

    return parsed


def normalized_key(value: str) -> str:
    value = value.lower().replace("œ", "oe")
    value = "".join(
        char for char in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(char)
    )
    value = re.sub(r"\([^)]*\)", " ", value)
    value = value.replace(" / ", ";")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def clean_municipality_name(name: str) -> str:
    name = name.split("/", 1)[0]
    name = re.sub(r"\s*\([^)]*\)", "", name)
    return compact_text([name])


def polygon_area_and_centroid(ring: list[list[float]]) -> tuple[float, tuple[float, float]]:
    area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    points = ring if ring[0] == ring[-1] else [*ring, ring[0]]

    for index in range(len(points) - 1):
        x0, y0 = points[index][:2]
        x1, y1 = points[index + 1][:2]
        cross = x0 * y1 - x1 * y0
        area += cross
        centroid_x += (x0 + x1) * cross
        centroid_y += (y0 + y1) * cross

    area *= 0.5
    if abs(area) < 1e-12:
        return 0.0, (
            sum(point[0] for point in ring) / len(ring),
            sum(point[1] for point in ring) / len(ring),
        )

    return area, (centroid_x / (6 * area), centroid_y / (6 * area))


def geometry_centroid(geometry: dict[str, Any]) -> tuple[float, float]:
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    weighted_x = 0.0
    weighted_y = 0.0
    total_area = 0.0

    for polygon in polygons:
        if not polygon:
            continue
        area, centroid = polygon_area_and_centroid(polygon[0])
        weight = abs(area)
        if weight <= 0:
            continue
        weighted_x += centroid[0] * weight
        weighted_y += centroid[1] * weight
        total_area += weight

    if total_area <= 0:
        return polygon_area_and_centroid(polygons[0][0])[1]

    return weighted_x / total_area, weighted_y / total_area


def build_municipality_lookup() -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    geo = json.loads(PORTAL_MAP_PATH.read_text(encoding="utf-8"))
    exact: dict[str, list[dict[str, Any]]] = defaultdict(list)
    candidates: list[dict[str, Any]] = []

    for feature in geo["features"]:
        raw_name = str(feature["properties"]["LAU_NAME"])
        code = str(feature["properties"]["code"])
        lon, lat = geometry_centroid(feature["geometry"])
        aliases = [raw_name, *raw_name.split("/")]
        for alias in aliases:
            display_name = clean_municipality_name(alias)
            key = normalized_key(display_name)
            if not key:
                continue
            entry = {
                "code": code,
                "name": display_name,
                "key": key,
                "lon": round(lon, 6),
                "lat": round(lat, 6),
            }
            exact[key].append(entry)
            candidates.append(entry)

    candidates.sort(key=lambda item: len(item["key"]), reverse=True)
    return exact, candidates


LOCATION_ALIASES = {
    "aalbeke": "Kortrijk",
    "deurne": "Antwerpen",
    "diepenbeek campus": "Diepenbeek",
    "diepenbeek university campus": "Diepenbeek",
    "die gem": "Machelen",
    "diegem": "Machelen",
    "drongen": "Gent",
    "ekeren": "Antwerpen",
    "heverlee": "Leuven",
    "hoboken": "Antwerpen",
    "kalken": "Laarne",
    "kemzeke": "Stekene",
    "kessel lo": "Leuven",
    "knokke": "Knokke-Heist",
    "leerbeek": "Gooik",
    "lovenjoel": "Bierbeek",
    "melsele": "Beveren",
    "merksem": "Antwerpen",
    "wildert": "Essen",
    "wilrijk": "Antwerpen",
    "wintam": "Bornem",
    "westende": "Middelkerke",
    "zeebrugge": "Brugge",
    "zomergem": "Lievegem",
    "zwankendamme": "Brugge",
}

NON_LOCAL_LOCATION_KEYS = {
    "vlaanderen",
    "belgie",
    "kustjachthavens vlaanderen",
    "kustgemeenten",
    "vlaamse rand",
    "west vlaanderen",
    "vlaams brabant",
}

KEYWORD_CONFIG = load_keyword_config()


def config_text_contains(text: str, category: str, selected_terms: set[str] | None = None) -> bool:
    normalized_text = f" {normalized_key(text)} "
    for term in KEYWORD_CONFIG.get(category, []):
        normalized_term = normalized_key(term)
        if len(normalized_term) < 4:
            continue
        if selected_terms is not None and normalized_term not in selected_terms:
            continue
        if f" {normalized_term} " in normalized_text:
            return True
    return False

POINT_ASSET_RE = re.compile(
    r"\b(?:vuurtoren|vuurtorens|jachthaven|jachthavens|jachthavendok|jachthavendokken|"
    r"spoorwegovergang|overweg|woning|woningen|gebouw|gebouwen|afbraak|sanitair|dak|terrein|terreinen)\b|"
    r"brug(?:gen)?\b|sluis(?:en)?\b|viaduct(?:en)?\b",
    re.IGNORECASE,
)

STRONG_ROUTE_RE = re.compile(
    r"\b(?:A|E|N|R)\s*-?\s*\d{1,3}\b|"
    r"\bF\s*-?\s*\d{1,3}\b|"
    r"\b(?:HOV|tram|trambus|Brabantnet|fietssnelweg|fietsroute|fietspad|fietspaden|BFF)\b|"
    r"\b(?:tussen|verbinding|verbindingsweg|doortocht|tangent|traject|corridor|rondweg|ringweg)\b|"
    r"\bkanaal\s+[A-Za-zÀ-ÿ].*[-–]",
    re.IGNORECASE,
)

POINT_ASSET_ROUTE_EXCEPTIONS_RE = re.compile(
    r"\b(?:fietsroute|fietspad|fietspaden|fietssnelweg|HOV|tram|trambus|Brabantnet)\b",
    re.IGNORECASE,
)

CONFIG_POINT_WATER_TERMS = {
    normalized_key(term)
    for term in ["sluis", "haven", "dok", "meer", "plas", "strand", "duin"]
}

BASEMAP_ROAD_LEVELS = {"motorway", "trunk", "primary"}
BASEMAP_RAIL_LEVELS = {"rail", "light_rail", "tram"}
BASEMAP_WATER_LEVELS = {"river", "canal"}
OSM_SNAP_DISTANCE_WEIGHT = 4.0

OSM_ROUTE_REF_RE = re.compile(r"\b([AENRF])\s*-?\s*0*(\d{1,3})(?:/\d+)?\b", re.IGNORECASE)
WATERWAY_STOP_TERMS = {"kanaal", "het", "de", "van", "voor", "structurele", "herstelling", "sifons"}


def normalize_osm_ref(prefix: str, number: str) -> str:
    normalized_number = str(int(number)) if number.lstrip("0") else "0"
    return f"{prefix.upper()}{normalized_number}"


def extract_osm_refs(row: dict[str, Any]) -> list[str]:
    refs: list[str] = []
    seen: set[str] = set()
    for prefix, number in OSM_ROUTE_REF_RE.findall(route_intent_text(row)):
        ref = normalize_osm_ref(prefix, number)
        if ref not in seen:
            seen.add(ref)
            refs.append(ref)
    return refs


def extract_waterway_terms(row: dict[str, Any]) -> list[str]:
    for key in ["locatie", "project", "deelproject", "subprogramma"]:
        normalized = normalized_key(str(row.get(key, "")))
        parts = normalized.split()
        if "kanaal" not in parts:
            continue
        terms = [
            part
            for part in parts[parts.index("kanaal") + 1:]
            if part not in WATERWAY_STOP_TERMS and not part.isdigit()
        ]
        if len(terms) >= 2:
            return terms
    return []


def osm_ref_tokens(value: str) -> set[str]:
    return {
        normalize_osm_ref(prefix, number)
        for prefix, number in OSM_ROUTE_REF_RE.findall(value)
    }


def coordinate_key(lon: float, lat: float) -> str:
    return f"{lon:.6f},{lat:.6f}"


def lon_lat_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon_scale = 71.0
    lat_scale = 111.0
    lon_delta = (a[0] - b[0]) * lon_scale
    lat_delta = (a[1] - b[1]) * lat_scale
    return (lon_delta * lon_delta + lat_delta * lat_delta) ** 0.5


def simplify_line(coordinates: list[list[float]], tolerance: float = 0.00008) -> list[list[float]]:
    if len(coordinates) <= 2:
        return coordinates

    def point_line_distance(point: list[float], start: list[float], end: list[float]) -> float:
        x0, y0 = point
        x1, y1 = start
        x2, y2 = end
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return ((x0 - x1) ** 2 + (y0 - y1) ** 2) ** 0.5
        t = max(0.0, min(1.0, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
        projection_x = x1 + t * dx
        projection_y = y1 + t * dy
        return ((x0 - projection_x) ** 2 + (y0 - projection_y) ** 2) ** 0.5

    def rdp(points: list[list[float]]) -> list[list[float]]:
        if len(points) <= 2:
            return points
        max_index = 0
        max_distance = 0.0
        for index in range(1, len(points) - 1):
            distance = point_line_distance(points[index], points[0], points[-1])
            if distance > max_distance:
                max_index = index
                max_distance = distance
        if max_distance <= tolerance:
            return [points[0], points[-1]]
        return rdp(points[:max_index + 1])[:-1] + rdp(points[max_index:])

    return rdp(coordinates)


class OSMRoadMatcher:
    def __init__(self, refs: list[str]) -> None:
        self.refs = sorted(set(refs))
        self.elements: list[dict[str, Any]] = []
        self.elements_by_ref: dict[str, list[dict[str, Any]]] = defaultdict(list)
        if self.refs:
            self.elements = self.load_elements()
            self.index_elements()

    def cache_path(self) -> Path:
        key = "_".join(self.refs)
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
        label = re.sub(r"[^A-Z0-9_]+", "_", key)[:120]
        return OSM_CACHE_DIR / f"flanders_roads_{label}_{digest}.json"

    def load_elements(self) -> list[dict[str, Any]]:
        OSM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path = self.cache_path()
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8")).get("elements", [])

        ref_pattern = "(^|;|,| |/)(" + "|".join(re.escape(ref) for ref in self.refs) + ")(;|,| |/|$)"
        query = f"""
        [out:json][timeout:180];
        area["ISO3166-2"="BE-VLG"][admin_level=4]->.searchArea;
        (
          way(area.searchArea)["highway"]["ref"~"{ref_pattern}"];
          way(area.searchArea)["highway"]["nat_ref"~"{ref_pattern}"];
          way(area.searchArea)["highway"]["int_ref"~"{ref_pattern}"];
          way(area.searchArea)["cycleway"]["ref"~"{ref_pattern}"];
        );
        out geom;
        """
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
        request = urllib.request.Request(
            OVERPASS_URL,
            data=data,
            headers={"User-Agent": "data-blog-u-gip-projecten/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=220) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            print(f"OSM route enrichment skipped: {error}")
            payload = {"elements": []}

        cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return payload.get("elements", [])

    def index_elements(self) -> None:
        wanted = set(self.refs)
        for element in self.elements:
            tags = element.get("tags", {})
            refs = set()
            for key in ["ref", "nat_ref", "int_ref"]:
                refs.update(osm_ref_tokens(str(tags.get(key, ""))))
            for ref in refs & wanted:
                self.elements_by_ref[ref].append(element)

    def route_for(
        self,
        refs: list[str],
        municipalities: list[dict[str, Any]],
    ) -> list[list[float]] | None:
        elements = []
        seen_elements = set()
        for ref in refs:
            for element in self.elements_by_ref.get(ref, []):
                element_id = element.get("id")
                if element_id in seen_elements:
                    continue
                seen_elements.add(element_id)
                elements.append(element)
        if not elements or len(municipalities) < 2:
            return None

        return self.route_from_elements(elements, municipalities)

    @classmethod
    def route_from_elements(
        cls,
        elements: list[dict[str, Any]],
        municipalities: list[dict[str, Any]],
    ) -> list[list[float]] | None:
        graph: dict[str, list[tuple[str, float]]] = defaultdict(list)
        coordinates_by_node: dict[str, tuple[float, float]] = {}
        for element in elements:
            geometry = element.get("geometry") or []
            previous_key = ""
            previous_coordinate: tuple[float, float] | None = None
            for point in geometry:
                coordinate = (float(point["lon"]), float(point["lat"]))
                key = coordinate_key(*coordinate)
                coordinates_by_node[key] = coordinate
                if previous_coordinate is not None:
                    distance = lon_lat_distance(previous_coordinate, coordinate)
                    graph[previous_key].append((key, distance))
                    graph[key].append((previous_key, distance))
                previous_key = key
                previous_coordinate = coordinate

        if not graph:
            return None

        cls.connect_close_components(graph, coordinates_by_node)

        route_coordinates: list[list[float]] = []
        targets = [(float(item["lon"]), float(item["lat"])) for item in municipalities]
        for start, end in zip(targets, targets[1:]):
            start_nodes = cls.nearest_nodes(coordinates_by_node, start)
            end_nodes = cls.nearest_nodes(coordinates_by_node, end)
            best_segment: list[str] | None = None
            best_score = float("inf")
            for start_node in start_nodes:
                candidate = cls.shortest_path_to_targets(graph, start_node, set(end_nodes))
                if not candidate:
                    continue
                segment, route_distance = candidate
                end_node = segment[-1]
                score = (
                    route_distance
                    + OSM_SNAP_DISTANCE_WEIGHT * (
                        lon_lat_distance(coordinates_by_node[start_node], start)
                        + lon_lat_distance(coordinates_by_node[end_node], end)
                    )
                )
                if score < best_score:
                    best_score = score
                    best_segment = segment
            if not best_segment:
                fallback = cls.best_component_route(graph, coordinates_by_node, targets)
                return simplify_line(fallback, tolerance=0.00002) if fallback else None
            segment_coordinates = [[coordinates_by_node[key][0], coordinates_by_node[key][1]] for key in best_segment]
            if route_coordinates and segment_coordinates and route_coordinates[-1] == segment_coordinates[0]:
                route_coordinates.extend(segment_coordinates[1:])
            else:
                route_coordinates.extend(segment_coordinates)

        if len(route_coordinates) < 2:
            fallback = cls.best_component_route(graph, coordinates_by_node, targets)
            return simplify_line(fallback, tolerance=0.00002) if fallback else None
        return simplify_line(route_coordinates, tolerance=0.00002)

    @staticmethod
    def nearest_nodes(
        coordinates_by_node: dict[str, tuple[float, float]],
        target: tuple[float, float],
        limit: int = 160,
    ) -> list[str]:
        return sorted(
            coordinates_by_node,
            key=lambda key: lon_lat_distance(coordinates_by_node[key], target),
        )[:limit]

    @staticmethod
    def connected_components(graph: dict[str, list[tuple[str, float]]]) -> list[list[str]]:
        components = []
        seen: set[str] = set()
        for node in graph:
            if node in seen:
                continue
            stack = [node]
            seen.add(node)
            component = []
            while stack:
                current = stack.pop()
                component.append(current)
                for neighbor, _distance in graph[current]:
                    if neighbor in seen:
                        continue
                    seen.add(neighbor)
                    stack.append(neighbor)
            components.append(component)
        return components

    @classmethod
    def connect_close_components(
        cls,
        graph: dict[str, list[tuple[str, float]]],
        coordinates_by_node: dict[str, tuple[float, float]],
        max_distance: float = 2.2,
    ) -> None:
        components = cls.connected_components(graph)
        if len(components) <= 1:
            return

        for index, component in enumerate(components):
            for other in components[index + 1:]:
                best_pair: tuple[str, str] | None = None
                best_distance = float("inf")
                for node in component:
                    coordinate = coordinates_by_node[node]
                    for other_node in other:
                        distance = lon_lat_distance(coordinate, coordinates_by_node[other_node])
                        if distance < best_distance:
                            best_distance = distance
                            best_pair = (node, other_node)
                if best_pair and best_distance <= max_distance:
                    first, second = best_pair
                    graph[first].append((second, best_distance))
                    graph[second].append((first, best_distance))

    @classmethod
    def best_component_route(
        cls,
        graph: dict[str, list[tuple[str, float]]],
        coordinates_by_node: dict[str, tuple[float, float]],
        targets: list[tuple[float, float]],
    ) -> list[list[float]] | None:
        best_path: list[str] | None = None
        best_score = float("inf")

        for component in cls.connected_components(graph):
            if len(component) < 2:
                continue

            nearest_by_target = [
                min(component, key=lambda node: lon_lat_distance(coordinates_by_node[node], target))
                for target in targets
            ]
            start_node = nearest_by_target[0]
            end_node = nearest_by_target[-1]
            if start_node == end_node:
                end_node = max(
                    set(nearest_by_target),
                    key=lambda node: lon_lat_distance(coordinates_by_node[start_node], coordinates_by_node[node]),
                )
            if start_node == end_node:
                continue

            candidate = cls.shortest_path_to_targets(graph, start_node, {end_node})
            if not candidate:
                continue

            path, route_distance = candidate
            snap_distance = sum(
                min(lon_lat_distance(coordinates_by_node[node], target) for node in component)
                for target in targets
            )
            score = route_distance + OSM_SNAP_DISTANCE_WEIGHT * snap_distance
            if score < best_score:
                best_score = score
                best_path = path

        if not best_path:
            return None
        return [[coordinates_by_node[key][0], coordinates_by_node[key][1]] for key in best_path]

    @staticmethod
    def shortest_path_to_targets(
        graph: dict[str, list[tuple[str, float]]],
        start: str,
        targets: set[str],
    ) -> tuple[list[str], float] | None:
        queue: list[tuple[float, str]] = [(0.0, start)]
        distances = {start: 0.0}
        previous: dict[str, str] = {}
        end = ""

        while queue:
            distance, node = heappop(queue)
            if node in targets:
                end = node
                break
            if distance > distances.get(node, float("inf")):
                continue
            for neighbor, edge_distance in graph[node]:
                next_distance = distance + edge_distance
                if next_distance < distances.get(neighbor, float("inf")):
                    distances[neighbor] = next_distance
                    previous[neighbor] = node
                    heappush(queue, (next_distance, neighbor))

        if not end:
            return None

        path = [end]
        while path[-1] != start:
            path.append(previous[path[-1]])
        path.reverse()
        return path, distances[end]


class OSMWaterwayMatcher:
    def __init__(self) -> None:
        self.elements = [
            element
            for element in load_osm_infrastructure_basemap_elements()
            if element.get("tags", {}).get("waterway") in BASEMAP_WATER_LEVELS
        ]

    def route_for(
        self,
        terms: list[str],
        municipalities: list[dict[str, Any]],
    ) -> list[list[float]] | None:
        if not terms or len(municipalities) < 2:
            return None

        matched = []
        for element in self.elements:
            tags = element.get("tags", {})
            name = normalized_key(" ".join(str(tags.get(key, "")) for key in ["name", "alt_name", "official_name"]))
            if all(term in name for term in terms) or (terms[0] in name and terms[-1] in name):
                matched.append(element)

        if not matched:
            return None
        return OSMRoadMatcher.route_from_elements(matched, municipalities)


def load_osm_infrastructure_basemap_elements() -> list[dict[str, Any]]:
    OSM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if INFRASTRUCTURE_BASEMAP_CACHE.exists():
        return json.loads(INFRASTRUCTURE_BASEMAP_CACHE.read_text(encoding="utf-8")).get("elements", [])

    query = """
    [out:json][timeout:240];
    area["ISO3166-2"="BE-VLG"][admin_level=4]->.searchArea;
    (
      way(area.searchArea)["highway"~"^(motorway|trunk|primary)$"];
      way(area.searchArea)["railway"~"^(rail|light_rail|tram)$"];
      way(area.searchArea)["waterway"~"^(river|canal)$"];
    );
    out geom;
    """
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"User-Agent": "data-blog-u-gip-projecten/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=260) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"OSM infrastructure basemap skipped: {error}")
        payload = {"elements": []}

    INFRASTRUCTURE_BASEMAP_CACHE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload.get("elements", [])


def build_infrastructure_basemap() -> dict[str, Any]:
    groups: dict[str, dict[str, Any]] = {}
    for element in load_osm_infrastructure_basemap_elements():
        tags = element.get("tags", {})
        geometry = element.get("geometry") or []
        if len(geometry) < 2:
            continue

        if tags.get("highway"):
            category = "road"
            level = str(tags.get("highway", "road"))
            if level not in BASEMAP_ROAD_LEVELS:
                continue
        elif tags.get("waterway"):
            category = "water"
            level = str(tags.get("waterway", "waterway"))
            if level not in BASEMAP_WATER_LEVELS:
                continue
        elif tags.get("railway"):
            category = "rail"
            level = str(tags.get("railway", "railway"))
            if level not in BASEMAP_RAIL_LEVELS:
                continue
        else:
            continue

        coordinates = simplify_line(
            [[round(float(point["lon"]), 6), round(float(point["lat"]), 6)] for point in geometry],
            tolerance=0.00085,
        )
        if len(coordinates) < 2:
            continue

        key = f"{category}-{level}"
        group = groups.setdefault(key, {
            "id": key,
            "category": category,
            "level": level,
            "segments": [],
        })
        group["segments"].append(coordinates)

    return {
        "processed_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "features": sorted(groups.values(), key=lambda item: (item["category"], item["level"])),
    }


def province_key_for_municipality_code(code: str) -> str | None:
    if code.startswith("1"):
        return "antwerpen"
    if code[:2] in {"23", "24"}:
        return "vlaams_brabant"
    if code.startswith("3"):
        return "west_vlaanderen"
    if code.startswith("4"):
        return "oost_vlaanderen"
    if code.startswith("7"):
        return "limburg"
    return None


def build_province_boundaries() -> dict[str, Any]:
    source = json.loads(PORTAL_MAP_PATH.read_text(encoding="utf-8"))
    grouped = {key: [] for key in PROVINCE_ORDER}

    for feature in source["features"]:
        code = str(feature["properties"].get("code", ""))
        province_key = province_key_for_municipality_code(code)
        if province_key is None:
            continue
        grouped[province_key].append(shape(feature["geometry"]))

    features = []
    for province_key in PROVINCE_ORDER:
        geometries = grouped[province_key]
        if not geometries:
            continue

        dissolved = unary_union(geometries).simplify(0.00015, preserve_topology=True)
        features.append({
            "type": "Feature",
            "properties": PROVINCE_DEFINITIONS[province_key],
            "geometry": mapping(dissolved),
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def match_location(
    location: str,
    exact: dict[str, list[dict[str, Any]]],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    seen_keys: set[str] = set()

    def add_entry(entry: dict[str, Any]) -> None:
        if entry["code"] not in seen:
            seen.add(entry["code"])
            seen_keys.add(entry["key"])
            found.append({
                "code": entry["code"],
                "name": entry["name"],
                "lon": entry["lon"],
                "lat": entry["lat"],
            })

    parts = [
        normalized_key(part)
        for part in re.split(r";|,|/|\ben\b", location, flags=re.IGNORECASE)
    ]
    for part in parts:
        if not part or part in NON_LOCAL_LOCATION_KEYS:
            continue
        lookup_key = normalized_key(LOCATION_ALIASES.get(part, part))
        if lookup_key in exact:
            add_entry(exact[lookup_key][0])

    normalized_location = f" {normalized_key(location)} "
    if not found and normalized_location.strip() in NON_LOCAL_LOCATION_KEYS:
        return []

    for candidate in candidates:
        key = candidate["key"]
        if len(key) < 4:
            continue
        if any(f" {key} " in f" {seen_key} " for seen_key in seen_keys):
            continue
        if f" {key} " in normalized_location:
            add_entry(candidate)

    return found


def project_geo_match(
    row: dict[str, Any],
    exact: dict[str, list[dict[str, Any]]],
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    location_matches = match_location(row["locatie"], exact, candidates)
    if location_matches:
        return location_matches, "locatie"

    text_matches = match_location(f"{row['project']}; {row['deelproject']}", exact, candidates)
    if text_matches:
        return text_matches, "projecttekst"

    return [], "geen_match"


def coordinate_distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    lon_delta = float(a["lon"]) - float(b["lon"])
    lat_delta = float(a["lat"]) - float(b["lat"])
    return lon_delta * lon_delta + lat_delta * lat_delta


def route_length(points: list[dict[str, Any]]) -> float:
    return sum(coordinate_distance(points[index], points[index + 1]) for index in range(len(points) - 1))


def nearest_route(points: list[dict[str, Any]], start_index: int) -> list[dict[str, Any]]:
    route = [points[start_index]]
    remaining = points[:start_index] + points[start_index + 1:]
    while remaining:
        current = route[-1]
        next_index = min(range(len(remaining)), key=lambda index: coordinate_distance(current, remaining[index]))
        route.append(remaining.pop(next_index))
    return route


def two_opt_route(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(points) < 4:
        return points

    route = points[:]
    improved = True
    while improved:
        improved = False
        for i in range(1, len(route) - 2):
            for j in range(i + 1, len(route) - 1):
                current = (
                    coordinate_distance(route[i - 1], route[i])
                    + coordinate_distance(route[j], route[j + 1])
                )
                candidate = (
                    coordinate_distance(route[i - 1], route[j])
                    + coordinate_distance(route[i], route[j + 1])
                )
                if candidate + 1e-12 < current:
                    route[i:j + 1] = reversed(route[i:j + 1])
                    improved = True
    return route


def shortest_open_route(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(points) <= 2:
        return points

    candidates = [two_opt_route(nearest_route(points, start_index)) for start_index in range(len(points))]
    return min(candidates, key=route_length)


def route_intent_text(row: dict[str, Any]) -> str:
    return " ".join(
        str(row.get(key, ""))
        for key in ["project", "deelproject", "locatie", "subprogramma", "entiteit"]
    )


def classify_geometry_intent(row: dict[str, Any], municipalities: list[dict[str, Any]]) -> str:
    if len(municipalities) <= 1:
        return "point"

    text = route_intent_text(row)
    has_config_bridge_or_tunnel = config_text_contains(text, "Bruggen") or config_text_contains(text, "Tunnels")
    has_point_asset = (
        bool(POINT_ASSET_RE.search(text))
        or has_config_bridge_or_tunnel
        or config_text_contains(text, "Water", CONFIG_POINT_WATER_TERMS)
    )
    has_cycle_route = config_text_contains(text, "Fietsweg") and not has_config_bridge_or_tunnel
    has_route = (
        bool(STRONG_ROUTE_RE.search(text))
        or has_cycle_route
        or config_text_contains(text, "Traject")
    )
    has_asset_route_exception = (
        bool(POINT_ASSET_ROUTE_EXCEPTIONS_RE.search(text))
        or has_cycle_route
    )

    if has_point_asset and not has_asset_route_exception:
        return "multipoint"
    if has_route:
        return "line"
    if len(municipalities) >= 3:
        return "multipoint"
    return "line"


def infer_feature_geometry(
    row: dict[str, Any],
    municipalities: list[dict[str, Any]],
    osm_matcher: OSMRoadMatcher | None,
    waterway_matcher: OSMWaterwayMatcher | None,
) -> tuple[dict[str, Any], list[dict[str, Any]], bool, str, list[str]]:
    ordered_municipalities = shortest_open_route(municipalities)
    coordinates = [[municipality["lon"], municipality["lat"]] for municipality in ordered_municipalities]
    intent = classify_geometry_intent(row, municipalities)
    osm_refs = extract_osm_refs(row)

    if intent == "line" and len(coordinates) >= 2:
        original_codes = [municipality["code"] for municipality in municipalities]
        ordered_codes = [municipality["code"] for municipality in ordered_municipalities]
        osm_coordinates = osm_matcher.route_for(osm_refs, ordered_municipalities) if osm_matcher and osm_refs else None
        if not osm_coordinates and waterway_matcher:
            waterway_terms = extract_waterway_terms(row)
            osm_coordinates = waterway_matcher.route_for(waterway_terms, ordered_municipalities)
        if osm_coordinates:
            return (
                {"type": "LineString", "coordinates": osm_coordinates},
                ordered_municipalities,
                original_codes != ordered_codes,
                "osm_wegreferentie",
                osm_refs,
            )
        return (
            {"type": "LineString", "coordinates": coordinates},
            ordered_municipalities,
            original_codes != ordered_codes,
            "kortste_lijn_tussen_locaties",
            osm_refs,
        )

    if len(coordinates) >= 2:
        return {"type": "MultiPoint", "coordinates": coordinates}, ordered_municipalities, False, "losse_punten", osm_refs

    return {"type": "Point", "coordinates": coordinates[0]}, ordered_municipalities, False, "locatiepunt", osm_refs


def investment_years(row: dict[str, Any]) -> list[int]:
    return [year for year in YEARS if row[f"budget{year}"] > 0]


def build_infrastructure_features(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    features = []
    osm_refs = sorted({
        ref
        for row in rows
        if row.get("municipalities") and classify_geometry_intent(row, row["municipalities"]) == "line"
        for ref in extract_osm_refs(row)
    })
    osm_matcher = OSMRoadMatcher(osm_refs)
    waterway_matcher = OSMWaterwayMatcher()

    for row in rows:
        municipalities = row.get("municipalities", [])
        if not municipalities:
            continue

        geometry, ordered_municipalities, route_was_reordered, geometry_method, osm_refs = infer_feature_geometry(
            row,
            municipalities,
            osm_matcher,
            waterway_matcher,
        )
        years = investment_years(row)
        features.append({
            "id": row["id"],
            "type": "lijn" if geometry["type"] == "LineString" else "punten" if geometry["type"] == "MultiPoint" else "punt",
            "geometry": geometry,
            "precision": "bronlocatie_afgeleid" if row.get("geo_match_source") == "locatie" else "projecttekst_afgeleid",
            "geometry_method": geometry_method,
            "osm_refs": osm_refs,
            "route_order": "kortste_afstand" if route_was_reordered else "bronvolgorde",
            "project": row["project"],
            "deelproject": row["deelproject"],
            "programma": row["programma"],
            "subprogramma": row["subprogramma"],
            "entiteit": row["entiteit"],
            "locatie": row["locatie"],
            "municipality_codes": [municipality["code"] for municipality in ordered_municipalities],
            "municipality_names": [municipality["name"] for municipality in ordered_municipalities],
            "budget2025": row["budget2025"],
            "budget2026": row["budget2026"],
            "budget2027": row["budget2027"],
            "budget_total": row["budget_total"],
            "investment_years": years,
            "start_year": years[0] if years else None,
        })

    return features


def summarize(rows: list[dict[str, Any]], group_key: str) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row[group_key]
        group = groups.setdefault(
            key,
            {
                "name": key,
                "allocation_count": 0,
                "project_count": 0,
                "budget2025": 0.0,
                "budget2026": 0.0,
                "budget2027": 0.0,
                "budget_total": 0.0,
                "_projects": set(),
            },
        )
        group["allocation_count"] += 1
        group["_projects"].add(row["project"])
        for year in YEARS:
            group[f"budget{year}"] += row[f"budget{year}"]
        group["budget_total"] += row["budget_total"]

    output = []
    for group in groups.values():
        group["project_count"] = len(group.pop("_projects"))
        for year in YEARS:
            group[f"budget{year}"] = round(group[f"budget{year}"], 2)
        group["budget_total"] = round(group["budget_total"], 2)
        output.append(group)

    return sorted(output, key=lambda item: item["budget_total"], reverse=True)


def build_geo_summary(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    exact, candidates = build_municipality_lookup()
    municipality_totals: dict[str, dict[str, Any]] = {}
    mapped_budget = 0.0
    mapped_rows = 0

    for row in rows:
        municipalities, match_source = project_geo_match(row, exact, candidates)
        row["municipalities"] = municipalities
        row["municipality_codes"] = [item["code"] for item in municipalities]
        row["municipality_names"] = [item["name"] for item in municipalities]
        row["geo_status"] = "municipality" if municipalities else "regional_or_unmatched"
        row["geo_match_source"] = match_source

        if not municipalities:
            continue

        mapped_rows += 1
        mapped_budget += row["budget_total"]
        share_count = len(municipalities)
        for municipality in municipalities:
            summary = municipality_totals.setdefault(
                municipality["code"],
                {
                    "m": municipality["code"],
                    "name": municipality["name"],
                    "allocation_count": 0,
                    "budget2025": 0.0,
                    "budget2026": 0.0,
                    "budget2027": 0.0,
                    "budget_total": 0.0,
                },
            )
            summary["allocation_count"] += 1
            for year in YEARS:
                summary[f"budget{year}"] += row[f"budget{year}"] / share_count
            summary["budget_total"] += row["budget_total"] / share_count

    municipality_summary = []
    for summary in municipality_totals.values():
        for year in YEARS:
            summary[f"budget{year}"] = round(summary[f"budget{year}"], 2)
        summary["budget_total"] = round(summary["budget_total"], 2)
        municipality_summary.append(summary)

    municipality_summary.sort(key=lambda item: item["budget_total"], reverse=True)
    metadata = {
        "mapped_allocation_count": mapped_rows,
        "mapped_budget_total": round(mapped_budget, 2),
        "mapped_budget_share": round(mapped_budget / sum(row["budget_total"] for row in rows), 4),
        "municipality_count": len(municipality_summary),
    }
    return municipality_summary, metadata


def feature_point_marker_count(feature: dict[str, Any]) -> int:
    geometry = feature["geometry"]
    if geometry["type"] == "MultiPoint":
        return len(geometry["coordinates"])
    if geometry["type"] == "Point":
        return 1
    return 0


def write_json(filename: str, payload: Any) -> None:
    for directory in [RESULTS_DIR, PUBLIC_DATA_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def write_projects_csv(rows: list[dict[str, Any]]) -> None:
    headers = [
        "id",
        "programma",
        "subprogramma",
        "entiteit",
        "project",
        "deelproject",
        "locatie",
        "budget2025",
        "budget2026",
        "budget2027",
        "budget_total",
        "investment_years",
        "start_year",
        "municipality_codes",
        "municipality_names",
    ]
    for directory in [RESULTS_DIR, PUBLIC_DATA_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
        with (directory / "projects.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            for row in rows:
                writer.writerow({
                    **{header: row.get(header, "") for header in headers},
                    "investment_years": ";".join(str(year) for year in investment_years(row)),
                    "start_year": next(iter(investment_years(row)), ""),
                    "municipality_codes": ";".join(row["municipality_codes"]),
                    "municipality_names": ";".join(row["municipality_names"]),
                })


def main() -> None:
    rows, stated_total = parse_main_table()
    municipality_summary, geo_metadata = build_geo_summary(rows)
    infrastructure_features = build_infrastructure_features(rows)
    infrastructure_basemap = build_infrastructure_basemap()
    province_boundaries = build_province_boundaries()
    big_projects = parse_big_projects()

    total_budget = round(sum(row["budget_total"] for row in rows), 2)
    by_year = {
        str(year): round(sum(row[f"budget{year}"] for row in rows), 2)
        for year in YEARS
    }

    metadata = {
        "title": "Geïntegreerd Investeringsprogramma 2025-2027",
        "source": "Vlaamse Regering - GIP 2025-2029, bijlage 4BIS",
        "source_files": [MAIN_TABLE_PDF.name, BIG_PROJECTS_PDF.name],
        "processed_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "allocation_count": len(rows),
        "unique_project_count": len({row["project"] for row in rows}),
        "infrastructure_feature_count": len(infrastructure_features),
        "infrastructure_line_count": sum(1 for feature in infrastructure_features if feature["type"] == "lijn"),
        "infrastructure_osm_line_count": sum(
            1 for feature in infrastructure_features if feature.get("geometry_method") == "osm_wegreferentie"
        ),
        "infrastructure_point_count": sum(feature_point_marker_count(feature) for feature in infrastructure_features),
        "total_budget": total_budget,
        "by_year": by_year,
        "stated_total": {str(year): round(stated_total[f"budget{year}"], 2) for year in YEARS},
        **geo_metadata,
    }

    bundle = {
        "metadata": metadata,
        "projects": rows,
        "programSummary": summarize(rows, "programma"),
        "subprogramSummary": summarize(rows, "subprogramma"),
        "entitySummary": summarize(rows, "entiteit"),
        "municipalitySummary": municipality_summary,
        "infrastructureFeatures": infrastructure_features,
        "bigProjects": big_projects,
    }

    write_json("gip_data.json", bundle)
    write_json("metadata.json", metadata)
    write_json("infrastructure_basemap.json", infrastructure_basemap)
    write_json("province_boundaries.json", province_boundaries)
    write_projects_csv(rows)

    print(f"Processed {len(rows)} GIP (deel)projecten")
    print(f"Total budget: {total_budget:,.2f}")
    print(f"Mapped (deel)projecten: {geo_metadata['mapped_allocation_count']}")


if __name__ == "__main__":
    main()
