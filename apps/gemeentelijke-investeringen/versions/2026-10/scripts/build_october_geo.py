"""Per-municipality and per-province October data: yearly series plus a BV x account cube.

The cube comes from the per-plan exports that carry both the economic account and the
policy field (Beleidsveld), so the construction scope stays filterable per domain.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

DETAIL_SOURCES = {
    "JR 2014.xlsx": ("actual", "Jaarrekening", None),
    "JR 2020.xlsx": ("actual", "Jaarrekening", None),
    "MJP 2014.xlsx": ("latest", "Meerjarenplan", 2014),
    "MJP 2020.xlsx": ("latest", "Meerjarenplan", 2020),
    "MJP 2026.xlsx": ("latest", "Meerjarenplan", 2026),
}
DETAIL_REQUIRED = (
    "NIS-code", "Type rapport", "Rapportjaar", "Boekjaar", "Niveau 2", "Niveau 5",
    "Alg. rekening", "BV_domein", "BV_subdomein", "Beleidsveld", "Uitgave", "Uitgave per inwoner",
)
CUBE_SOURCES = ("latest", "actual")
PROVINCES = {
    "10000": ("Antwerpen", ("1",)),
    "20001": ("Vlaams-Brabant", ("23", "24")),
    "30000": ("West-Vlaanderen", ("3",)),
    "40000": ("Oost-Vlaanderen", ("4",)),
    "70000": ("Limburg", ("7",)),
}
# Projectbrowser categories (bouwprojecten-gemeenten) follow the BV domain number.
PROJECT_CATEGORIES = {
    "0": "00-algemene-financiering", "1": "01-algemeen-bestuur", "2": "02-mobiliteit",
    "3": "03-natuur-milieu", "4": "04-veiligheidszorg", "5": "05-ondernemen-werken",
    "6": "06-wonen-ruimte", "7": "07-cultuur-vrije-tijd", "8": "08-onderwijs", "9": "09-zorg-opvang",
}
# Projects only carry Niveau 4, so construction groups link to their parent account.
PROJECT_ACCOUNT_GROUPS = {
    "I.1.B.1.a": "I.1.B.1", "I.1.B.1.b": "I.1.B.1", "I.1.B.1.e": "I.1.B.1",
    "I.1.B.2.a": "I.1.B.2", "I.1.D": "I.1.D",
}
YEARS = range(2014, 2032)


def province_of(nis):
    for code, (_, prefixes) in PROVINCES.items():
        if nis.startswith(prefixes):
            return code
    raise ValueError(f"No Flemish province for NIS {nis}")


def read_detail(source_dir, read_workbook, scope):
    """Validate the per-plan exports and return construction rows plus population per municipality-year."""
    frames, audit = [], {}
    for filename, (key, report_type, plan_year) in DETAIL_SOURCES.items():
        path = source_dir / filename
        frame, filters = read_workbook(path)
        for required in ("[Meest recente] is Ja", f"[Type rapport] is {report_type}", "Beleidsveld (BV)"):
            if required not in filters:
                raise ValueError(f"{filename}: source filter missing: {required}")
        missing = set(DETAIL_REQUIRED) - set(frame.columns)
        if missing:
            raise ValueError(f"{filename}: missing columns {sorted(missing)}")
        data = frame[list(DETAIL_REQUIRED)].copy()
        data["NIS-code"] = data["NIS-code"].astype(str).str.strip()
        if not data["NIS-code"].str.fullmatch(r"\d{5}").all():
            raise ValueError(f"{filename}: invalid municipality codes")
        if set(data["Type rapport"]) != {report_type}:
            raise ValueError(f"{filename}: expected report type {report_type}")
        if set(data["Niveau 2"]) != {"I.1 Investeringsuitgaven"}:
            raise ValueError(f"{filename}: unexpected expenditure level")
        for column in ("Rapportjaar", "Boekjaar", "Uitgave", "Uitgave per inwoner"):
            data[column] = pd.to_numeric(data[column], errors="raise")
            if not np.isfinite(data[column]).all():
                raise ValueError(f"{filename}: non-finite or missing {column}")
        for column in ("Rapportjaar", "Boekjaar"):
            if not (data[column] % 1 == 0).all():
                raise ValueError(f"{filename}: non-integer {column}")
            data[column] = data[column].astype(int)
        if data[["Niveau 5", "BV_domein", "BV_subdomein", "Beleidsveld"]].isna().any().any():
            raise ValueError(f"{filename}: missing account or policy classification")
        if data.duplicated(["NIS-code", "Rapportjaar", "Boekjaar", "Alg. rekening", "Beleidsveld"]).any():
            raise ValueError(f"{filename}: duplicate municipality/year/account/policy-field cells")
        data = data[data["NIS-code"].str[0].isin(list("12347"))].copy()
        if plan_year is None:
            if not (data.Rapportjaar == data.Boekjaar).all():
                raise ValueError(f"{filename}: annual account report year must equal book year")
        else:
            if set(data.Rapportjaar) != {plan_year}:
                raise ValueError(f"{filename}: expected plan year {plan_year}")
            data = data[data.Boekjaar.between(plan_year, plan_year + 5)].copy()
        data["source"] = key
        audit[filename] = {"source": key, "raw_rows": len(frame), "source_filters": filters}
        frames.append(data)
    data = pd.concat(frames, ignore_index=True)
    for key, expected in (("latest", set(YEARS)), ("actual", set(range(2014, 2026)))):
        if set(data.loc[data.source == key, "Boekjaar"]) != expected:
            raise ValueError(f"Unexpected or missing book years for detail source {key}")
    if data.duplicated(["source", "NIS-code", "Boekjaar", "Alg. rekening", "Beleidsveld"]).any():
        raise ValueError("Detail exports overlap for the same book year")

    with_ratio = data[(data["Uitgave per inwoner"] != 0) & (data.Uitgave != 0)]
    implied = (with_ratio.Uitgave / with_ratio["Uitgave per inwoner"]).round()
    population = implied.groupby([with_ratio["NIS-code"], with_ratio.Boekjaar]).median()
    data["group"] = data["Niveau 5"].str.split().str[0]
    selected = data[data.group.isin(scope)].copy()
    # Same convention as the yearly charts: drop accounts whose municipality-year sum is not positive.
    account_sum = selected.groupby(["source", "NIS-code", "Boekjaar", "Alg. rekening"]).Uitgave.transform("sum")
    construction = selected[account_sum > 0].copy()
    return construction, population, audit


def complete_population(population, municipalities):
    """Fill municipality-years without a per-capita ratio from the nearest observed year."""
    by_nis = {nis: values.droplevel(0) for nis, values in population.groupby(level=0)}
    rows = {}
    for nis in municipalities:
        observed = by_nis.get(nis)
        if observed is None or observed.empty:
            raise ValueError(f"No population for {nis}")
        series = observed.reindex(YEARS).interpolate(limit_direction="both").round()
        rows[nis] = {int(year): int(value) for year, value in series.items()}
    return rows


def build_geo(source_dir, output, read_workbook, scope, cell_data, presence, national_totals, names):
    construction, population_raw, audit = read_detail(source_dir, read_workbook, scope)
    municipalities = sorted(names)
    population = complete_population(population_raw, municipalities)

    domains = sorted(construction.BV_domein.unique(), key=lambda label: int(label.split()[0]))
    subdomains = sorted(construction.BV_subdomein.unique())
    accounts = sorted(construction["Alg. rekening"].unique())
    account_group = construction.drop_duplicates("Alg. rekening").set_index("Alg. rekening").group
    subdomain_domain = construction.drop_duplicates("BV_subdomein").set_index("BV_subdomein").BV_domein
    if construction.groupby("BV_subdomein").BV_domein.nunique().max() > 1:
        raise ValueError("A policy subdomain belongs to more than one domain")
    sub_index = {label: index for index, label in enumerate(subdomains)}
    account_index = {label: index for index, label in enumerate(accounts)}

    cube = (
        construction.groupby(["NIS-code", "source", "Boekjaar", "BV_subdomein", "Alg. rekening"]).Uitgave.sum().reset_index()
    )
    cube = cube[cube.Uitgave != 0]

    reconciliation = []
    for key in CUBE_SOURCES:
        per_year = cube[cube.source == key].groupby("Boekjaar").Uitgave.sum()
        for year, amount in per_year.items():
            reference = national_totals[key].get(year)
            difference = float(amount - reference)
            if abs(difference) > max(0.001 * reference, 1):
                raise ValueError(f"Detail export {key} {year} differs {difference:.0f} EUR from the yearly export")
            reconciliation.append({"source": key, "book_year": int(year), "detail_total": float(amount),
                                   "yearly_total": float(reference), "difference": difference})

    yearly_cells = pd.concat(
        [frame.assign(source=key)[["source", "NIS-code", "Boekjaar", "Uitgave"]] for key, frame in cell_data.items()]
    )
    yearly = yearly_cells.groupby(["NIS-code", "source", "Boekjaar"]).Uitgave.sum()

    geo_dir = output / "geo"
    geo_dir.mkdir(parents=True, exist_ok=True)
    for stale in geo_dir.glob("*.json"):
        stale.unlink()

    groups = {"vlaanderen": ("Vlaanderen", "region", municipalities)}
    for code, (label, _) in PROVINCES.items():
        groups[code] = (label, "province", [nis for nis in municipalities if province_of(nis) == code])
    for nis in municipalities:
        groups[nis] = (names[nis], "municipality", [nis])

    cube_by_nis = {nis: frame for nis, frame in cube.groupby("NIS-code")}
    for code, (label, kind, members) in groups.items():
        member_set = set(members)
        series = {}
        for key in cell_data:
            amounts, counts = {}, {}
            for year in YEARS:
                present = [nis for nis in members if (key, nis, year) in presence]
                if not present:
                    continue
                counts[year] = len(present)
                amounts[year] = round(float(sum(yearly.get((nis, key, year), 0.0) for nis in present)), 2)
            series[key] = {"amounts": amounts, "municipalities": counts}
        parts = [cube_by_nis[nis] for nis in members if nis in cube_by_nis]
        rows = []
        if parts:
            grouped = pd.concat(parts).groupby(["source", "Boekjaar", "BV_subdomein", "Alg. rekening"]).Uitgave.sum()
            rows = [
                [CUBE_SOURCES.index(source), int(year), sub_index[sub], account_index[account], round(float(amount), 2)]
                for (source, year, sub, account), amount in grouped.items() if round(float(amount), 2) != 0
            ]
        payload = {
            "code": code,
            "name": label,
            "type": kind,
            "municipality_count": len(member_set),
            "population": {year: sum(population[nis][year] for nis in members) for year in YEARS},
            "series": series,
            "cube_columns": ["source", "year", "subdomain", "account", "amount"],
            "cube": rows,
        }
        (geo_dir / f"{code}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8"
        )

    index = {
        "cube_sources": list(CUBE_SOURCES),
        "domains": [
            {"label": label, "name": label.split(" ", 1)[1], "project_category": PROJECT_CATEGORIES[label.split()[0]]}
            for label in domains
        ],
        "subdomains": [
            {"label": label, "name": label.split(" ", 1)[1], "domain": domains.index(subdomain_domain[label])}
            for label in subdomains
        ],
        "accounts": [
            {"label": label, "group": account_group[label], "project_account": PROJECT_ACCOUNT_GROUPS[account_group[label]]}
            for label in accounts
        ],
        "scope": {code: scope[code] for code in scope},
        "policy_fields": dict(sorted(
            (label.split()[0], label) for label in construction.Beleidsveld.unique()
        )),
        "provinces": {code: label for code, (label, _) in PROVINCES.items()},
        "municipalities": [
            {"code": nis, "name": names[nis], "province": province_of(nis)}
            for nis in sorted(municipalities, key=lambda nis: names[nis])
        ],
    }
    (geo_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for column in ("Alg. rekening", "Beleidsveld"):
        codes = construction[column].drop_duplicates().str.split().str[0]
        if codes.duplicated().any():
            raise ValueError(f"{column} codes are not unique")
    detail = construction.assign(
        account_code=construction["Alg. rekening"].str.split().str[0],
        policy_field=construction.Beleidsveld.str.split().str[0],
    )[["source", "NIS-code", "Rapportjaar", "Boekjaar", "account_code", "policy_field", "Uitgave"]]
    detail.to_csv(output / "construction_detail_bv.csv", index=False)
    print(f"Generated {len(groups)} geography files and a {len(cube)}-cell BV x account cube in {geo_dir}")
    return {"detail_sources": audit, "detail_reconciliation": reconciliation}
