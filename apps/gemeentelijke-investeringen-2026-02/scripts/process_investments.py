"""
Verwerk de BBC-DR exports van het begin van 2026 (versie "Februari 2026") naar de tidy parquet-bestanden die
prepare_visualizations.py nodig heeft.

BV: de drie ruwe exports (`MJP BV 2014/2020/2026 MVA.csv`, uitgevoerd op 16 januari 2026) worden rechtstreeks als tekst
ingelezen. Getallen staan in Nederlandse notatie (punt als duizendtalscheiding, komma als decimaalteken). De eerste
verwerking las deze CSV's in blokken met `pd.read_csv`, waardoor kolommen met enkel getalachtige waarden (bv. "990.000")
als decimaal getal (990,0) werden ingelezen en na het weghalen van de punt als 9.900 eindigden. Hier gebeurt dat niet.

REK: de ruwe REK-exports zijn niet bewaard. We nemen de verwerkte parquet van 14 januari 2026 over (zie README).

Semantiek identiek aan de andere versies: waarden van 0 of lager vallen weg en gemeentefusies worden enkel voor
rapportjaar 2026 samengevoegd.
"""
import shutil
from pathlib import Path

import pandas as pd

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / 'data'
RESULTS_DIR = APP_DIR / 'results'
PUBLIC_DATA_DIR = APP_DIR / 'public' / 'data'
RESULTS_DIR.mkdir(exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

BV_FILES = ['MJP BV 2014 MVA.csv', 'MJP BV 2020 MVA.csv', 'MJP BV 2026 MVA.csv']
REK_PARQUET = DATA_DIR / 'REK januari 2026 (verwerkt, 14 jan).parquet'
HEADER_ROWS = ['Type rapport', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']

# NIS Merger mapping (sources -> target)
NIS_MERGERS = {
    '11007': '11002', # Borsbeek -> Antwerpen
    '23023': '23106', '23024': '23106', '23032': '23106', # Pajottegem
    '37012': '37021', '37018': '37021', # Wingene
    '37007': '37022', '37015': '37022', # Tielt
    '44012': '44086', '44048': '44086', # Nazareth-De Pinte
    '44034': '44087', '44073': '44087', # Lochristi
    '46014': '46029', '44045': '46029', # Lokeren
    '44040': '44088', '44043': '44088', # Merelbeke-Melle
    '46003': '46030', '46013': '46030', '11056': '46030', # Beveren-Kruibeke-Zwijndrecht
    '73006': '73110', '73032': '73110', # Bilzen-Hoeselt
    '73009': '73111', '73083': '73111', # Tongeren-Borgloon
    '71069': '71071', '71057': '71071', # Tessenderlo-Ham
    '71022': '71072', '73040': '71072', # Hasselt
}

def is_flemish(nis_code):
    """Check if NIS code starts with a Flemish digit (1, 2, 3, 4, 7)."""
    if not nis_code: return False
    return str(nis_code)[0] in '12347'

def get_mapped_nis(nis_code, rapportjaar):
    """
    Return target NIS code if part of a merger.

    Municipality mergers only apply from 2026 onwards.
    Historical data (2014, 2020) should use original NIS codes.
    """
    if rapportjaar < 2026:
        return str(nis_code)  # No mergers before 2026
    return NIS_MERGERS.get(str(nis_code), str(nis_code))



def parse_dutch_number(series):
    """'1.267,10' -> 1267.10 en '990.000' -> 990000.0; werkt enkel op tekst."""
    return pd.to_numeric(series.str.replace('.', '', regex=False).str.replace(',', '.', regex=False), errors='coerce')


def process_bv_csv(path):
    """Ruwe breed formaat (kolommen = beleidsveld x boekjaar x waardetype, rijen = NIS-code) naar tidy."""
    print(f"Lees {path.name}")
    raw = pd.read_csv(path, sep=';', header=None, dtype=str, encoding='utf-8-sig')
    nis_row = next(i for i in range(30) if raw.iloc[i, 0] == 'NIS-code')
    if [raw.iloc[i, 0] for i in range(nis_row)] != HEADER_ROWS:
        raise ValueError(f"Onverwachte koprijen in {path.name}")

    meta = raw.iloc[:nis_row, 1:].T
    meta.columns = HEADER_ROWS
    meta['Waardetype'] = raw.iloc[nis_row, 1:].values
    if sorted(meta['Type rapport'].unique()) != ['Meerjarenplan']:
        raise ValueError(f"Onverwacht Type rapport in {path.name}")

    body = raw.iloc[nis_row + 1:, :]
    body = body[body[0].fillna('').str.fullmatch(r'\d+')]
    long = body.melt(id_vars=0, var_name='kolom', value_name='waarde').dropna(subset=['waarde'])
    long = long.join(meta, on='kolom').rename(columns={0: 'NIS-code'})
    long['waarde'] = parse_dutch_number(long['waarde'])
    long['Rapportjaar'] = long['Rapportjaar'].astype(int)
    long['Boekjaar'] = long['Boekjaar'].astype(int)
    long = long[long['NIS-code'].map(is_flemish)]

    cell_cols = ['NIS-code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']
    wide = long.pivot_table(index=cell_cols, columns='Waardetype', values='waarde', aggfunc='sum').reset_index()
    wide['Totaal'] = wide['Uitgave'].where(wide['Uitgave'] > 0)
    wide['Per_inwoner'] = wide['Uitgave per inwoner'].where(wide['Uitgave per inwoner'] > 0)
    wide = wide[wide['Totaal'].notna() | wide['Per_inwoner'].notna()].copy()
    wide['NIS_code'] = [get_mapped_nis(n, r) for n, r in zip(wide['NIS-code'], wide['Rapportjaar'])]

    out_cols = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']
    df = wide.groupby(out_cols, dropna=False)[['Totaal', 'Per_inwoner']].sum(min_count=1).reset_index()
    for rapportjaar, group in df.groupby('Rapportjaar'):
        print(f"  Rapportjaar {rapportjaar}: boekjaren {sorted(group['Boekjaar'].unique())}, "
              f"{group['NIS_code'].nunique()} gemeenten, totaal {group['Totaal'].sum():,.0f}")
    return df


def main():
    bv = pd.concat([process_bv_csv(DATA_DIR / name) for name in BV_FILES], ignore_index=True)
    bv['Rapportjaar'] = bv['Rapportjaar'].astype('int16')
    bv['Boekjaar'] = bv['Boekjaar'].astype('int16')
    bv.to_parquet(RESULTS_DIR / 'investments_bv.parquet', index=False, compression='snappy')
    shutil.copy2(RESULTS_DIR / 'investments_bv.parquet', PUBLIC_DATA_DIR / 'investments_bv.parquet')
    print(f"BV opgeslagen: {bv.shape}")

    shutil.copy2(REK_PARQUET, RESULTS_DIR / 'investments_rek.parquet')
    shutil.copy2(REK_PARQUET, PUBLIC_DATA_DIR / 'investments_rek.parquet')
    rek = pd.read_parquet(REK_PARQUET)
    print(f"REK overgenomen: {rek.shape}, gemeenten per rapportjaar: "
          f"{rek.groupby('Rapportjaar')['NIS_code'].nunique().to_dict()}")


if __name__ == '__main__':
    main()
