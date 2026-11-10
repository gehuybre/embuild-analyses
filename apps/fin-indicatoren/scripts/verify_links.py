#!/usr/bin/env python3
"""Controleer dat alle links en bronverwijzingen van de blog werken en naar de juiste bron wijzen.

  * alle URL's in de datasets (article.json, eurostat-sbs.json, marktwerking.json) en in src/components
  * Eurostat-datasetcodes: bestaan ze in de API en komt de titel overeen met wat de blog toont?
Exitcode 1 bij een kapotte link of een dataset die niet bestaat. Een site die bots blokkeert (403/429) geeft een
waarschuwing, geen fout.

  python scripts/verify_links.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
PUBLIC = APP_ROOT / "public" / "data"
UA = "Mozilla/5.0 (compatible; embuild-data-blog-linkcheck/1.0)"
URL_RE = re.compile(r"https?://[^\s\"'<>)`\\]+")
IGNORE = ("https://ec.europa.eu/eurostat/databrowser/view/${",)  # sjablonen die per dataset ingevuld worden


def status_of(url: str) -> tuple[int | None, str]:
    for method in ("HEAD", "GET"):
        request = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.status, response.geturl()
        except urllib.error.HTTPError as error:
            if method == "HEAD" and error.code in (400, 403, 405, 501):
                continue
            return error.code, url
        except Exception as error:  # noqa: BLE001
            if method == "GET":
                return None, str(error)
    return None, "geen antwoord"


def collect_urls() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}

    def add(url: str, where: str) -> None:
        url = url.rstrip(".,;")
        if url.startswith(IGNORE) or "${" in url or "{" in url:
            return
        found.setdefault(url, set()).add(where)

    def walk(node, where: str) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value, where)
        elif isinstance(node, list):
            for value in node:
                walk(value, where)
        elif isinstance(node, str):
            for url in URL_RE.findall(node):
                add(url, where)

    for name in ("article.json", "eurostat-sbs.json", "marktwerking.json", "metadata.json"):
        path = PUBLIC / name
        if path.exists():
            walk(json.loads(path.read_text(encoding="utf-8")), name)
    for path in sorted((APP_ROOT / "src").rglob("*.tsx")):
        for url in URL_RE.findall(path.read_text(encoding="utf-8")):
            add(url, f"src/{path.name}")
    return found


def check_eurostat_datasets() -> list[str]:
    """Bestaat elke getoonde datasetcode en is de getoonde titel de officiële titel?"""
    problems = []
    data = json.loads((PUBLIC / "eurostat-sbs.json").read_text(encoding="utf-8"))
    shown = {code: item["title"] for code, item in data.get("datasetInfo", {}).items()}
    shown.update({item["code"]: item["title"] for item in data.get("notUsed", [])})
    api = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
    for code, title in sorted(shown.items()):
        query = urllib.parse.urlencode({"format": "JSON", "lang": "EN", "geo": "BE", "time": "2020"})
        try:
            request = urllib.request.Request(f"{api}/{code}?{query}", headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=60) as response:
                official = json.load(response).get("label", "")
        except Exception as error:  # noqa: BLE001
            problems.append(f"Eurostat-dataset {code} bestaat niet of is onbereikbaar: {error}")
            continue
        if re.sub(r"\W+", "", official).lower() != re.sub(r"\W+", "", title).lower():
            problems.append(f"Eurostat-dataset {code}: blog toont '{title}', Eurostat noemt het '{official}'")
    print(f"[Eurostat-datasets] {len(shown)} codes gecontroleerd tegen de API")
    return problems


def main() -> int:
    urls = collect_urls()
    broken, warnings = [], []
    for url, where in sorted(urls.items()):
        code, final = status_of(url)
        label = ", ".join(sorted(where))
        if code is not None and 200 <= code < 400:
            print(f"  OK   {code} {url}")
        elif code in (403, 429):
            warnings.append(f"{url} ({code}, bot-beveiliging; manueel nakijken) [{label}]")
            print(f"  ?    {code} {url}")
        else:
            broken.append(f"{url} -> {code or final} [{label}]")
            print(f"  FOUT {code} {url}")
    problems = check_eurostat_datasets()
    print(f"\n{len(urls)} links gecontroleerd: {len(broken)} kapot, {len(warnings)} waarschuwingen")
    for line in warnings:
        print("   WAARSCHUWING:", line)
    for line in broken + problems:
        print("   FOUT:", line)
    return 0 if not (broken or problems) else 1


if __name__ == "__main__":
    raise SystemExit(main())
