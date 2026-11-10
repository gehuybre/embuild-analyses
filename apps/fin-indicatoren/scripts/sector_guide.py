"""Sectorcodes met de exacte NBB-omschrijving, voor de indicatorengids van de blog."""

from __future__ import annotations

import pandas as pd

BENCHMARK_CODE = "PU450"


def build_sector_guide(codelist_csv, article_chapters: list[dict]) -> list[dict]:
    """codelist_csv = downloads/.../CL_AA_SECTOR.csv (via raw_export). Omschrijving blijft letterlijk de bronnaam."""
    names = pd.read_csv(codelist_csv).set_index("code")["naam_nl"].to_dict()
    groups = [("subsectors", "Bouwsubsectoren"), ("peer-sectors", "Hoofdsectoren")]
    guide = []
    for key, title in groups:
        chapter = next(c for c in article_chapters if c["key"] == key)
        items = []
        for series in chapter["indicators"][0]["series"]:
            official = names[series["key"]]
            prefix = f"{series['key']} : "
            items.append({
                "code": series["key"],
                "label": series["label"],
                "description": official[len(prefix):] if official.startswith(prefix) else official,
            })
        guide.append({"key": key, "title": title, "items": items})
    official = names[BENCHMARK_CODE]
    prefix = f"{BENCHMARK_CODE} : "
    guide[1]["items"].append({
        "code": BENCHMARK_CODE,
        "label": "Alle sectoren",
        "description": official[len(prefix):] if official.startswith(prefix) else official,
    })
    return guide
