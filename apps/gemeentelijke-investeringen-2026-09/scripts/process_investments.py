"""
Script to process municipal investment data from multi-year plans (versie september 2026).

Processes two types of files:
- REK workbook: Investeringen gegroepeerd per economische rekening (alg. rekening, niveau 3),
  `MJP REK 2026 MVA v september.xlsx`, met Rapportjaar als kolom. Zonder dit bestand (en zonder
  `mjp rek *.csv`) blijft de bestaande REK-parquet in public/data ongewijzigd in gebruik.
- BV workbook: Investeringen gegroepeerd per beleidsdomein (BV_domein, BV_subdomein, beleidsveld),
  `MJP BV 2026 MVA v september.xlsx`, met alle drie rapportjaren (2014, 2020, 2026) in een tidy
  tabel met een extra opsplitsing op Niveau 8 (algemene rekening) die hier wordt weggesommeerd.

Data structure:
- Rapportjaren: 2014, 2020, 2026 (legislatuur start jaren)
- Per rapportjaar: meerdere boekjaren (hele legislatuur)
- Beide totale uitgave EN uitgave per inwoner in hetzelfde bestand
- NIS-codes ipv gemeentenamen
"""
import pandas as pd
import shutil
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / 'data'
RESULTS_DIR = APP_DIR / 'results'
PUBLIC_DATA_DIR = APP_DIR / 'public' / 'data'
RESULTS_DIR.mkdir(exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_REK = RESULTS_DIR / 'investments_rek.parquet'
OUTPUT_BV = RESULTS_DIR / 'investments_bv.parquet'
PUBLIC_OUTPUT_REK = PUBLIC_DATA_DIR / 'investments_rek.parquet'
PUBLIC_OUTPUT_BV = PUBLIC_DATA_DIR / 'investments_bv.parquet'

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


def resolve_input_path(*candidates: str) -> Path:
    for candidate in candidates:
        path = DATA_DIR / candidate
        if path.exists():
            return path
    return DATA_DIR / candidates[0]


BV_WORKBOOK = 'MJP BV 2026 MVA v september.xlsx'
BV_REQUIRED_COLS = [
    'NIS-code',
    'Type rapport',
    'Rapportjaar',
    'Boekjaar',
    'BV_domein',
    'BV_subdomein',
    'Beleidsveld',
    'Uitgave',
    'Uitgave per inwoner',
]


def read_tidy_workbook(workbook_path, required_cols):
    """Lees een tidy BBC-DR export (filtertekst boven de koptekst) en geef de gevraagde kolommen terug."""
    print(f"Lees workbook: {workbook_path.name}")
    raw = pd.read_excel(workbook_path, sheet_name=0, header=None, dtype=object)

    header_idx = next(
        (i for i, value in enumerate(raw.iloc[:, 0]) if str(value).strip() == 'NIS-code'),
        None,
    )
    if header_idx is None:
        raise ValueError(f"'NIS-code' header row not found in {workbook_path}")

    data = raw.iloc[header_idx + 1:].copy()
    data.columns = [str(value).strip() for value in raw.iloc[header_idx].tolist()]

    missing_cols = [col for col in required_cols if col not in data.columns]
    if missing_cols:
        raise ValueError(f"Ontbrekende kolommen in {workbook_path.name}: {missing_cols}")

    data = data[required_cols].copy()
    data['NIS-code'] = data['NIS-code'].astype(str).str.split('.').str[0].str.strip()
    data = data[data['NIS-code'].str.isdigit()]
    data['Rapportjaar'] = data['Rapportjaar'].astype(int)
    data['Boekjaar'] = data['Boekjaar'].astype(int)
    data['Uitgave'] = pd.to_numeric(data['Uitgave'], errors='coerce')
    data['Uitgave per inwoner'] = pd.to_numeric(data['Uitgave per inwoner'], errors='coerce')

    plan_types = sorted(data['Type rapport'].unique())
    if plan_types != ['Meerjarenplan']:
        raise ValueError(f"Onverwacht Type rapport in {workbook_path.name}: {plan_types}")

    return data


def read_bv_workbook(workbook_path):
    return read_tidy_workbook(workbook_path, BV_REQUIRED_COLS)


def process_bv_workbook(workbook_path):
    """
    Verwerk de BV workbook naar dezelfde tidy vorm als voorheen:
    NIS_code, Rapportjaar, Boekjaar, BV_domein, BV_subdomein, Beleidsveld, Totaal, Per_inwoner.

    Semantiek identiek aan de vroegere CSV-verwerking: per gemeente en cel (beleidsveld x boekjaar)
    wordt eerst over Niveau 8 gesommeerd, daarna vallen waarden <= 0 weg en pas daarna worden
    gemeentefusies (enkel rapportjaar 2026) samengevoegd.
    """
    print(f"\n{'='*60}")
    print(f"Verwerk BV workbook: {workbook_path.name}")
    print(f"{'='*60}")

    data = read_bv_workbook(workbook_path)
    data = data[data['NIS-code'].map(is_flemish)]

    cell_cols = ['NIS-code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']
    cells = (
        data.groupby(cell_cols, dropna=False)[['Uitgave', 'Uitgave per inwoner']]
        .sum(min_count=1)
        .reset_index()
    )

    cells['Totaal'] = cells['Uitgave'].where(cells['Uitgave'] > 0)
    cells['Per_inwoner'] = cells['Uitgave per inwoner'].where(cells['Uitgave per inwoner'] > 0)
    cells = cells[cells['Totaal'].notna() | cells['Per_inwoner'].notna()].copy()

    cells['NIS_code'] = [
        get_mapped_nis(nis_code, rapportjaar)
        for nis_code, rapportjaar in zip(cells['NIS-code'], cells['Rapportjaar'])
    ]

    out_cols = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']
    df = (
        cells.groupby(out_cols, dropna=False)[['Totaal', 'Per_inwoner']]
        .sum(min_count=1)
        .reset_index()
    )
    df = df[out_cols + ['Totaal', 'Per_inwoner']]

    print(f"Tidy vorm (alle boekjaren): {df.shape}")
    for rapportjaar, group in df.groupby('Rapportjaar'):
        print(
            f"  Rapportjaar {rapportjaar}: boekjaren {sorted(group['Boekjaar'].unique())}, "
            f"{group['NIS_code'].nunique()} gemeenten, totaal {group['Totaal'].sum():,.0f}"
        )

    return df

REK_WORKBOOK = 'MJP REK 2026 MVA v september.xlsx'
REK_REQUIRED_COLS = [
    'NIS-code',
    'Type rapport',
    'Rapportjaar',
    'Boekjaar',
    'Alg. rekening',
    'Uitgave',
    'Uitgave per inwoner',
]
REK_NIVEAU_1 = 'I Investeringsverrichtingen'
REK_NIVEAU_2 = 'I.1 Investeringsuitgaven'
REK_NIVEAU_3_SUBSIDIES = 'I.1.D Toegestane investeringssubsidies'
REK_NIVEAU_3_MATERIAL = 'I.1.B Investeringen in materiële vaste activa'


def rek_niveau_3(alg_rekening):
    """
    De export bevat enkel I.1.B.1 en I.1.D (zie README). Niveau 3 volgt uit de rekening:
    REK664 is de toegestane investeringssubsidie, alle andere REK22x en REK27x zijn materiële vaste activa.
    """
    code = str(alg_rekening).split(' ', 1)[0]
    if code == 'REK664':
        return REK_NIVEAU_3_SUBSIDIES
    if code.startswith(('REK22', 'REK27')):
        return REK_NIVEAU_3_MATERIAL
    raise ValueError(f"Onverwachte rekening in REK-export: {alg_rekening}")


def process_rek_workbook(workbook_path):
    """
    Verwerk de tidy REK-export naar dezelfde vorm als voorheen:
    NIS_code, Rapportjaar, Boekjaar, Niveau_1, Niveau_2, Niveau_3, Alg_rekening, Totaal, Per_inwoner.
    Waarden van 0 of lager vallen weg; gemeentefusies (enkel rapportjaar 2026) worden samengevoegd.
    """
    print(f"\n{'='*60}")
    print(f"Verwerk REK workbook: {workbook_path.name}")
    print(f"{'='*60}")

    data = read_tidy_workbook(workbook_path, REK_REQUIRED_COLS)
    data = data[data['NIS-code'].map(is_flemish)]

    data['Totaal'] = data['Uitgave'].where(data['Uitgave'] > 0)
    data['Per_inwoner'] = data['Uitgave per inwoner'].where(data['Uitgave per inwoner'] > 0)
    data = data[data['Totaal'].notna() | data['Per_inwoner'].notna()].copy()

    data['NIS_code'] = [
        get_mapped_nis(nis_code, rapportjaar)
        for nis_code, rapportjaar in zip(data['NIS-code'], data['Rapportjaar'])
    ]
    data['Alg_rekening'] = data['Alg. rekening'].astype(str).str.strip()

    out_cols = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'Alg_rekening']
    df = (
        data.groupby(out_cols, dropna=False)[['Totaal', 'Per_inwoner']]
        .sum(min_count=1)
        .reset_index()
    )
    df['Niveau_1'] = REK_NIVEAU_1
    df['Niveau_2'] = REK_NIVEAU_2
    df['Niveau_3'] = df['Alg_rekening'].map(rek_niveau_3)
    df = df[['NIS_code', 'Rapportjaar', 'Boekjaar', 'Niveau_1', 'Niveau_2', 'Niveau_3', 'Alg_rekening', 'Totaal', 'Per_inwoner']]

    print(f"Tidy vorm (alle boekjaren): {df.shape}")
    for rapportjaar, group in df.groupby('Rapportjaar'):
        print(
            f"  Rapportjaar {rapportjaar}: boekjaren {sorted(int(b) for b in group['Boekjaar'].unique())}, "
            f"{group['NIS_code'].nunique()} gemeenten, totaal {group['Totaal'].sum():,.0f}"
        )

    return df


