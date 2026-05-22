#!/usr/bin/env python3
"""Download and process PinC higher-education enrollment data (WP)."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests

BASE_URL = "https://provincies.incijfers.be/jiveservices/odata/"
VARIABLE_CODE = "kubus2311_ho_wp"
DEFAULT_ENV_KEY_NAME = "pinc-api"

FLEMISH_PROVINCE_CODES = {"10000", "20001", "30000", "40000", "70000"}
DIM_LEVELS = {
    "v2311_hoofdstructuur": "type_onderwijsinstelling",
    "v2311_opleiding": "opleiding",
    "v2311_studiegebied": "studiegebied",
}


def find_repo_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        if (candidate / ".github").exists() and (candidate / "apps").exists():
            return candidate
    raise RuntimeError("Kon repo-root niet bepalen.")


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = find_repo_root(script_path)
    analysis_root = repo_root / "apps" / "inschrijvingen-onderwijs"
    public_results_root = analysis_root / "public" / "data"
    parser = argparse.ArgumentParser(
        description="Download en verwerk PinC data voor inschrijvingen hoger onderwijs (WP)."
    )
    parser.add_argument(
        "--env-file",
        default=os.environ.get("PINC_ENV_FILE", ""),
        help="Pad naar .env met API key.",
    )
    parser.add_argument(
        "--api-key-name",
        default=DEFAULT_ENV_KEY_NAME,
        help="Naam van de API-key in het .env-bestand.",
    )
    parser.add_argument(
        "--analysis-results-dir",
        default=str(analysis_root / "results"),
        help="App-lokale outputmap voor verwerkte resultaten.",
    )
    parser.add_argument(
        "--data-repo-root",
        default="",
        help="Optionele rootmap van een aparte data-repo.",
    )
    parser.add_argument(
        "--public-results-dir",
        default=str(public_results_root),
        help="App-lokale public/data outputmap voor de website.",
        )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP timeout in seconden.",
    )
    return parser.parse_args()


def read_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f".env-bestand niet gevonden: {path}")
    values: Dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def get_api_key(env_path: Optional[Path], key_name: str) -> str:
    env_candidates = [
        os.environ.get(key_name),
        os.environ.get(key_name.upper()),
        os.environ.get("PINC_API_KEY"),
    ]
    for candidate in env_candidates:
        if candidate:
            return candidate

    if not env_path:
        raise RuntimeError("Geen bruikbare API key gevonden in environment variables of via --env-file")

    env_values = read_env_file(env_path)
    if key_name in env_values and env_values[key_name]:
        return env_values[key_name]
    for candidate_key, candidate_value in env_values.items():
        if "api" in candidate_key.lower() and candidate_value:
            return candidate_value
    for candidate_value in env_values.values():
        if candidate_value:
            return candidate_value
    raise RuntimeError(f"Geen bruikbare API key gevonden in {env_path}")


def odata_quote(value: str) -> str:
    return value.replace("'", "''")


def iter_collection(
    session: requests.Session,
    path: str,
    timeout: int,
    params: Optional[Dict[str, str]] = None,
) -> Iterable[Dict[str, Any]]:
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    else:
        url = BASE_URL + path.lstrip("/")
    query_params = dict(params or {})
    while url:
        response = session.get(url, params=query_params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
        for item in payload.get("value", []):
            yield item
        url = payload.get("@odata.nextLink", "")
        query_params = {}


def get_entity(session: requests.Session, path: str, timeout: int) -> Dict[str, Any]:
    response = session.get(BASE_URL + path.lstrip("/"), timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError(f"Ongeldig response-object voor {path}")
    return payload


def to_int(value: Any) -> int:
    text = str(value or "").strip().replace(",", ".")
    if not text or text in {"-", "x", "X", "n.b.", "nvt"}:
        return 0
    try:
        return int(float(text))
    except ValueError:
        return 0


def extract_suffix_code(external_code: str) -> str:
    if "_" not in external_code:
        return external_code
    return external_code.split("_", 1)[1]


def is_flemish_municipality_code(code: str) -> bool:
    if not code.isdigit() or len(code) != 5:
        return False
    if code.startswith(("1", "3", "4", "7")):
        return True
    if code.startswith(("23", "24")):
        return True
    return False


def province_for_municipality(code: str) -> str:
    if code.startswith("1"):
        return "10000"
    if code.startswith("7"):
        return "70000"
    if code.startswith("4"):
        return "40000"
    if code.startswith("3"):
        return "30000"
    if code.startswith(("23", "24")):
        return "20001"
    return ""


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def sort_year(records: List[Dict[str, Any]], *keys: str) -> List[Dict[str, Any]]:
    return sorted(records, key=lambda row: tuple([row["year"], *[row[k] for k in keys]]))


def main() -> int:
    args = parse_args()
    env_path = Path(args.env_file).resolve() if args.env_file else None
    analysis_results_dir = Path(args.analysis_results_dir).resolve()
    data_repo_root = Path(args.data_repo_root).resolve() if args.data_repo_root else None
    public_results_dir = Path(args.public_results_dir).resolve()

    api_key = get_api_key(env_path, args.api_key_name)
    session = requests.Session()
    session.headers.update({"apikey": api_key})

    variable_meta = get_entity(session, f"Variables('{odata_quote(VARIABLE_CODE)}')", args.timeout)
    source_meta = get_entity(
        session,
        f"Variables('{odata_quote(VARIABLE_CODE)}')/DataSource",
        args.timeout,
    )

    geo_items_by_level: Dict[str, Dict[str, str]] = {}
    for geo_level in ["gewest", "provincie2024", "gemeente2024"]:
        entries = list(
            iter_collection(
                session,
                f"GeoLevels('{odata_quote(geo_level)}')/GeoItems?$select=ExternalCode,Name",
                args.timeout,
            )
        )
        geo_items_by_level[geo_level] = {
            str(row.get("ExternalCode", "")): str(row.get("Name", ""))
            for row in entries
            if row.get("ExternalCode")
        }

    # --- Totals (geen dimensie) ---
    gewest_values = list(
        iter_collection(
            session,
            f"Variables('{odata_quote(VARIABLE_CODE)}')/GeoLevels('gewest')/"
            "PeriodLevels('year')/Periods('all')/Values",
            args.timeout,
        )
    )
    yearly_totals_vlaanderen = sort_year(
        [
            {
                "year": int(row["Period"]),
                "value": to_int(row.get("ValueString")),
            }
            for row in gewest_values
            if row.get("ExternalCode") == "gewest_2000"
        ]
    )

    province_values = list(
        iter_collection(
            session,
            f"Variables('{odata_quote(VARIABLE_CODE)}')/GeoLevels('provincie2024')/"
            "PeriodLevels('year')/Periods('all')/Values",
            args.timeout,
        )
    )
    yearly_totals_provinces = sort_year(
        [
            {
                "year": int(row["Period"]),
                "province_code": suffix_code,
                "province_name": geo_items_by_level["provincie2024"].get(ext_code, ""),
                "value": to_int(row.get("ValueString")),
            }
            for row in province_values
            for ext_code in [str(row.get("ExternalCode", ""))]
            for suffix_code in [extract_suffix_code(ext_code)]
            if suffix_code in FLEMISH_PROVINCE_CODES
        ],
        "province_name",
    )

    municipality_values = list(
        iter_collection(
            session,
            f"Variables('{odata_quote(VARIABLE_CODE)}')/GeoLevels('gemeente2024')/"
            "PeriodLevels('year')/Periods('all')/Values",
            args.timeout,
        )
    )
    yearly_totals_municipalities = sort_year(
        [
            {
                "year": int(row["Period"]),
                "municipality_code": suffix_code,
                "municipality_name": geo_items_by_level["gemeente2024"].get(ext_code, ""),
                "province_code": province_for_municipality(suffix_code),
                "value": to_int(row.get("ValueString")),
            }
            for row in municipality_values
            for ext_code in [str(row.get("ExternalCode", ""))]
            for suffix_code in [extract_suffix_code(ext_code)]
            if is_flemish_municipality_code(suffix_code)
        ],
        "municipality_code",
    )

    years = sorted({row["year"] for row in yearly_totals_vlaanderen})
    latest_year = years[-1]

    # --- Dimensies ---
    dim_lookup: Dict[str, List[Dict[str, str]]] = {}
    yearly_by_instelling_vlaanderen: List[Dict[str, Any]] = []
    yearly_by_instelling_provinces: List[Dict[str, Any]] = []
    yearly_by_opleiding_vlaanderen: List[Dict[str, Any]] = []
    yearly_by_studiegebied_vlaanderen: List[Dict[str, Any]] = []

    province_filter = " or ".join(
        [f"ExternalCode eq 'provincie2024_{code}'" for code in sorted(FLEMISH_PROVINCE_CODES)]
    )
    for dim_level, dim_key in DIM_LEVELS.items():
        members = list(
            iter_collection(
                session,
                f"CubeVariables('{odata_quote(VARIABLE_CODE)}')/DimLevels('{odata_quote(dim_level)}')/"
                "DimMembers?$select=ExternalCode,Name",
                args.timeout,
            )
        )
        dim_lookup[dim_key] = [
            {"code": str(member["ExternalCode"]), "name": str(member["Name"])}
            for member in members
        ]

        for member in members:
            member_code = str(member["ExternalCode"])
            member_name = str(member["Name"])

            vlaanderen_rows = list(
                iter_collection(
                    session,
                    f"CubeVariables('{odata_quote(VARIABLE_CODE)}')/DimItems('{odata_quote(member_code)}')/"
                    "GeoLevels('gewest')/PeriodLevels('year')/Periods('all')/Values",
                    args.timeout,
                    params={"$filter": "ExternalCode eq 'gewest_2000'"},
                )
            )
            for row in vlaanderen_rows:
                target = {
                    "year": int(row["Period"]),
                    f"{dim_key}_code": member_code,
                    f"{dim_key}_name": member_name,
                    "value": to_int(row.get("ValueString")),
                }
                if dim_key == "type_onderwijsinstelling":
                    yearly_by_instelling_vlaanderen.append(target)
                elif dim_key == "opleiding":
                    yearly_by_opleiding_vlaanderen.append(target)
                else:
                    yearly_by_studiegebied_vlaanderen.append(target)

            if dim_key == "type_onderwijsinstelling":
                province_rows = list(
                    iter_collection(
                        session,
                        f"CubeVariables('{odata_quote(VARIABLE_CODE)}')/DimItems('{odata_quote(member_code)}')/"
                        "GeoLevels('provincie2024')/PeriodLevels('year')/Periods('all')/Values",
                        args.timeout,
                        params={"$filter": province_filter},
                    )
                )
                for row in province_rows:
                    ext_code = str(row.get("ExternalCode", ""))
                    province_code = extract_suffix_code(ext_code)
                    if province_code not in FLEMISH_PROVINCE_CODES:
                        continue
                    yearly_by_instelling_provinces.append(
                        {
                            "year": int(row["Period"]),
                            "province_code": province_code,
                            "province_name": geo_items_by_level["provincie2024"].get(ext_code, ""),
                            "type_onderwijsinstelling_code": member_code,
                            "type_onderwijsinstelling_name": member_name,
                            "value": to_int(row.get("ValueString")),
                        }
                    )

    yearly_by_instelling_vlaanderen = sort_year(
        yearly_by_instelling_vlaanderen, "type_onderwijsinstelling_name"
    )
    yearly_by_instelling_provinces = sort_year(
        yearly_by_instelling_provinces, "province_name", "type_onderwijsinstelling_name"
    )
    yearly_by_opleiding_vlaanderen = sort_year(
        yearly_by_opleiding_vlaanderen, "opleiding_name"
    )
    yearly_by_studiegebied_vlaanderen = sort_year(
        yearly_by_studiegebied_vlaanderen, "studiegebied_name"
    )

    latest_by_instelling_vlaanderen = sorted(
        [
            row
            for row in yearly_by_instelling_vlaanderen
            if row["year"] == latest_year
        ],
        key=lambda row: row["value"],
        reverse=True,
    )
    latest_by_opleiding_vlaanderen = sorted(
        [
            row
            for row in yearly_by_opleiding_vlaanderen
            if row["year"] == latest_year
        ],
        key=lambda row: row["value"],
        reverse=True,
    )
    latest_by_studiegebied_vlaanderen = sorted(
        [
            row
            for row in yearly_by_studiegebied_vlaanderen
            if row["year"] == latest_year
        ],
        key=lambda row: row["value"],
        reverse=True,
    )
    province_latest_totals = sorted(
        [row for row in yearly_totals_provinces if row["year"] == latest_year],
        key=lambda row: row["value"],
        reverse=True,
    )

    lookups = {
        "years": years,
        "latest_year": latest_year,
        "province_codes_flanders": sorted(FLEMISH_PROVINCE_CODES),
        "provinces": sorted(
            [
                {"code": row["province_code"], "name": row["province_name"]}
                for row in province_latest_totals
            ],
            key=lambda row: row["name"],
        ),
        "dimensions": dim_lookup,
    }

    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "api_base_url": BASE_URL,
        "variable_code": VARIABLE_CODE,
        "variable_name": variable_meta.get("Name"),
        "variable_description": variable_meta.get("Description"),
        "variable_unit": variable_meta.get("Unit"),
        "variable_source": variable_meta.get("Source"),
        "variable_last_update": variable_meta.get("LastUpdate"),
        "data_source_name": source_meta.get("Name"),
        "data_source_owner": source_meta.get("SourceDataOwner"),
        "data_source_frequency": source_meta.get("Frequency"),
        "data_source_reference_date": source_meta.get("ReferenceDate"),
        "data_source_time_comparability": source_meta.get("TimeComparability"),
        "data_source_limitations": source_meta.get("DataLimitations"),
        "data_source_last_update": source_meta.get("LastUpdate"),
        "period_start": int(variable_meta.get("StartPeriod", 0)),
        "period_end": int(variable_meta.get("EndPeriod", 0)),
        "years": years,
        "latest_year": latest_year,
        "notes": [
            "Dataset: woonplaats (WP), enkel Vlaams Gewest en Vlaamse provincies/gemeenten in outputs.",
            "Niet-lokaliseerbare en buiten-Vlaanderen codes zijn uitgesloten van provinciale en gemeentelijke outputs.",
            "Totalen en dimensie-uitsplitsingen zijn rechtstreeks opgehaald uit PinC OData.",
        ],
    }

    payloads: Dict[str, Any] = {
        "metadata.json": metadata,
        "lookups.json": lookups,
        "yearly_totals_vlaanderen.json": yearly_totals_vlaanderen,
        "yearly_totals_provinces.json": yearly_totals_provinces,
        "yearly_totals_municipalities.json": yearly_totals_municipalities,
        "yearly_by_instelling_vlaanderen.json": yearly_by_instelling_vlaanderen,
        "yearly_by_instelling_provinces.json": yearly_by_instelling_provinces,
        "yearly_by_opleiding_vlaanderen.json": yearly_by_opleiding_vlaanderen,
        "yearly_by_studiegebied_vlaanderen.json": yearly_by_studiegebied_vlaanderen,
        "latest_by_instelling_vlaanderen.json": latest_by_instelling_vlaanderen,
        "latest_by_opleiding_vlaanderen.json": latest_by_opleiding_vlaanderen,
        "latest_by_studiegebied_vlaanderen.json": latest_by_studiegebied_vlaanderen,
        "province_latest_totals.json": province_latest_totals,
    }

    output_dirs = [analysis_results_dir, public_results_dir]
    if data_repo_root is not None:
        output_dirs.extend(
            [
                data_repo_root / "analyses" / "inschrijvingen-onderwijs" / "results",
                data_repo_root / "docs" / "analyses" / "inschrijvingen-onderwijs" / "results",
            ]
        )

    unique_output_dirs = list(dict.fromkeys(output_dirs))
    for out_dir in unique_output_dirs:
        ensure_dir(out_dir)
        for filename, payload in payloads.items():
            write_json(out_dir / filename, payload)

    print("Download en verwerking voltooid.")
    print(f"Variable: {VARIABLE_CODE}")
    print(f"Jaren: {years[0]}-{years[-1]} | Laatste jaar: {latest_year}")
    print(f"Bestanden geschreven: {len(payloads)}")
    for out_dir in unique_output_dirs:
        print(f"- {out_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
