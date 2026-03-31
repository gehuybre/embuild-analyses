#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
import sys
from typing import Any, Dict, Iterable, List, Set


DEFAULT_FIELDS = ["m", "municipalityCode", "nis", "nis_code", "nisCode", "municipality"]


def load_municipality_codes() -> Set[str]:
    path = os.path.join("embuild-analyses", "public", "maps", "belgium_municipalities.json")
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return {str(feature["properties"]["code"]) for feature in data.get("features", [])}


def list_results_files(results_dir: str) -> List[str]:
    files = []
    for entry in os.listdir(results_dir):
        if entry.startswith("."):
            continue
        path = os.path.join(results_dir, entry)
        if os.path.isfile(path):
            files.append(path)
    return files


def extract_values_from_json(data: Any, fields: Set[str]) -> Dict[str, List[Any]]:
    values: Dict[str, List[Any]] = {field: [] for field in fields}
    rows: Iterable[Any]
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        if "data" in data and isinstance(data["data"], list):
            rows = data["data"]
        elif "features" in data and isinstance(data["features"], list):
            rows = data["features"]
        else:
            rows = [data]
    else:
        return values

    for row in rows:
        if not isinstance(row, dict):
            continue
        for field in fields:
            if field in row:
                values[field].append(row[field])
    return values


def extract_values_from_csv(path: str, fields: Set[str]) -> Dict[str, List[Any]]:
    values: Dict[str, List[Any]] = {field: [] for field in fields}
    with open(path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            return values
        for row in reader:
            for field in fields:
                if field in row:
                    values[field].append(row[field])
    return values


def normalize_code(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int,)):
        return f"{value}"
    if isinstance(value, float) and value.is_integer():
        return f"{int(value)}"

    raw = str(value).strip()
    if not raw:
        return ""
    try:
        as_float = float(raw)
        if as_float.is_integer():
            return f"{int(as_float)}"
    except ValueError:
        pass

    digits = re.sub(r"\D", "", raw)
    return digits


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate municipality NIS codes in results files.")
    parser.add_argument("--slug", required=True, help="Analysis slug.")
    parser.add_argument(
        "--results-dir",
        default=None,
        help="Results directory (defaults to embuild-analyses/analyses/<slug>/results).",
    )
    parser.add_argument(
        "--fields",
        default=",".join(DEFAULT_FIELDS),
        help="Comma-separated list of field names to validate as NIS codes.",
    )
    args = parser.parse_args()

    results_dir = args.results_dir or os.path.join(
        "embuild-analyses", "analyses", args.slug, "results"
    )
    if not os.path.isdir(results_dir):
        print(f"ERROR: Missing results directory: {results_dir}", file=sys.stderr)
        return 1

    fields = {field.strip() for field in args.fields.split(",") if field.strip()}
    if not fields:
        print("ERROR: No fields provided for NIS validation.", file=sys.stderr)
        return 1

    municipality_codes = load_municipality_codes()
    files = list_results_files(results_dir)
    found_any = False
    invalid_samples: List[str] = []

    for path in files:
        name = os.path.basename(path)
        if name.endswith(".json"):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except Exception:
                continue
            field_values = extract_values_from_json(data, fields)
        elif name.endswith(".csv"):
            field_values = extract_values_from_csv(path, fields)
        else:
            continue

        for field, values in field_values.items():
            if not values:
                continue
            found_any = True
            for value in values:
                code = normalize_code(value)
                if len(code) != 5 or code not in municipality_codes:
                    invalid_samples.append(f"{name}:{field}={value}")
                    if len(invalid_samples) >= 10:
                        break
            if len(invalid_samples) >= 10:
                break
        if len(invalid_samples) >= 10:
            break

    if not found_any:
        print("WARNING: No NIS fields found; skipping validation.")
        return 0

    if invalid_samples:
        print("ERROR: Invalid NIS codes found.", file=sys.stderr)
        for sample in invalid_samples:
            print(f"ERROR: {sample}", file=sys.stderr)
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