def process_rek_file(file_path, rapportjaar):
    """
    Process een REK bestand (economische rekening).
    """
    print(f"\n{'='*60}")
    print(f"Verwerk REK bestand: {file_path.name}")
    print(f"Rapportjaar: {rapportjaar}")
    print(f"{'='*60}")

    # Lees metadata om NIS-code rij te vinden
    df_preview = pd.read_csv(file_path, sep=';', nrows=30, header=None)
    nis_row_idx = -1
    for i, row in df_preview.iterrows():
        if str(row[0]).strip() == 'NIS-code':
            nis_row_idx = i
            break
    
    if nis_row_idx == -1:
        # Fallback naar 11
        nis_row_idx = 11
        print(f"WAARSCHUWING: 'NIS-code' rij niet gevonden, gebruik fallback {nis_row_idx}")
    else:
        print(f"NIS-code rij gevonden op index {nis_row_idx}")

    df = pd.read_csv(file_path, sep=';', header=None)
    df = df.rename(columns={0: 'Index_col'})

    # Metadata rijen (0 tot nis_row_idx-1)
    metadata = {}
    for i in range(nis_row_idx):
        row_name = str(df.iloc[i, 0]).strip()
        if pd.notna(row_name) and row_name != 'nan':
            metadata[row_name] = df.iloc[i, 1:].tolist()

    # Data begint bij rij nis_row_idx+1
    df_data = df.iloc[nis_row_idx+1:].copy()
    nis_code_header = df.iloc[nis_row_idx, 1:].tolist()

    # Maak tidy data
    tidy_rows = []
    for gemeente_idx in range(len(df_data)):
        raw_nis = str(df_data.iloc[gemeente_idx, 0]).split('.')[0]
        if not raw_nis.isdigit(): continue
        
        # Filter Flanders and Map Mergers
        if not is_flemish(raw_nis): continue
        nis_code = get_mapped_nis(raw_nis, rapportjaar)

        for col_idx in range(1, len(df.columns)):
            value = df_data.iloc[gemeente_idx, col_idx]
            if pd.isna(value) or value == '': continue

            # Extract metadata for this column
            col_meta = {k: v[col_idx-1] for k, v in metadata.items() if (col_idx-1) < len(v)}
            value_type = nis_code_header[col_idx-1]

            # Converteer waarde
            value_str = str(value).replace('.', '').replace(',', '.')
            try:
                value_num = float(value_str)
            except:
                continue

            # Skip zero or negative values
            if value_num <= 0:
                continue

            # Filter for investments only in REK
            # Check if ANY Niveau field contains "Investering"
            is_investment = False
            for k, v in col_meta.items():
                if 'Niveau' in k and 'investering' in str(v).lower():
                    is_investment = True
                    break
            
            if not is_investment:
                continue

            tidy_rows.append({
                'NIS_code': nis_code,
                'Rapportjaar': int(rapportjaar),
                'Boekjaar': int(col_meta.get('Boekjaar', 0)),
                'Niveau_1': col_meta.get('Niveau 1'),
                'Niveau_2': col_meta.get('Niveau 2'),
                'Niveau_3': col_meta.get('Niveau 3'),
                'Alg_rekening': col_meta.get('Alg. rekening'),
                'Value_type': value_type,
                'Value': value_num
            })

    if not tidy_rows:
        print(f"WAARSCHUWING: Geen data gevonden voor {file_path.name}")
        return pd.DataFrame()

    df_tidy = pd.DataFrame(tidy_rows)
    # Aggregeer over NIS_code (ivm fusies)
    df_tidy = df_tidy.groupby(['NIS_code', 'Rapportjaar', 'Boekjaar', 'Niveau_1', 'Niveau_2', 'Niveau_3', 'Alg_rekening', 'Value_type'])['Value'].sum().reset_index()

    df_wide = df_tidy.pivot_table(
        index=['NIS_code', 'Rapportjaar', 'Boekjaar', 'Niveau_1', 'Niveau_2', 'Niveau_3', 'Alg_rekening'],
        columns='Value_type',
        values='Value',
        aggfunc='first'
    ).reset_index()

    if 'Uitgave' in df_wide.columns:
        df_wide = df_wide.rename(columns={'Uitgave': 'Totaal'})
    if 'Uitgave per inwoner' in df_wide.columns:
        df_wide = df_wide.rename(columns={'Uitgave per inwoner': 'Per_inwoner'})

    return df_wide


