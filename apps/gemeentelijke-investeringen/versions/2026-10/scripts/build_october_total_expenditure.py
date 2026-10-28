"""Total planned expenditure per municipality and book year (meest recente meerjarenplan).

Source: data-13.xlsx, the BBC-DR export with investment (I.1), financing (F.I) and operating
(E.I) expenditure of the Budgettaire Boekhouding. Each plan (2014, 2020, 2026) keeps only its
own six book years, the same convention as the construction series. Used as the denominator of
`investments-share-total`; the numerator comes from municipality_domain_year.json.
"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_october_data import SOURCE_DIR, read_workbook  # noqa: E402

SOURCE_FILE = "data-13.xlsx"
ACTUAL_SOURCE_FILE = "data-14.xlsx"
DATA = Path(__file__).resolve().parents[1] / "public" / "data"
OUTPUT = DATA / "total_expenditure.json"
ACTUAL_OUTPUT = DATA / "total_expenditure_actual.json"
REQUIRED_FILTERS = ("[Meest recente] is Ja", "[Type rapport] is Meerjarenplan", "[Type boekhouding] is Budgettaire Boekhouding")
ACTUAL_FILTERS = ("[Meest recente] is Ja", "[Type rapport] is Jaarrekening", "[Type boekhouding] is Budgettaire Boekhouding")


def read_total(source_dir, name, required_filters):
    path = source_dir / name
    frame, filters = read_workbook(path)
    for required in required_filters:
        if required not in filters:
            raise ValueError(f"{name}: source filter missing: {required}")
    for expected in ("I.1 Investeringsuitgaven", "F.I Financieringsuitgaven", "E.I Exploitatie-uitgaven"):
        if expected not in filters:
            raise ValueError(f"{name}: expenditure level missing: {expected}")
    missing = {"NIS-code", "Type rapport", "Rapportjaar", "Boekjaar", "Uitgave"} - set(frame.columns)
    if missing:
        raise ValueError(f"{name}: missing columns {sorted(missing)}")
    frame["NIS-code"] = frame["NIS-code"].astype(str).str.strip()
    return path, frame


def build_actual(source_dir):
    """Annual accounts: total expenditure plus the construction amount of the same municipality-year."""
    path, frame = read_total(source_dir, ACTUAL_SOURCE_FILE, ACTUAL_FILTERS)
    if set(frame["Type rapport"]) != {"Jaarrekening"} or not (frame.Rapportjaar == frame.Boekjaar).all():
        raise ValueError(f"{ACTUAL_SOURCE_FILE}: expected annual accounts with report year equal to book year")
    if frame.duplicated(["NIS-code", "Boekjaar"]).any():
        raise ValueError(f"{ACTUAL_SOURCE_FILE}: duplicate municipality/year cells")
    if set(frame.Boekjaar) != set(range(2014, 2026)) or frame.groupby("Boekjaar")["NIS-code"].nunique().ne(285).any():
        raise ValueError(f"{ACTUAL_SOURCE_FILE}: not every municipality has every book year 2014-2025")
    if frame.Uitgave.isna().any() or (frame.Uitgave <= 0).any():
        raise ValueError(f"{ACTUAL_SOURCE_FILE}: missing or non-positive total expenditure")
    municipalities = {}
    for nis, rows in frame.sort_values("Boekjaar").groupby("NIS-code"):
        series = json.loads((DATA / "geo" / f"{nis}.json").read_text(encoding="utf-8"))["series"]["actual"]["amounts"]
        municipalities[nis] = {
            str(year): [round(float(amount), 2), series.get(str(year))] for year, amount in zip(rows.Boekjaar, rows.Uitgave)
        }
    absent = sorted((nis, year) for nis, years in municipalities.items() for year, (_, built) in years.items() if built is None)
    payload = {
        "source_file": ACTUAL_SOURCE_FILE,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "scope": "Jaarrekeningen, budgettaire boekhouding: investeringsuitgaven (I.1), financieringsuitgaven (F.I) en exploitatie-uitgaven (E.I)",
        "columns": ["totale uitgaven", "bouwinvesteringen (null: gemeente ontbreekt in de bouwreeks)"],
        "municipalities": municipalities,
    }
    ACTUAL_OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Annual accounts: {len(municipalities)} municipalities; no construction series for {absent}")


def main(source_dir=SOURCE_DIR):
    build_actual(source_dir)
    path, frame = read_total(source_dir, SOURCE_FILE, REQUIRED_FILTERS)
    if set(frame["Type rapport"]) != {"Meerjarenplan"} or set(frame.Rapportjaar) != {2014, 2020, 2026}:
        raise ValueError(f"{SOURCE_FILE}: unexpected report type or plan years")
    if frame.duplicated(["NIS-code", "Rapportjaar", "Boekjaar"]).any():
        raise ValueError(f"{SOURCE_FILE}: duplicate municipality/plan/year cells")
    data = frame[frame.Boekjaar.between(frame.Rapportjaar, frame.Rapportjaar + 5)]
    municipalities = sorted(data["NIS-code"].unique())
    if len(municipalities) != 285 or data.groupby("Boekjaar")["NIS-code"].nunique().ne(285).any():
        raise ValueError(f"{SOURCE_FILE}: not every municipality has every book year 2014-2031")
    if (data.Uitgave <= 0).any():
        print(f"Warning: {int((data.Uitgave <= 0).sum())} non-positive cell(s) kept as published")
    payload = {
        "source_file": SOURCE_FILE,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "scope": "Investeringsuitgaven (I.1), financieringsuitgaven (F.I) en exploitatie-uitgaven (E.I), budgettaire boekhouding, meest recente meerjarenplan",
        "municipalities": {
            nis: {str(year): round(float(amount), 2) for year, amount in zip(rows.Boekjaar, rows.Uitgave)}
            for nis, rows in data.sort_values("Boekjaar").groupby("NIS-code")
        },
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"{len(municipalities)} municipalities, {OUTPUT.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
