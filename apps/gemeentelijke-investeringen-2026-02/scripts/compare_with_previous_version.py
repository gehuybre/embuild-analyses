"""
Vergelijk de BV-cijfers van deze versie met de vorige versie (apps/gemeentelijke-investeringen).

Enkel de boekjaren binnen de legislatuur van elk rapportjaar tellen mee, zoals in de app
(2014-2019, 2020-2025, 2026-2031). Toont per rapportjaar:
- het aandeel cellen (gemeente x beleidsveld x boekjaar) dat op de euro identiek is
- het verschil in totaal, en welke beleidsvelden het verschil verklaren
- hoeveel gemeenten meer dan 5% afwijken
"""
import pandas as pd
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
PREVIOUS_APP_DIR = APP_DIR.parent / 'gemeentelijke-investeringen'
WINDOWS = {2014: (2014, 2019), 2020: (2020, 2025), 2026: (2026, 2031)}
KEYS = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']


def load(app_dir):
    df = pd.read_parquet(app_dir / 'public' / 'data' / 'investments_bv.parquet')
    df['Rapportjaar'] = df['Rapportjaar'].astype(int)
    df['Boekjaar'] = df['Boekjaar'].astype(int)
    in_window = [WINDOWS[r][0] <= b <= WINDOWS[r][1] for r, b in zip(df['Rapportjaar'], df['Boekjaar'])]
    return df[in_window]


def compare_rek():
    """REK: andere scope dan de vorige versie (zonder I.1.A en I.1.C), dus enkel totalen per categorie."""
    totals = {}
    for label, app_dir in (('oud', PREVIOUS_APP_DIR), ('nieuw', APP_DIR)):
        df = pd.read_parquet(app_dir / 'public' / 'data' / 'investments_rek.parquet')
        df['Rapportjaar'] = df['Rapportjaar'].astype(int)
        df['Boekjaar'] = df['Boekjaar'].astype(int)
        in_window = [WINDOWS[r][0] <= b <= WINDOWS[r][1] for r, b in zip(df['Rapportjaar'], df['Boekjaar'])]
        totals[label] = df[in_window].groupby(['Rapportjaar', 'Niveau_3'])['Totaal'].sum() / 1e6
    table = pd.concat(totals, axis=1).fillna(0).round(0)
    print("\n=== REK, totaal per categorie (M euro, binnen legislatuur) ===")
    print(table.to_string())


def main():
    compare_rek()
    old, new = load(PREVIOUS_APP_DIR), load(APP_DIR)
    merged = old.merge(new, on=KEYS, how='outer', suffixes=('_oud', '_nieuw'), indicator=True)
    merged['Totaal_oud'] = merged['Totaal_oud'].fillna(0)
    merged['Totaal_nieuw'] = merged['Totaal_nieuw'].fillna(0)
    merged['verschil'] = merged['Totaal_nieuw'] - merged['Totaal_oud']

    for rapportjaar, group in merged.groupby('Rapportjaar'):
        both = group[group['_merge'] == 'both']
        total_old, total_new = group['Totaal_oud'].sum(), group['Totaal_nieuw'].sum()
        print(f"\n=== Rapportjaar {rapportjaar} ===")
        print(f"Totaal oud {total_old / 1e6:,.0f} M, nieuw {total_new / 1e6:,.0f} M, "
              f"verschil {(total_new - total_old) / 1e6:+,.1f} M ({total_new / total_old - 1:+.2%})")
        print(f"Cellen in beide versies: {len(both)}, op de euro identiek: {(both['verschil'].abs() < 1).mean():.1%}")
        print(f"Enkel in oud: {(group['_merge'] == 'left_only').sum()}, enkel in nieuw: {(group['_merge'] == 'right_only').sum()}")

        by_field = group.groupby('Beleidsveld')['verschil'].sum().sort_values()
        print("Grootste dalers (M euro):")
        print((by_field.head(4) / 1e6).round(1).to_string())
        print("Grootste stijgers (M euro):")
        print((by_field.tail(3) / 1e6).round(1).to_string())

        by_municipality = group.groupby('NIS_code')[['Totaal_oud', 'Totaal_nieuw']].sum()
        relative = (by_municipality['Totaal_nieuw'] / by_municipality['Totaal_oud'] - 1).abs()
        print(f"Gemeenten met meer dan 5% afwijking: {(relative > 0.05).sum()} van {len(by_municipality)}")


if __name__ == '__main__':
    main()