def main():
    """Verwerk alle REK en BV bestanden."""
    rek_files = [
        (resolve_input_path('mjp rek 2014.csv', 'MJP REK 2014.csv'), 2014),
        (resolve_input_path('mjp rek 2020.csv', 'MJP REK 2020.csv'), 2020),
        (resolve_input_path('mjp rek 2026.csv', 'MJP REK 2026.csv'), 2026),
    ]

    # Verwerk REK bestanden
    print("\n" + "="*60)
    print("VERWERK REK BESTANDEN (Economische rekening)")
    print("="*60)

    rek_dfs = []
    rek_workbook = DATA_DIR / REK_WORKBOOK
    if rek_workbook.exists():
        rek_dfs.append(process_rek_workbook(rek_workbook))
    else:
        for file_path, rapportjaar in rek_files:
            if file_path.exists():
                rek_dfs.append(process_rek_file(file_path, rapportjaar))
            else:
                print(f"WAARSCHUWING: Bestand niet gevonden: {file_path}")

    # Combineer alle REK data
    if rek_dfs:
        df_rek_combined = pd.concat(rek_dfs, ignore_index=True)
        print(f"\n{'='*60}")
        print(f"GECOMBINEERDE REK DATA")
        print(f"{'='*60}")
        print(f"Totale vorm: {df_rek_combined.shape}")
        print(f"Rapportjaren: {sorted(df_rek_combined['Rapportjaar'].unique())}")
        print(f"Boekjaren: {sorted(df_rek_combined['Boekjaar'].unique())}")
        print(f"Aantal gemeenten: {df_rek_combined['NIS_code'].nunique()}")

        # Optimaliseer datatypes
        df_rek_combined['Rapportjaar'] = df_rek_combined['Rapportjaar'].astype('int16')
        df_rek_combined['Boekjaar'] = df_rek_combined['Boekjaar'].astype('int16')

        # Sla op
        df_rek_combined.to_parquet(OUTPUT_REK, index=False, compression='snappy')
        shutil.copy2(OUTPUT_REK, PUBLIC_OUTPUT_REK)
        print(f"\nREK data opgeslagen naar: {OUTPUT_REK}")
        print(f"Bestandsgrootte: {OUTPUT_REK.stat().st_size / 1024 / 1024:.2f} MB")

    # Verwerk BV bestanden
    print("\n" + "="*60)
    print("VERWERK BV BESTANDEN (Beleidsdomein)")
    print("="*60)

    bv_dfs = []
    bv_workbook = DATA_DIR / BV_WORKBOOK
    if bv_workbook.exists():
        bv_dfs.append(process_bv_workbook(bv_workbook))
    else:
        print(f"WAARSCHUWING: Bestand niet gevonden: {bv_workbook}")

    # Combineer alle BV data
    if bv_dfs:
        df_bv_combined = pd.concat(bv_dfs, ignore_index=True)
        print(f"\n{'='*60}")
        print(f"GECOMBINEERDE BV DATA")
        print(f"{'='*60}")
        print(f"Totale vorm: {df_bv_combined.shape}")
        print(f"Rapportjaren: {sorted(df_bv_combined['Rapportjaar'].unique())}")
        print(f"Boekjaren: {sorted(df_bv_combined['Boekjaar'].unique())}")
        print(f"Aantal gemeenten: {df_bv_combined['NIS_code'].nunique()}")

        # Optimaliseer datatypes
        df_bv_combined['Rapportjaar'] = df_bv_combined['Rapportjaar'].astype('int16')
        df_bv_combined['Boekjaar'] = df_bv_combined['Boekjaar'].astype('int16')

        # Sla op
        df_bv_combined.to_parquet(OUTPUT_BV, index=False, compression='snappy')
        shutil.copy2(OUTPUT_BV, PUBLIC_OUTPUT_BV)
        print(f"\nBV data opgeslagen naar: {OUTPUT_BV}")
        print(f"Bestandsgrootte: {OUTPUT_BV.stat().st_size / 1024 / 1024:.2f} MB")

    print("\n" + "="*60)
    print("KLAAR!")
    print("="*60)


if __name__ == '__main__':
    main()
