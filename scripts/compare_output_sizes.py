"""Compare file sizes for CSV, indexed CSV, and Parquet outputs for the investments analysis.

Run from repo root: python scripts/compare_output_sizes.py
"""
from pathlib import Path
import os

BASE = Path(__file__).resolve().parent.parent / 'embuild-analyses' / 'analyses' / 'gemeentelijke-investeringen' / 'results'
FILES = [
    'investments_by_domain.csv',
    'investments_by_domain.parquet',
    'investments_by_domain_indexed.csv',
    'investments_by_domain_municipalities.csv',
    'investments_by_domain_domains.csv',
    'investments_by_domain_subdomains.csv',
    'investments_by_category.csv',
    'investments_by_category.parquet',
    'investments_by_category_indexed.csv',
    'investments_by_category_municipalities.csv',
    'investments_by_category_categories.csv',
]


def human_readable_size(n):
    for unit in ['B','KB','MB','GB']:
        if n < 1024.0:
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}TB"


def main():
    for f in FILES:
        p = BASE / f
        if p.exists():
            size = os.path.getsize(p)
            print(f"{f}: {human_readable_size(size)}")
        else:
            print(f"{f}: MISSING")

if __name__ == '__main__':
    main()
