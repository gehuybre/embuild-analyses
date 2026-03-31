#!/usr/bin/env python3
import argparse
import csv
import json
import os
import sys
from typing import Any, Dict, List, Tuple


def load_schema(schema_path: str) -> Dict[str, Any]:
    if not os.path.isfile(schema_path):
        return {}
    with open(schema_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def list_results_files(results_dir: str) -> List[str]:
    files = []
    for entry in os.listdir(results_dir):
        if entry.startswith("."):
            continue
        path = os.path.join(results_dir, entry)
        if os.path.isfile(path):
            files.append(path)
    return files


def json_size(data: Any) -> Tuple[int, Any]:
    if isinstance(data, list):
        return len(data), data
    if isinstance(data, dict):
        if "data" in data and isinstance(data["data"], list):
            return len(data["data"]), data["data"]
        if "features" in data and isinstance(data["features"], list):
            return len(data["features"]), data["features"]
        return len(data), data
    return 0, data


def validate_json(path: str) -> Tuple[bool, str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:
        return False, f"Failed to parse JSON: {exc}", None

    size, sample = json_size(data)
    if size == 0:
        return False, "JSON is empty", data
    return True, f"rows={size}", sample


def validate_csv(path: str) -> Tuple[bool, str, List[Dict[str, str]]]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None:
                return False, "CSV missing header", []
            rows = list(reader)
    except Exception as exc:
        return False, f"Failed to parse CSV: {exc}", []

    if not rows:
        return False, "CSV has no rows", rows
    return True, f"rows={len(rows)}", rows


def required_fields_ok(data: Any, required: List[str]) -> Tuple[bool, str]:
    if not required:
        return True, "OK"
    if isinstance(data, list):
        if not data:
            return False, "No data rows for required field check"
        sample = data[0]
    elif isinstance(data, dict):
        sample = data
    else:
        return False, "Unsupported data type for required field check"

    if not isinstance(sample, dict):
        return False, "Sample row is not an object"

    missing = [field for field in required if field not in sample]
    if missing:
        return False, f"Missing required fields: {', '.join(missing)}"
    return True, "OK"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate results outputs for an analysis.")
    parser.add_argument("--slug", required=True, help="Analysis slug.")
    parser.add_argument(
        "--results-dir",
        default=None,
        help="Results directory (defaults to embuild-analyses/analyses/<slug>/results).",
    )
    parser.add_argument(
        "--require-schema",
        action="store_true",
        help="Fail if results/schema.json is missing.",
    )
    args = parser.parse_args()

    results_dir = args.results_dir or os.path.join(
        "embuild-analyses", "analyses", args.slug, "results"
    )
    if not os.path.isdir(results_dir):
        print(f"ERROR: Missing results directory: {results_dir}", file=sys.stderr)
        return 1

    files = list_results_files(results_dir)
    if not files:
        print(f"ERROR: No files found in {results_dir}", file=sys.stderr)
        return 1

    schema_path = os.path.join(results_dir, "schema.json")
    schema = load_schema(schema_path)
    if args.require_schema and not schema:
        print("ERROR: Missing schema.json in results directory.", file=sys.stderr)
        return 1

    issues = []
    notes = []
    checked = 0

    for path in files:
        name = os.path.basename(path)
        if name == "schema.json":
            continue

        if name.endswith(".json"):
            ok, info, sample = validate_json(path)
        elif name.endswith(".csv"):
            ok, info, sample = validate_csv(path)
        else:
            continue

        checked += 1

        if not ok:
            issues.append(f"{name}: {info}")
            continue

        notes.append(f"{name}: {info}")

        if schema and "files" in schema and name in schema["files"]:
            required = schema["files"][name].get("requiredFields", [])
            data_key = schema["files"][name].get("dataKey")
            data_for_check = sample
            if data_key and isinstance(sample, dict):
                data_for_check = sample.get(data_key)
                if data_for_check is None:
                    issues.append(f"{name}: dataKey '{data_key}' not found")
                    continue

            ok_fields, msg = required_fields_ok(data_for_check, required)
            if not ok_fields:
                issues.append(f"{name}: {msg}")

    if checked == 0:
        print("ERROR: No JSON/CSV files found in results directory.", file=sys.stderr)
        return 1

    if issues:
        for item in issues:
            print(f"ERROR: {item}", file=sys.stderr)
        return 1

    if not schema:
        print("WARNING: schema.json not found; required field checks skipped.")

    print("OK")
    for note in notes:
        print(f"INFO: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
