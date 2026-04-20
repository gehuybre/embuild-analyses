#!/usr/bin/env python3
"""Download and compare NBB company ratios for construction vs all sectors.

This script downloads:
- the SDMX data slice for `PU300` (Bouwnijverheid) and `PU450` (alle sectoren)
- the codelists needed to label ratio, sector, dispersion and model codes

It then writes:
- raw XML downloads in `nbb-api/downloads/cbratiose_bouw_vs_alle_sectoren/`
- analysis-ready CSV files in `nbb-api/analysis/cbratiose_bouw_vs_alle_sectoren/`
- a small Markdown summary in the analysis folder
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET

import pandas as pd
import requests


BASE_URL = "https://nsidisseminate-stat.nbb.be/rest"
DATAFLOW = "BE2,DF_CBRATIOSE,1.0"
DATA_KEY = "A..PU300+PU450.dispg+dispq2+dispnb.C+A+M+T"
DATA_PARAMS = {"dimensionAtObservation": "AllDimensions"}
CODELIST_IDS = [
    "CL_CBRATIOSE_ITEM",
    "CL_AA_SECTOR",
    "CL_AA_VALNR",
    "CL_AA_SCHEME",
]

NS = {
    "message": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message",
    "generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
    "common": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common",
    "structure": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure",
}


@dataclass(frozen=True)
class Codebook:
    labels: dict[str, str]
    order: dict[str, int]


def fetch(session: requests.Session, url: str, *, params: dict[str, str] | None = None) -> bytes:
    response = session.get(url, params=params, timeout=60)
    response.raise_for_status()
    return response.content


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def parse_codebook(xml_bytes: bytes, lang: str = "nl") -> Codebook:
    root = ET.fromstring(xml_bytes)
    labels: dict[str, str] = {}
    order: dict[str, int] = {}

    for index, code in enumerate(root.findall(".//structure:Code", NS), start=1):
        code_id = code.attrib["id"]
        name = None
        for node in code.findall("common:Name", NS):
            if node.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") == lang:
                name = (node.text or "").strip()
                break
        if not name:
            fallback = code.find("common:Name", NS)
            name = (fallback.text or "").strip() if fallback is not None else code_id
        labels[code_id] = name
        order[code_id] = index

    return Codebook(labels=labels, order=order)


def parse_observations(xml_bytes: bytes) -> list[dict[str, object]]:
    root = ET.fromstring(xml_bytes)
    rows: list[dict[str, object]] = []

    for obs in root.findall(".//generic:Obs", NS):
        row: dict[str, object] = {}

        for value in obs.findall("generic:ObsKey/generic:Value", NS):
            row[value.attrib["id"]] = value.attrib["value"]

        obs_value = obs.find("generic:ObsValue", NS)
        row["OBS_VALUE"] = float(obs_value.attrib["value"]) if obs_value is not None else None

        for attribute in obs.findall("generic:Attributes/generic:Value", NS):
            row[attribute.attrib["id"]] = attribute.attrib["value"]

        rows.append(row)

    return rows


def build_long_frame(
    observations: list[dict[str, object]],
    ratio_codes: Codebook,
    sector_codes: Codebook,
    valnr_codes: Codebook,
    scheme_codes: Codebook,
) -> pd.DataFrame:
    frame = pd.DataFrame(observations)
    if frame.empty:
        raise RuntimeError("De API gaf geen observaties terug voor de gevraagde slice.")

    frame["year"] = pd.to_numeric(frame["TIME_PERIOD"], errors="coerce").astype("Int64")
    frame["value"] = pd.to_numeric(frame["OBS_VALUE"], errors="coerce")
    frame["decimals"] = pd.to_numeric(frame.get("DECIMALS"), errors="coerce").astype("Int64")

    frame["ratio_code"] = frame["CBRATIOSE_ITEM"]
    frame["ratio_label_nl"] = frame["ratio_code"].map(ratio_codes.labels)
    frame["ratio_order"] = frame["ratio_code"].map(ratio_codes.order)

    frame["sector_code"] = frame["SECTOR"]
    frame["sector_label_nl"] = frame["sector_code"].map(sector_codes.labels)
    frame["sector_order"] = frame["sector_code"].map(sector_codes.order)

    frame["dispersion_code"] = frame["VALNR"]
    frame["dispersion_label_nl"] = frame["dispersion_code"].map(valnr_codes.labels)
    frame["dispersion_order"] = frame["dispersion_code"].map(valnr_codes.order)

    frame["scheme_code"] = frame["SCHEME"]
    frame["scheme_label_nl"] = frame["scheme_code"].map(scheme_codes.labels)
    frame["scheme_order"] = frame["scheme_code"].map(scheme_codes.order)

    selected_columns = [
        "year",
        "ratio_order",
        "ratio_code",
        "ratio_label_nl",
        "sector_order",
        "sector_code",
        "sector_label_nl",
        "dispersion_order",
        "dispersion_code",
        "dispersion_label_nl",
        "scheme_order",
        "scheme_code",
        "scheme_label_nl",
        "value",
        "UNIT_MEASURE",
        "decimals",
        "OBS_STATUS",
    ]

    long_frame = frame[selected_columns].sort_values(
        by=[
            "year",
            "scheme_order",
            "dispersion_order",
            "ratio_order",
            "sector_order",
        ],
        kind="stable",
    )

    return long_frame.rename(columns={"UNIT_MEASURE": "unit_measure", "OBS_STATUS": "obs_status"})


def build_comparison_frame(long_frame: pd.DataFrame) -> pd.DataFrame:
    index_columns = [
        "year",
        "scheme_order",
        "scheme_code",
        "scheme_label_nl",
        "dispersion_order",
        "dispersion_code",
        "dispersion_label_nl",
        "ratio_order",
        "ratio_code",
        "ratio_label_nl",
        "unit_measure",
        "decimals",
    ]

    comparison = (
        long_frame.pivot_table(
            index=index_columns,
            columns="sector_code",
            values="value",
            aggfunc="first",
        )
        .reset_index()
        .rename_axis(columns=None)
        .rename(
            columns={
                "PU300": "value_pu300",
                "PU450": "value_pu450",
            }
        )
    )

    comparison["difference_pu300_minus_pu450"] = comparison["value_pu300"] - comparison["value_pu450"]
    comparison["ratio_pu300_div_pu450"] = comparison["value_pu300"] / comparison["value_pu450"]

    return comparison.sort_values(
        by=["year", "scheme_order", "dispersion_order", "ratio_order"],
        kind="stable",
    )


def build_summary(long_frame: pd.DataFrame, comparison_frame: pd.DataFrame, data_url: str) -> str:
    years = [int(year) for year in long_frame["year"].dropna().astype(int).unique()]
    years.sort()

    schemes = (
        long_frame[["scheme_order", "scheme_code", "scheme_label_nl"]]
        .drop_duplicates()
        .sort_values("scheme_order", kind="stable")
    )
    dispersions = (
        long_frame[["dispersion_order", "dispersion_code", "dispersion_label_nl"]]
        .drop_duplicates()
        .sort_values("dispersion_order", kind="stable")
    )

    counts = (
        comparison_frame.groupby(["scheme_label_nl", "dispersion_label_nl"], dropna=False)
        .size()
        .rename("rows")
        .reset_index()
        .sort_values(["scheme_label_nl", "dispersion_label_nl"], kind="stable")
    )

    lines = [
        "# NBB CBRATIOSE: Bouwnijverheid vs alle sectoren",
        "",
        f"- Bron-URL: `{data_url}`",
        f"- Beschikbare jaren: {years[0]} t.e.m. {years[-1]}" if years else "- Beschikbare jaren: geen",
        f"- Aantal observaties in long-form: {len(long_frame)}",
        f"- Aantal vergelijkingsrijen: {len(comparison_frame)}",
        "",
        "## Modellen",
        "",
    ]

    for row in schemes.itertuples(index=False):
        lines.append(f"- `{row.scheme_code}`: {row.scheme_label_nl}")

    lines.extend(["", "## Dispersiematen", ""])
    for row in dispersions.itertuples(index=False):
        lines.append(f"- `{row.dispersion_code}`: {row.dispersion_label_nl}")

    lines.extend(
        [
            "",
            "## Bestanden",
            "",
            "- `downloads/cbratiose_bouw_vs_alle_sectoren/data.xml`: ruwe SDMX-response",
            "- `analysis/cbratiose_bouw_vs_alle_sectoren/cbratiose_bouw_vs_alle_sectoren_long.csv`: gelabelde observaties",
            "- `analysis/cbratiose_bouw_vs_alle_sectoren/cbratiose_bouw_vs_alle_sectoren_comparison.csv`: PU300 vs PU450 naast elkaar, plus verschil en ratio",
            "",
            "## Rijen per model en dispersiemaat",
            "",
            "| Model | Dispersiemaat | Rijen |",
            "|---|---|---:|",
        ]
    )

    for row in counts.itertuples(index=False):
        lines.append(f"| {row.scheme_label_nl} | {row.dispersion_label_nl} | {row.rows} |")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Basismap voor downloads en analyse-output.",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    download_dir = root / "downloads" / "cbratiose_bouw_vs_alle_sectoren"
    analysis_dir = root / "analysis" / "cbratiose_bouw_vs_alle_sectoren"
    analysis_dir.mkdir(parents=True, exist_ok=True)
    download_dir.mkdir(parents=True, exist_ok=True)

    data_url = f"{BASE_URL}/data/{DATAFLOW}/{DATA_KEY}"

    with requests.Session() as session:
        data_xml = fetch(session, data_url, params=DATA_PARAMS)
        write_bytes(download_dir / "data.xml", data_xml)

        codelists: dict[str, Codebook] = {}
        for codelist_id in CODELIST_IDS:
            codelist_url = f"{BASE_URL}/codelist/BE2/{codelist_id}/1.0"
            xml_bytes = fetch(session, codelist_url)
            write_bytes(download_dir / f"{codelist_id}.xml", xml_bytes)
            codelists[codelist_id] = parse_codebook(xml_bytes)

    observations = parse_observations(data_xml)
    long_frame = build_long_frame(
        observations=observations,
        ratio_codes=codelists["CL_CBRATIOSE_ITEM"],
        sector_codes=codelists["CL_AA_SECTOR"],
        valnr_codes=codelists["CL_AA_VALNR"],
        scheme_codes=codelists["CL_AA_SCHEME"],
    )
    comparison_frame = build_comparison_frame(long_frame)

    long_frame.to_csv(
        analysis_dir / "cbratiose_bouw_vs_alle_sectoren_long.csv",
        index=False,
    )
    comparison_frame.to_csv(
        analysis_dir / "cbratiose_bouw_vs_alle_sectoren_comparison.csv",
        index=False,
    )

    summary = build_summary(long_frame, comparison_frame, data_url)
    (analysis_dir / "README.md").write_text(summary, encoding="utf-8")

    years = [int(year) for year in long_frame["year"].dropna().astype(int).unique()]
    years.sort()
    print(f"Observaties: {len(long_frame)}")
    print(f"Vergelijkingsrijen: {len(comparison_frame)}")
    if years:
        print(f"Jaren: {years[0]}-{years[-1]}")
    print(f"Output: {analysis_dir}")


if __name__ == "__main__":
    main()
