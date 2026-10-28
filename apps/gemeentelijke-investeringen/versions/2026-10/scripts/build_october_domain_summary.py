"""Compact municipality x domain x book-year table (meest recent plan) from the geo files.

Feeds the municipality ranking and map of `investments-bv` and `investments-bv-indexed`
without loading all 285 municipality files in the browser. Run after build_october_data.py.
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public" / "data"
LATEST = 0


def main():
    index = json.loads((DATA / "geo" / "index.json").read_text(encoding="utf-8"))
    domain_of = [subdomain["domain"] for subdomain in index["subdomains"]]
    municipalities = {}
    for entry in index["municipalities"]:
        payload = json.loads((DATA / "geo" / f"{entry['code']}.json").read_text(encoding="utf-8"))
        domains = {}
        for source, year, subdomain, _, amount in payload["cube"]:
            if source != LATEST:
                continue
            by_year = domains.setdefault(str(domain_of[subdomain]), {})
            by_year[str(year)] = by_year.get(str(year), 0) + amount
        municipalities[entry["code"]] = {
            "population": payload["population"],
            "domains": {domain: {year: round(amount, 2) for year, amount in sorted(years.items())}
                        for domain, years in sorted(domains.items(), key=lambda item: int(item[0]))},
        }
    output = DATA / "municipality_domain_year.json"
    output.write_text(json.dumps({"source": "latest", "municipalities": municipalities},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(municipalities)} municipalities, {output.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
