"""
Script to process municipal investment data from multi-year plans.

Processes two types of files:
- REK files: Investeringen gegroepeerd per economische rekening (alg. rekening, niveau 3)
- BV files: Investeringen gegroepeerd per beleidsdomein (BV_domein, BV_subdomein, beleidsveld)

Data structure:
- Rapportjaren: 2014, 2020, 2026 (legislatuur start jaren)
- Per rapportjaar: meerdere boekjaren (hele legislatuur)
- Beide totale uitgave EN uitgave per inwoner in hetzelfde bestand
- NIS-codes ipv gemeentenamen
"""
import pandas as pd
import shutil
from numbers import Number
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


def parse_numeric(value):
    """Parse values exactly like the original semicolon CSV pipeline."""
    if pd.isna(value) or value == '':
        return None

    value_str = str(value).strip().replace('.', '').replace(',', '.')
    if not value_str:
        return None

    try:
        return float(value_str)
    except ValueError:
        return None


def format_csv_number(value):
    """Format workbook numbers for the semicolon CSV parser."""
    if pd.isna(value) or value == '':
        return ''
    if isinstance(value, Number):
        number = f'{float(value):.15g}'
        if '.' not in number:
            number = f'{number}.0'
        return number.replace('.', ',')
    return str(value)


def convert_bv_workbook_to_wide_csv(workbook_path, csv_path):
    """
    Convert a tidy BV workbook export to the wide CSV format used by BBC-DR CSV exports.
    """
    print(f"Converteer BV workbook naar CSV: {workbook_path.name} -> {csv_path.name}")

    df = pd.read_excel(workbook_path, sheet_name=0, header=None)
    header_idx = -1
    for i, row in df.iterrows():
        if str(row.iloc[0]).strip() == 'NIS-code':
            header_idx = i
            break

    if header_idx == -1:
        raise ValueError(f"'NIS-code' header row not found in {workbook_path}")

    headers = [str(value).strip() for value in df.iloc[header_idx].tolist()]
    data = df.iloc[header_idx + 1:].copy()
    data.columns = headers

    required_cols = [
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
    missing_cols = [col for col in required_cols if col not in data.columns]
    if missing_cols:
        raise ValueError(f"Ontbrekende kolommen in {workbook_path.name}: {missing_cols}")

    data = data[required_cols].copy()
    data['NIS-code'] = data['NIS-code'].astype(str).str.split('.').str[0].str.strip()
    data = data[data['NIS-code'].str.isdigit()]

    meta_cols = ['Type rapport', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld']
    combinations = data[meta_cols].drop_duplicates()
    combination_records = combinations.to_dict('records')
    combination_keys = [tuple(record[col] for col in meta_cols) for record in combination_records]

    csv_rows = []
    for meta_col in meta_cols:
        row = [meta_col]
        for record in combination_records:
            row.extend([record[meta_col], record[meta_col]])
        csv_rows.append(row)

    value_types = []
    for _ in combination_records:
        value_types.extend(['Uitgave', 'Uitgave per inwoner'])
    csv_rows.append(['NIS-code'] + value_types)

    value_lookup = {}
    for _, source_row in data.iterrows():
        key = tuple(source_row[col] for col in meta_cols)
        nis_code = source_row['NIS-code']
        value_lookup[(nis_code, key, 'Uitgave')] = source_row['Uitgave']
        value_lookup[(nis_code, key, 'Uitgave per inwoner')] = source_row['Uitgave per inwoner']

    for nis_code in sorted(data['NIS-code'].unique()):
        out_row = [nis_code]
        for combo in combination_keys:
            out_row.append(format_csv_number(value_lookup.get((nis_code, combo, 'Uitgave'), '')))
            out_row.append(format_csv_number(value_lookup.get((nis_code, combo, 'Uitgave per inwoner'), '')))
        csv_rows.append(out_row)

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(csv_rows).to_csv(csv_path, sep=';', header=False, index=False)
    print(f"CSV opgeslagen naar: {csv_path}")


def ensure_converted_bv_workbook_csv(workbook_name, csv_name, current_csv_name=None):
    workbook_path = DATA_DIR / workbook_name
    csv_path = DATA_DIR / csv_name
    current_csv_path = DATA_DIR / current_csv_name if current_csv_name else None

    if not workbook_path.exists():
        return

    source_mtime = max(workbook_path.stat().st_mtime, Path(__file__).stat().st_mtime)
    needs_snapshot = not csv_path.exists() or csv_path.stat().st_mtime < source_mtime
    needs_current = current_csv_path is not None and (
        not current_csv_path.exists() or current_csv_path.stat().st_mtime < source_mtime
    )

    if needs_snapshot:
        convert_bv_workbook_to_wide_csv(workbook_path, csv_path)

    if needs_current:
        if not csv_path.exists():
            convert_bv_workbook_to_wide_csv(workbook_path, csv_path)
        shutil.copy2(csv_path, current_csv_path)
        print(f"Actuele BV CSV bijgewerkt: {current_csv_path}")

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


def process_bv_file(file_path, rapportjaar, chunk_size=200):
    """
    Process een BV bestand (beleidsdomein).
    """
    print(f"\n{'='*60}")
    print(f"Verwerk BV bestand: {file_path.name}")
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
        # Fallback naar oude detectie
        nis_row_idx = 5
        print(f"WAARSCHUWING: 'NIS-code' rij niet gevonden, gebruik fallback {nis_row_idx}")
    else:
        print(f"NIS-code rij gevonden op index {nis_row_idx}")

    df_header = pd.read_csv(file_path, sep=';', nrows=nis_row_idx, header=None)
    metadata = {}
    for i in range(nis_row_idx):
        row_name = str(df_header.iloc[i, 0]).strip()
        if pd.notna(row_name) and row_name != 'nan':
            metadata[row_name] = df_header.iloc[i, 1:].tolist()
    
    nis_code_header = pd.read_csv(file_path, sep=';', skiprows=nis_row_idx, nrows=1, header=None).iloc[0, 1:].tolist()

    # Required output columns
    required_cols = ['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld', 'Totaal', 'Per_inwoner']

    # Process data in chunks
    all_chunks = []
    chunk_num = 0

    for df_chunk in pd.read_csv(file_path, sep=';', skiprows=nis_row_idx+1, chunksize=chunk_size, header=None):
        chunk_num += 1
        tidy_rows = []
        for gemeente_idx in range(len(df_chunk)):
            raw_nis = str(df_chunk.iloc[gemeente_idx, 0]).split('.')[0]
            if not raw_nis.isdigit(): continue

            if not is_flemish(raw_nis): continue
            nis_code = get_mapped_nis(raw_nis, rapportjaar)

            for col_idx in range(1, len(df_chunk.columns)):
                value = df_chunk.iloc[gemeente_idx, col_idx]
                if pd.isna(value) or value == '': continue

                meta_idx = col_idx - 1
                
                # Verify meta_idx is within bounds
                if meta_idx >= len(nis_code_header): continue

                value_num = parse_numeric(value)
                if value_num is None:
                    continue
                
                # Filter out zero values to drastically reduce data size
                if value_num <= 0:
                    continue

                boekjaar = int(metadata.get('Boekjaar', [0]*len(df_chunk.columns))[meta_idx])
                bv_domein = str(metadata.get('BV_domein', [None]*len(df_chunk.columns))[meta_idx])
                bv_subdomein = str(metadata.get('BV_subdomein', [None]*len(df_chunk.columns))[meta_idx])
                beleidsveld = str(metadata.get('Beleidsveld', [None]*len(df_chunk.columns))[meta_idx])
                value_type = nis_code_header[meta_idx]

                tidy_rows.append({
                    'NIS_code': nis_code,
                    'Rapportjaar': int(rapportjaar),
                    'Boekjaar': boekjaar,
                    'BV_domein': bv_domein,
                    'BV_subdomein': bv_subdomein,
                    'Beleidsveld': beleidsveld if beleidsveld != 'nan' else None,
                    'Value_type': value_type,
                    'Value': value_num
                })

        if tidy_rows:
            df_tidy_chunk = pd.DataFrame(tidy_rows)
            # Aggregeer over NIS_code
            df_tidy_chunk = df_tidy_chunk.groupby(['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld', 'Value_type'])['Value'].sum().reset_index()
            
            df_wide_chunk = df_tidy_chunk.pivot_table(
                index=['NIS_code', 'Rapportjaar', 'Boekjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld'],
                columns='Value_type',
                values='Value',
                aggfunc='first',
                dropna=True
            ).reset_index()

            if 'Uitgave' in df_wide_chunk.columns:
                df_wide_chunk = df_wide_chunk.rename(columns={'Uitgave': 'Totaal'})
            if 'Uitgave per inwoner' in df_wide_chunk.columns:
                df_wide_chunk = df_wide_chunk.rename(columns={'Uitgave per inwoner': 'Per_inwoner'})
            
            all_chunks.append(df_wide_chunk)

    if not all_chunks:
        print(f"WAARSCHUWING: Geen data gevonden voor {file_path.name}")
        return pd.DataFrame(columns=required_cols)

    df_combined = pd.concat(all_chunks, ignore_index=True)
    
    # Ensure all required columns exist
    for col in required_cols:
        if col not in df_combined.columns:
            df_combined[col] = 0 if col in ['Totaal', 'Per_inwoner'] else None

    # Reorder
    df_combined = df_combined[required_cols]

    print(f"Tidy vorm (alle boekjaren): {df_combined.shape}")
    print(f"Boekjaren: {sorted(df_combined['Boekjaar'].unique())}")

    return df_combined


def main():
    """Verwerk alle REK en BV bestanden."""
    ensure_converted_bv_workbook_csv('MJP BV 2026-05.xlsx', 'MJP BV 2026-05 MVA.csv', 'MJP BV 2026 MVA.csv')

    rek_files = [
        (resolve_input_path('mjp rek 2014.csv', 'MJP REK 2014.csv'), 2014),
        (resolve_input_path('mjp rek 2020.csv', 'MJP REK 2020.csv'), 2020),
        (resolve_input_path('mjp rek 2026.csv', 'MJP REK 2026.csv'), 2026),
    ]

    bv_files = [
        (resolve_input_path('MJP BV 2014 MVA.csv', 'mjp 2014 bv.csv'), 2014),
        (resolve_input_path('MJP BV 2020 MVA.csv', 'mjp 2020 bv.csv'), 2020),
        (resolve_input_path('MJP BV 2026 MVA.csv', 'MJP BV 2026-05 MVA.csv', 'mjp bv 26.csv'), 2026),
    ]

    # Verwerk REK bestanden
    print("\n" + "="*60)
    print("VERWERK REK BESTANDEN (Economische rekening)")
    print("="*60)

    rek_dfs = []
    for file_path, rapportjaar in rek_files:
        if file_path.exists():
            df = process_rek_file(file_path, rapportjaar)
            rek_dfs.append(df)
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
    for file_path, rapportjaar in bv_files:
        if file_path.exists():
            df = process_bv_file(file_path, rapportjaar)
            bv_dfs.append(df)
        else:
            print(f"WAARSCHUWING: Bestand niet gevonden: {file_path}")

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
