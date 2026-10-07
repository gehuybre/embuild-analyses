"""
Bouwt public/data/comparison.json: een vergelijking van de BV- en REK-cijfers van de drie versies van de analyse

- februari 2026: apps/gemeentelijke-investeringen-2026-02 (exports van januari 2026, BV herberekend)
- mei 2026:      apps/gemeentelijke-investeringen
- september 2026: apps/gemeentelijke-investeringen-2026-09

Per paar (februari-mei, mei-september, februari-september) komen er totalen, boekjaren, beleidsdomeinen,
beleidsvelden, gemeenten en economische rekening in het bestand.

Enkel de boekjaren binnen de legislatuur van elk rapportjaar tellen mee (2014-2019, 2020-2025, 2026-2031), zoals in de
apps zelf. Bedragen zijn nominaal, in euro.

Gebruik: python3 scripts/build_comparison_data.py
"""
import json
from datetime import date
from pathlib import Path

import pandas as pd

APP_DIR = Path(__file__).resolve().parent.parent
APPS_DIR = APP_DIR.parent
OUT = APP_DIR / 'public' / 'data' / 'comparison.json'

# Chronologische volgorde.
VERSIONS = [
    {'key': 'feb', 'label': 'Februari 2026', 'slug': 'gemeentelijke-investeringen-2026-02'},
    {'key': 'mei', 'label': 'Mei 2026', 'slug': 'gemeentelijke-investeringen'},
    {'key': 'sep', 'label': 'September 2026', 'slug': 'gemeentelijke-investeringen-2026-09'},
]
PAIRS = [('feb', 'mei'), ('mei', 'sep'), ('feb', 'sep')]

WINDOWS = {2014: (2014, 2019), 2020: (2020, 2025), 2026: (2026, 2031)}
KEYS = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']


def load(slug, name):
    df = pd.read_parquet(APPS_DIR / slug / 'public' / 'data' / name)
    df['Rapportjaar'] = df['Rapportjaar'].astype(int)
    df['Boekjaar'] = df['Boekjaar'].astype(int)
    in_window = [WINDOWS[r][0] <= b <= WINDOWS[r][1] for r, b in zip(df['Rapportjaar'], df['Boekjaar'])]
    return df[in_window]


def pair_totals(old, new, keys):
    """Totaal per sleutel in beide versies, samengevoegd (ontbrekend = 0)."""
    a = old.groupby(keys)['Totaal'].sum().rename('old')
    b = new.groupby(keys)['Totaal'].sum().rename('new')
    return pd.concat([a, b], axis=1).fillna(0).reset_index()


def rows(df):
    out = df.copy()
    out['old'] = out['old'].round(0)
    out['new'] = out['new'].round(0)
    return out.to_dict(orient='records')


def compare(old_version, new_version, names):
    old = load(old_version['slug'], 'investments_bv.parquet')
    new = load(new_version['slug'], 'investments_bv.parquet')

    merged = old.merge(new, on=KEYS, how='outer', suffixes=('_oud', '_nieuw'), indicator=True)
    merged['Totaal_oud'] = merged['Totaal_oud'].fillna(0)
    merged['Totaal_nieuw'] = merged['Totaal_nieuw'].fillna(0)

    municipality = pair_totals(old, new, ['Rapportjaar', 'NIS_code'])
    summary = []
    for rapportjaar, group in merged.groupby('Rapportjaar'):
        both = group[group['_merge'] == 'both']
        m = municipality[municipality['Rapportjaar'] == rapportjaar]
        in_both = m[(m['old'] > 0) & (m['new'] > 0)]
        relative = (in_both['new'] / in_both['old'] - 1).abs()
        summary.append({
            'rapportjaar': int(rapportjaar),
            'old': round(group['Totaal_oud'].sum()),
            'new': round(group['Totaal_nieuw'].sum()),
            'cells_both': int(len(both)),
            'cells_identical': int(((both['Totaal_nieuw'] - both['Totaal_oud']).abs() < 1).sum()),
            'cells_only_old': int((group['_merge'] == 'left_only').sum()),
            'cells_only_new': int((group['_merge'] == 'right_only').sum()),
            'municipalities': int(len(m)),
            'municipalities_in_both': int(len(in_both)),
            'municipalities_over_5pct': int((relative > 0.05).sum()),
            'cells_changed': int(((both['Totaal_nieuw'] - both['Totaal_oud']).abs() >= 1).sum()),
        })

    municipality['naam'] = municipality['NIS_code'].map(names).fillna(municipality['NIS_code'])
    rek = pair_totals(
        load(old_version['slug'], 'investments_rek.parquet'),
        load(new_version['slug'], 'investments_rek.parquet'),
        ['Rapportjaar', 'Niveau_3'],
    )

    return {
        'key': f"{old_version['key']}_{new_version['key']}",
        'old': old_version['key'],
        'new': new_version['key'],
        'summary': summary,
        'by_boekjaar': rows(pair_totals(old, new, ['Rapportjaar', 'Boekjaar'])),
        'by_domein': rows(pair_totals(old, new, ['Rapportjaar', 'BV_domein'])),
        'by_field': rows(pair_totals(old, new, ['Rapportjaar', 'BV_domein', 'Beleidsveld'])),
        'municipalities': rows(municipality),
        'rek': rows(rek),
    }


def main():
    by_key = {v['key']: v for v in VERSIONS}
    names = json.loads(
        (APPS_DIR / 'gemeentelijke-investeringen-2026-09' / 'public' / 'data' / 'bv_lookups.json').read_text()
    )['municipalities']

    comparisons = [compare(by_key[a], by_key[b], names) for a, b in PAIRS]
    payload = {
        'generated': date.today().isoformat(),
        'versions': [{k: v[k] for k in ('key', 'label', 'slug')} for v in VERSIONS],
        'windows': {str(k): list(v) for k, v in WINDOWS.items()},
        'comparisons': comparisons,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT} ({OUT.stat().st_size / 1024:.0f} kB)')
    for c in comparisons:
        print(f"\n{by_key[c['old']]['label']} -> {by_key[c['new']]['label']}")
        for s in c['summary']:
            print(f"  {s['rapportjaar']}: {s['old'] / 1e6:,.0f} M -> {s['new'] / 1e6:,.0f} M ({s['new'] / s['old'] - 1:+.2%}), "
                  f"identiek {s['cells_identical'] / s['cells_both']:.1%}, "
                  f"gemeenten >5%: {s['municipalities_over_5pct']}/{s['municipalities_in_both']}")


if __name__ == '__main__':
    main()
