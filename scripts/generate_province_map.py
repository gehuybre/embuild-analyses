"""
Generate province-level GeoJSON from municipality-level data.
This script aggregates municipality geometries by province using proper
topological operations via geopandas.
"""
import json
from pathlib import Path
import geopandas as gpd
from shapely.geometry import shape

# Province mapping (NIS code first 2 digits -> province info)
PROVINCE_MAPPING = {
    "10": {"code": "10000", "name": "Antwerpen", "nuts_id": "BE21"},
    "11": {"code": "10000", "name": "Antwerpen", "nuts_id": "BE21"},
    "12": {"code": "10000", "name": "Antwerpen", "nuts_id": "BE21"},
    "13": {"code": "10000", "name": "Antwerpen", "nuts_id": "BE21"},
    "20": {"code": "20001", "name": "Vlaams-Brabant", "nuts_id": "BE24"},
    "23": {"code": "20001", "name": "Vlaams-Brabant", "nuts_id": "BE24"},
    "24": {"code": "20001", "name": "Vlaams-Brabant", "nuts_id": "BE24"},
    "25": {"code": "25000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "26": {"code": "25000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "27": {"code": "25000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "28": {"code": "25000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "29": {"code": "25000", "name": "West-Vlaanderen", "nuts_id": "BE25"},
    "30": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "31": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "33": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "34": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "35": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "36": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "37": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "38": {"code": "30000", "name": "Oost-Vlaanderen", "nuts_id": "BE23"},
    "40": {"code": "40000", "name": "Limburg", "nuts_id": "BE22"},
    "41": {"code": "40000", "name": "Limburg", "nuts_id": "BE22"},
    "44": {"code": "40000", "name": "Limburg", "nuts_id": "BE22"},
    "45": {"code": "40000", "name": "Limburg", "nuts_id": "BE22"},
    "46": {"code": "40000", "name": "Limburg", "nuts_id": "BE22"},
    "50": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "51": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "52": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "53": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "54": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "55": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "56": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "57": {"code": "50000", "name": "Henegouwen", "nuts_id": "BE32"},
    "60": {"code": "60000", "name": "Luik", "nuts_id": "BE33"},
    "61": {"code": "60000", "name": "Luik", "nuts_id": "BE33"},
    "62": {"code": "60000", "name": "Luik", "nuts_id": "BE33"},
    "63": {"code": "60000", "name": "Luik", "nuts_id": "BE33"},
    "64": {"code": "60000", "name": "Luik", "nuts_id": "BE33"},
    "70": {"code": "70000", "name": "Luxemburg", "nuts_id": "BE34"},
    "71": {"code": "70000", "name": "Luxemburg", "nuts_id": "BE34"},
    "72": {"code": "70000", "name": "Luxemburg", "nuts_id": "BE34"},
    "73": {"code": "70000", "name": "Luxemburg", "nuts_id": "BE34"},
    "80": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "81": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "82": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "83": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "84": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "85": {"code": "80000", "name": "Namen", "nuts_id": "BE35"},
    "90": {"code": "20002", "name": "Waals-Brabant", "nuts_id": "BE31"},
    "91": {"code": "20002", "name": "Waals-Brabant", "nuts_id": "BE31"},
    "92": {"code": "20002", "name": "Waals-Brabant", "nuts_id": "BE31"},
    "93": {"code": "20002", "name": "Waals-Brabant", "nuts_id": "BE31"},
    "21": {"code": "21000", "name": "Brussels Hoofdstedelijk Gewest", "nuts_id": "BE1"},
}


def get_province_for_municipality(nis_code: str) -> dict:
    """Get province info for a municipality NIS code."""
    prefix = nis_code[:2]
    return PROVINCE_MAPPING.get(prefix, {"code": "unknown", "name": "Unknown", "nuts_id": ""})


def main():
    # Paths
    project_root = Path(__file__).parent.parent
    input_file = project_root / "embuild-analyses" / "public" / "maps" / "belgium_municipalities.json"
    output_file = project_root / "embuild-analyses" / "public" / "maps" / "belgium_provinces.json"

    print(f"Reading municipalities from: {input_file}")

    # Read municipality GeoJSON using geopandas
    gdf = gpd.read_file(input_file)

    # Add province information to each municipality
    gdf["province_code"] = gdf["code"].astype(str).str[:2].map(
        lambda x: PROVINCE_MAPPING.get(x, {"code": "unknown"})["code"]
    )
    gdf["province_name"] = gdf["code"].astype(str).str[:2].map(
        lambda x: PROVINCE_MAPPING.get(x, {"name": "Unknown"})["name"]
    )
    gdf["province_nuts_id"] = gdf["code"].astype(str).str[:2].map(
        lambda x: PROVINCE_MAPPING.get(x, {"nuts_id": ""})["nuts_id"]
    )

    # Filter out unknown provinces
    gdf = gdf[gdf["province_code"] != "unknown"]

    print(f"Dissolving {len(gdf)} municipalities into provinces...")

    # Dissolve geometries by province using geopandas
    # This properly merges adjacent polygons and handles topology
    provinces_gdf = gdf.dissolve(
        by="province_code",
        aggfunc={
            "province_name": "first",
            "province_nuts_id": "first",
        }
    ).reset_index()

    # Rename columns to match expected output
    provinces_gdf = provinces_gdf.rename(columns={
        "province_code": "code",
        "province_name": "name",
        "province_nuts_id": "nuts_id",
    })

    # Select only needed columns
    provinces_gdf = provinces_gdf[["code", "name", "nuts_id", "geometry"]]

    # Write output as GeoJSON
    print(f"Writing {len(provinces_gdf)} provinces to: {output_file}")
    provinces_gdf.to_file(output_file, driver="GeoJSON")

    print("✓ Province map generated successfully!")
    print(f"\nProvinces created:")
    for _, row in provinces_gdf.sort_values("name").iterrows():
        print(f"  - {row['name']} ({row['code']})")


if __name__ == "__main__":
    main()
