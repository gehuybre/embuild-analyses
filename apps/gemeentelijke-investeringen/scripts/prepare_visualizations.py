"""
Script to prepare visualization data from processed parquet files.

Creates aggregated JSON files for the dashboard:
- BV section: Aggregated by BV_domein, BV_subdomein, Beleidsveld
- REK section: Aggregated by Niveau_3, Alg_rekening
"""

import pandas as pd
import json
import numpy as np
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from zipfile import ZipFile

APP_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_DIR.parents[1]
NIS_FILE = REPO_ROOT / 'packages' / 'embuild-shared' / 'src' / 'data' / 'nis' / 'refnis.csv'
PUBLIC_DATA_DIR = APP_DIR / 'public' / 'data'
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR = PUBLIC_DATA_DIR

RESULTS_INTERNAL_DIR = APP_DIR / 'results'
RESULTS_INTERNAL_DIR.mkdir(parents=True, exist_ok=True)
INPUT_BV = RESULTS_INTERNAL_DIR / 'investments_bv.parquet'
INPUT_REK = RESULTS_INTERNAL_DIR / 'investments_rek.parquet'
FALLBACK_INPUT_BV = PUBLIC_DATA_DIR / 'investments_bv.parquet'
FALLBACK_INPUT_REK = PUBLIC_DATA_DIR / 'investments_rek.parquet'
INPUT_CPI = APP_DIR / 'data' / 'CPI All base years.txt'
CPI_SOURCE_URL = 'https://statbel.fgov.be/sites/default/files/files/opendata/Consumptieprijsindex%20en%20gezondheidsindex/CPI%20All%20base%20years.zip'

CPI_BASE_YEAR = 2025
CPI_REFERENCE_PERIOD = (2026, 2)
CPI_INDEX_PERIODS = {
    2014: (2017, 1),
    2020: (2023, 1),
}
CPI_MONTH_NAMES_NL = {
    1: 'januari',
    2: 'februari',
    3: 'maart',
    4: 'april',
    5: 'mei',
    6: 'juni',
    7: 'juli',
    8: 'augustus',
    9: 'september',
    10: 'oktober',
    11: 'november',
    12: 'december',
}

class NumpyEncoder(json.JSONEncoder):
    """JSON encoder for numpy types."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            # Check for NaN and Inf before converting to float
            if np.isnan(obj) or np.isinf(obj):
                return None
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if pd.isna(obj):
            return None
        return super().default(obj)

def save_json(data, filename, chunk_size=None):
    """Save data as JSON with NaN handling and optional chunking."""
    output_path = RESULTS_DIR / filename
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Replace NaN values with None before saving
    def replace_nan(obj):
        if isinstance(obj, dict):
            return {k: replace_nan(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [replace_nan(item) for item in obj]
        elif isinstance(obj, (float, np.floating)):
            if np.isnan(obj) or np.isinf(obj):
                return None
            return obj
        elif pd.isna(obj):
            return None
        else:
            return obj

    data_clean = replace_nan(data)

    if chunk_size and isinstance(data_clean, list):
        chunks = [data_clean[i:i + chunk_size] for i in range(0, len(data_clean), chunk_size)]
        for i, chunk in enumerate(chunks):
            chunk_filename = f"{filename.replace('.json', '')}_chunk_{i}.json"
            chunk_path = RESULTS_DIR / chunk_filename
            chunk_path.parent.mkdir(parents=True, exist_ok=True)
            with open(chunk_path, 'w', encoding='utf-8') as f:
                json.dump(chunk, f, cls=NumpyEncoder, ensure_ascii=False)
        return len(chunks)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data_clean, f, cls=NumpyEncoder, ensure_ascii=False, indent=2)

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"  → {filename} ({size_mb:.2f} MB)")
    return 1

def format_month_label(year, month):
    """Format a year/month pair as a Dutch month label."""
    return f"{CPI_MONTH_NAMES_NL[int(month)]} {int(year)}"

def ensure_cpi_file():
    """Download and extract the CPI source file when it is not available locally."""
    if INPUT_CPI.exists():
        return

    print(f"Downloading CPI data from {CPI_SOURCE_URL}")
    INPUT_CPI.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_file:
        temp_zip = Path(temp_file.name)

    try:
        subprocess.run(
            ['curl', '-fsSL', CPI_SOURCE_URL, '-o', str(temp_zip)],
            check=True,
        )

        with ZipFile(temp_zip) as archive:
            member_name = next(
                (name for name in archive.namelist() if name.endswith('CPI All base years.txt')),
                None
            )
            if member_name is None:
                raise FileNotFoundError('CPI All base years.txt not found in Statbel archive')
            INPUT_CPI.write_bytes(archive.read(member_name))
    finally:
        if temp_zip.exists():
            temp_zip.unlink()

def load_cpi_lookup():
    """Load CPI values keyed by (year, month) using the 2025 base-year series."""
    ensure_cpi_file()
    cpi_df = pd.read_csv(INPUT_CPI, sep='|', encoding='utf-8-sig')
    cpi_series = (
        cpi_df[cpi_df['NM_BASE_YR'] == CPI_BASE_YEAR][['NM_YR', 'NM_MTH', 'MS_CPI_IDX']]
        .rename(columns={'NM_YR': 'Year', 'NM_MTH': 'Month', 'MS_CPI_IDX': 'CPI'})
        .copy()
    )

    cpi_series['Year'] = cpi_series['Year'].astype(int)
    cpi_series['Month'] = cpi_series['Month'].astype(int)
    cpi_series['CPI'] = cpi_series['CPI'].astype(float)

    return {
        (int(row.Year), int(row.Month)): float(row.CPI)
        for row in cpi_series.itertuples(index=False)
    }

def build_bv_indexation_metadata():
    """Build CPI-based indexation factors for the BV totals section."""
    cpi_lookup = load_cpi_lookup()
    reference_year, reference_month = CPI_REFERENCE_PERIOD
    reference_cpi = cpi_lookup[(reference_year, reference_month)]

    factors = {2026: 1.0}
    periods = {}

    for rapportjaar, (source_year, source_month) in CPI_INDEX_PERIODS.items():
        source_cpi = cpi_lookup[(source_year, source_month)]
        factor = reference_cpi / source_cpi
        factors[rapportjaar] = factor
        periods[str(rapportjaar)] = {
            'source_period': f'{source_year}-{source_month:02d}',
            'source_label': format_month_label(source_year, source_month),
            'source_cpi': round(source_cpi, 2),
            'reference_period': f'{reference_year}-{reference_month:02d}',
            'reference_label': format_month_label(reference_year, reference_month),
            'reference_cpi': round(reference_cpi, 2),
            'factor': factor,
        }

    periods['2026'] = {
        'source_period': f'{reference_year}-{reference_month:02d}',
        'source_label': format_month_label(reference_year, reference_month),
        'source_cpi': round(reference_cpi, 2),
        'reference_period': f'{reference_year}-{reference_month:02d}',
        'reference_label': format_month_label(reference_year, reference_month),
        'reference_cpi': round(reference_cpi, 2),
        'factor': 1.0,
    }

    metadata = {
        'source': 'Statbel CPI All base years',
        'source_file': INPUT_CPI.name,
        'source_url': CPI_SOURCE_URL,
        'cpi_base_year': CPI_BASE_YEAR,
        'price_level_period': f'{reference_year}-{reference_month:02d}',
        'price_level_label': format_month_label(reference_year, reference_month),
        'reference_cpi': round(reference_cpi, 2),
        'midpoint_note': (
            'Omdat elke legislatuur zes jaar telt en dus geen unieke middenmaand heeft, '
            'gebruiken we de eerste maand na het halfwegpunt: januari 2017 voor 2014-2019 '
            'en januari 2023 voor 2020-2025.'
        ),
        'periods': periods,
    }
    return metadata, factors

def apply_rapportjaar_indexation(df, factors, value_cols=('Totaal', 'Per_inwoner')):
    """Apply CPI factors per rapportjaar to numeric value columns."""
    indexed_df = df.copy()
    indexed_df['Indexatiefactor'] = indexed_df['Rapportjaar'].map(factors).fillna(1.0)

    for col in value_cols:
        indexed_df[col] = indexed_df[col] * indexed_df['Indexatiefactor']

    return indexed_df

# NIS 2025 Fusions mapping (Sources -> Target)
NIS_MERGERS_LOOKUP = {
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

NEW_MUNI_NAMES = {
    "23106": "Pajottegem",
    "37021": "Wingene",
    "37022": "Tielt",
    "44086": "Nazareth-De Pinte",
    "44087": "Lochristi",
    "46029": "Lokeren",
    "44088": "Merelbeke-Melle",
    "46030": "Beveren-Kruibeke-Zwijndrecht",
    "73110": "Bilzen-Hoeselt",
    "73111": "Tongeren-Borgloon",
    "71071": "Tessenderlo-Ham",
    "71072": "Hasselt"
}

TOP_FIELDS = [
    '0200 Wegen',
    '0119 Overige algemene diensten',
    '0310 Beheer van regen- en afvalwater',
    '0953 Woon- en zorgcentra',
    '0610 Gebiedsontwikkeling',
    '0800 Gewoon basisonderwijs',
    '0742 Sportinfrastructuur',
    '0740 Sportsector- en verenigingsondersteuning',
    '0410 Brandweer',
]


def resolve_parquet_path(primary: Path, fallback: Path) -> Path:
    if primary.exists():
        return primary
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f'Missing parquet input: {primary} (fallback: {fallback})')

def slugify_label(label):
    """Create a stable ASCII filename slug for derived data files."""
    normalized = unicodedata.normalize('NFKD', str(label)).encode('ascii', 'ignore').decode('ascii')
    slug = re.sub(r'[^a-z0-9]+', '-', normalized.lower()).strip('-')
    return slug or 'item'

def load_nis_lookups(allowed_codes=None):
    """Load NIS municipality lookups for municipalities present in the dataset."""
    nis_df = pd.read_csv(NIS_FILE, encoding='utf-8')
    allowed_codes_set = set(str(code) for code in allowed_codes) if allowed_codes is not None else None
    
    # Filter for current/recent Flemish municipalities
    # Flanders NIS codes start with 1, 2, 3, 4, or 7
    municipalities = nis_df[
        (nis_df['LVL_REFNIS'] == 4) &
        (nis_df['CD_REFNIS'].astype(str).str[0].isin(['1', '2', '3', '4', '7']))
    ].copy()

    # Create lookup dictionary
    nis_lookup = {}
    for _, row in municipalities.iterrows():
        nis_code = str(row['CD_REFNIS'])
        # Skip source municipalities that are defunct in 2025
        if nis_code in NIS_MERGERS_LOOKUP and nis_code != NIS_MERGERS_LOOKUP[nis_code]:
            continue
            
        name = row['TX_REFNIS_NL'].strip()
        # Handle bilingual names (e.g., "Bruxelles / Brussel" or "Ronse / Renaix")
        if '/' in name:
            # For NL version, we usually want the second part if it's Brussels, 
            # but for Flemish facilities it's the first part.
            # However, looking at refnis.csv, TX_REFNIS_NL for Ronse is "Ronse (Renaix)" or "Ronse / Renaix"?
            # Actually, most Flemish towns have only the Dutch name in TX_REFNIS_NL.
            # Let's take the first part as a safe default for Dutch.
            name = name.split('/')[0].strip()
        
        if '(' in name:
            name = name.split('(')[0].strip()
        nis_lookup[nis_code] = name

    # Inject new merger targets
    for code, name in NEW_MUNI_NAMES.items():
        nis_lookup[code] = name

    if allowed_codes_set is not None:
        nis_lookup = {
            code: name
            for code, name in nis_lookup.items()
            if code in allowed_codes_set
        }

    # Final sort
    return dict(sorted(nis_lookup.items(), key=lambda x: x[1]))

def aggregate_by_rapportjaar(df, group_cols, value_cols=['Totaal', 'Per_inwoner']):
    """
    Aggregate data by rapportjaar (sum over 6-year legislatuur periods).

    Legislatuurperiodes:
    - 2014: 2014-2019 (6 jaar)
    - 2020: 2020-2025 (6 jaar)
    - 2026: 2026-2031 (6 jaar)
    """
    # Define legislatuur periods (6 years each)
    legislatuur_periods = {
        2014: (2014, 2019),
        2020: (2020, 2025),
        2026: (2026, 2031),
    }

    # Filter data to only include years within legislatuur periods
    filtered_rows = []
    for rapportjaar, (start_year, end_year) in legislatuur_periods.items():
        df_period = df[
            (df['Rapportjaar'] == rapportjaar) &
            (df['Boekjaar'] >= start_year) &
            (df['Boekjaar'] <= end_year)
        ]
        filtered_rows.append(df_period)

    df_filtered = pd.concat(filtered_rows, ignore_index=True) if filtered_rows else df

    # Aggregate by rapportjaar
    grouped = df_filtered.groupby(['NIS_code', 'Rapportjaar'] + group_cols, dropna=False)[value_cols].sum().reset_index()
    return grouped

def normalize_merged_nis_codes(df):
    """Normalize municipality codes to post-2025 merger targets."""
    normalized = df.copy()
    normalized['NIS_code'] = normalized['NIS_code'].astype(str).replace(NIS_MERGERS_LOOKUP)
    return normalized

def build_rek_category_top_summary(df, metric):
    """
    Build top-9 + other summaries for the REK category breakdown.

    Municipality scope uses the municipality value directly.
    Vlaanderen scope mirrors the client semantics:
    - Totaal: sum across municipalities
    - Per_inwoner: average across municipalities per category
    """
    rows = []

    for (nis_code, rapportjaar), group in df.groupby(['NIS_code', 'Rapportjaar'], sort=True):
        ranked = group.sort_values(metric, ascending=False)
        top = ranked.head(9)

        for _, row in top.iterrows():
            rows.append({
                'scope': 'municipality',
                'scope_code': str(nis_code),
                'Rapportjaar': int(rapportjaar),
                'Alg_rekening': row['Alg_rekening'],
                'value': row[metric],
            })

        other = ranked.iloc[9:]
        if not other.empty:
            rows.append({
                'scope': 'municipality',
                'scope_code': str(nis_code),
                'Rapportjaar': int(rapportjaar),
                'Alg_rekening': 'Overige',
                'value': other[metric].sum(),
            })

    if metric == 'Totaal':
        all_scope = (
            df.groupby(['Rapportjaar', 'Alg_rekening'], dropna=False)[[metric]]
            .sum()
            .reset_index()
        )
    else:
        all_scope = (
            df.groupby(['Rapportjaar', 'Alg_rekening'], dropna=False)[[metric]]
            .mean()
            .reset_index()
        )

    for rapportjaar, group in all_scope.groupby('Rapportjaar', sort=True):
        ranked = group.sort_values(metric, ascending=False)
        top = ranked.head(9)

        for _, row in top.iterrows():
            rows.append({
                'scope': 'all',
                'scope_code': '__all__',
                'Rapportjaar': int(rapportjaar),
                'Alg_rekening': row['Alg_rekening'],
                'value': row[metric],
            })

        other = ranked.iloc[9:]
        if not other.empty:
            rows.append({
                'scope': 'all',
                'scope_code': '__all__',
                'Rapportjaar': int(rapportjaar),
                'Alg_rekening': 'Overige',
                'value': other[metric].sum(),
            })

    return rows

def prepare_bv_data():
    """Prepare BV (beleidsdomein) visualization data."""
    print("\n" + "="*60)
    print("PREPARE BV VISUALIZATION DATA")
    print("="*60)

    # Load data
    df = pd.read_parquet(resolve_parquet_path(INPUT_BV, FALLBACK_INPUT_BV))
    print(f"Loaded {len(df)} records")

    # Aggregate per rapportjaar
    df_agg = aggregate_by_rapportjaar(df, ['BV_domein', 'BV_subdomein', 'Beleidsveld'])
    print(f"Aggregated to {len(df_agg)} records (per rapportjaar)")

    # Create lookups with unique values
    domains = df_agg[['BV_domein']].drop_duplicates().sort_values('BV_domein').reset_index(drop=True)
    subdomeins = df_agg[['BV_domein', 'BV_subdomein']].drop_duplicates().sort_values(['BV_domein', 'BV_subdomein']).reset_index(drop=True)
    beleidsvelds = df_agg[['BV_subdomein', 'Beleidsveld']].drop_duplicates().sort_values(['BV_subdomein', 'Beleidsveld']).reset_index(drop=True)

    normalized_codes = normalize_merged_nis_codes(df_agg)['NIS_code'].astype(str).unique().tolist()

    lookups = {
        'domains': domains.to_dict('records'),
        'subdomeins': subdomeins.to_dict('records'),
        'beleidsvelds': beleidsvelds.to_dict('records'),
        'municipalities': load_nis_lookups(normalized_codes),
    }

    print(f"Lookups: {len(domains)} domains, {len(subdomeins)} subdomeins, {len(beleidsvelds)} beleidsvelds")

    # Municipality data (all records)
    muni_data = df_agg.to_dict('records')
    normalized_df_agg = normalize_merged_nis_codes(df_agg)

    # Domain-level municipality summary for lightweight client charts/maps/tables
    domain_summary_df = (
        normalized_df_agg
        .groupby(['NIS_code', 'Rapportjaar', 'BV_domein'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['NIS_code', 'Rapportjaar', 'BV_domein'])
    )

    top_fields_summary_df = (
        normalized_df_agg.assign(
            Beleidsveld=lambda frame: frame['Beleidsveld'].where(frame['Beleidsveld'].isin(TOP_FIELDS), 'Overige')
        )
        .groupby(['NIS_code', 'Rapportjaar', 'Beleidsveld'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['NIS_code', 'Rapportjaar', 'Beleidsveld'])
    )

    domain_all_summary_df = (
        domain_summary_df
        .groupby(['Rapportjaar', 'BV_domein'], dropna=False)[['Totaal', 'Per_inwoner']]
        .agg({'Totaal': 'sum', 'Per_inwoner': 'mean'})
        .reset_index()
    )

    total_summary_df = (
        domain_summary_df
        .groupby(['NIS_code', 'Rapportjaar'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .groupby(['Rapportjaar'], dropna=False)[['Totaal', 'Per_inwoner']]
        .agg({'Totaal': 'sum', 'Per_inwoner': 'mean'})
        .reset_index()
    )
    total_summary_df['BV_domein'] = '__all__'

    domain_all_summary = (
        pd.concat([domain_all_summary_df, total_summary_df], ignore_index=True)
        .sort_values(['Rapportjaar', 'BV_domein'])
        .to_dict('records')
    )

    domain_summary = domain_summary_df.to_dict('records')
    domain_summary_by_municipality = {
        nis_code: group.to_dict('records')
        for nis_code, group in domain_summary_df.groupby('NIS_code', sort=True)
    }

    municipality_totals_df = (
        domain_summary_df
        .groupby(['NIS_code', 'Rapportjaar'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['NIS_code', 'Rapportjaar'])
    )

    indexation_metadata, indexation_factors = build_bv_indexation_metadata()
    indexed_municipality_totals_df = (
        apply_rapportjaar_indexation(municipality_totals_df, indexation_factors)
        .drop(columns=['Indexatiefactor'])
        .sort_values(['NIS_code', 'Rapportjaar'])
        .reset_index(drop=True)
    )

    indexed_vlaanderen_totals_df = (
        indexed_municipality_totals_df
        .groupby(['Rapportjaar'], dropna=False)[['Totaal', 'Per_inwoner']]
        .agg({'Totaal': 'sum', 'Per_inwoner': 'mean'})
        .reset_index()
        .sort_values(['Rapportjaar'])
    )

    # Vlaanderen totals (sum across all municipalities)
    vlaanderen_totals = df_agg.groupby(['Rapportjaar', 'BV_domein', 'BV_subdomein', 'Beleidsveld'], dropna=False)[['Totaal', 'Per_inwoner']].sum().reset_index()
    vlaanderen_data = vlaanderen_totals.to_dict('records')

    return {
        'lookups': lookups,
        'domain_all_summary': domain_all_summary,
        'municipality_data': muni_data,
        'domain_summary': domain_summary,
        'domain_summary_by_municipality': domain_summary_by_municipality,
        'top_fields_summary': top_fields_summary_df.to_dict('records'),
        'indexed_municipality_totals': indexed_municipality_totals_df.to_dict('records'),
        'indexed_vlaanderen_totals': indexed_vlaanderen_totals_df.to_dict('records'),
        'indexation_metadata': indexation_metadata,
        'vlaanderen_data': vlaanderen_data,
    }

def prepare_rek_data():
    """Prepare REK (economische rekening) visualization data."""
    print("\n" + "="*60)
    print("PREPARE REK VISUALIZATION DATA")
    print("="*60)

    # Load data
    df = pd.read_parquet(resolve_parquet_path(INPUT_REK, FALLBACK_INPUT_REK))
    print(f"Loaded {len(df)} records")

    # Aggregate per rapportjaar
    df_agg = aggregate_by_rapportjaar(df, ['Niveau_3', 'Alg_rekening'])
    print(f"Aggregated to {len(df_agg)} records (per rapportjaar)")

    # Create lookups
    niveau3s = df_agg[['Niveau_3']].drop_duplicates().sort_values('Niveau_3').reset_index(drop=True)
    alg_rekenings = df_agg[['Niveau_3', 'Alg_rekening']].drop_duplicates().sort_values(['Niveau_3', 'Alg_rekening']).reset_index(drop=True)

    normalized_codes = normalize_merged_nis_codes(df_agg)['NIS_code'].astype(str).unique().tolist()

    lookups = {
        'niveau3s': niveau3s.to_dict('records'),
        'alg_rekenings': alg_rekenings.to_dict('records'),
        'municipalities': load_nis_lookups(normalized_codes),
    }

    print(f"Lookups: {len(niveau3s)} niveau3s, {len(alg_rekenings)} alg_rekenings")

    # Municipality data
    muni_data = df_agg.to_dict('records')
    normalized_df_agg = normalize_merged_nis_codes(df_agg)

    all_summary_df = (
        normalized_df_agg
        .groupby(['NIS_code', 'Rapportjaar'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['NIS_code', 'Rapportjaar'])
    )

    niveau3_summary_df = (
        normalized_df_agg
        .groupby(['NIS_code', 'Rapportjaar', 'Niveau_3'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['NIS_code', 'Rapportjaar', 'Niveau_3'])
    )

    niveau3_detail_df = (
        normalized_df_agg
        .groupby(['NIS_code', 'Rapportjaar', 'Niveau_3', 'Alg_rekening'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
        .sort_values(['Niveau_3', 'NIS_code', 'Rapportjaar', 'Alg_rekening'])
    )

    niveau3_details = {}
    for niveau3, group in niveau3_detail_df.groupby('Niveau_3', sort=True):
        niveau3_details[slugify_label(niveau3)] = group[
            ['NIS_code', 'Rapportjaar', 'Alg_rekening', 'Totaal', 'Per_inwoner']
        ].to_dict('records')

    category_source_df = (
        normalized_df_agg
        .groupby(['NIS_code', 'Rapportjaar', 'Alg_rekening'], dropna=False)[['Totaal', 'Per_inwoner']]
        .sum()
        .reset_index()
    )

    # Vlaanderen totals
    vlaanderen_totals = df_agg.groupby(['Rapportjaar', 'Niveau_3', 'Alg_rekening'], dropna=False)[['Totaal', 'Per_inwoner']].sum().reset_index()
    vlaanderen_data = vlaanderen_totals.to_dict('records')

    return {
        'lookups': lookups,
        'municipality_data': muni_data,
        'all_summary': all_summary_df.to_dict('records'),
        'niveau3_summary': niveau3_summary_df.to_dict('records'),
        'niveau3_details': niveau3_details,
        'category_top_totaal': build_rek_category_top_summary(category_source_df, 'Totaal'),
        'category_top_per_inwoner': build_rek_category_top_summary(category_source_df, 'Per_inwoner'),
        'vlaanderen_data': vlaanderen_data,
    }

def main():
    """Generate all visualization data files."""
    chunk_size = 5000

    # Prepare BV data
    bv_results = prepare_bv_data()
    save_json(bv_results['lookups'], 'bv_lookups.json')
    # Also save lookups to internal results dir for nisUtils.ts imports
    save_json(bv_results['lookups'], RESULTS_INTERNAL_DIR / 'bv_lookups.json')
    
    bv_chunks = save_json(bv_results['municipality_data'], 'bv_municipality_data.json', chunk_size=chunk_size)
    save_json(bv_results['domain_all_summary'], 'bv_domain_all_summary.json')
    save_json(bv_results['domain_summary'], 'bv_domain_municipality_summary.json')
    save_json(bv_results['top_fields_summary'], 'bv_top_fields_summary.json')
    for nis_code, records in bv_results['domain_summary_by_municipality'].items():
        save_json(records, Path('bv_domain_municipality') / f'{nis_code}.json')
    save_json(bv_results['vlaanderen_data'], 'bv_vlaanderen_data.json')
    save_json(bv_results['indexed_municipality_totals'], 'bv_indexed_municipality_totals.json')
    save_json(bv_results['indexed_municipality_totals'], RESULTS_INTERNAL_DIR / 'bv_indexed_municipality_totals.json')
    save_json(bv_results['indexed_vlaanderen_totals'], 'bv_indexed_vlaanderen_totals.json')
    save_json(bv_results['indexed_vlaanderen_totals'], RESULTS_INTERNAL_DIR / 'bv_indexed_vlaanderen_totals.json')
    save_json(bv_results['indexation_metadata'], 'bv_indexation_metadata.json')
    save_json(bv_results['indexation_metadata'], RESULTS_INTERNAL_DIR / 'bv_indexation_metadata.json')

    # Prepare REK data
    rek_results = prepare_rek_data()
    save_json(rek_results['lookups'], 'rek_lookups.json')
    # Also save lookups to internal results dir for nisUtils.ts imports
    save_json(rek_results['lookups'], RESULTS_INTERNAL_DIR / 'rek_lookups.json')

    rek_chunks = save_json(rek_results['municipality_data'], 'rek_municipality_data.json', chunk_size=chunk_size)
    save_json(rek_results['all_summary'], 'rek_all_summary.json')
    save_json(rek_results['niveau3_summary'], 'rek_niveau3_summary.json')
    for niveau3_slug, records in rek_results['niveau3_details'].items():
        save_json(records, Path('rek_niveau3') / f'{niveau3_slug}.json')
    save_json(rek_results['category_top_totaal'], 'rek_category_top_totaal.json')
    save_json(rek_results['category_top_per_inwoner'], 'rek_category_top_per_inwoner.json')
    save_json(rek_results['vlaanderen_data'], 'rek_vlaanderen_data.json')

    # Create metadata
    df_bv = pd.read_parquet(resolve_parquet_path(INPUT_BV, FALLBACK_INPUT_BV))
    # df_rek = pd.read_parquet(INPUT_REK)

    metadata = {
        'rapportjaren': sorted(df_bv['Rapportjaar'].unique().tolist()),
        'total_municipalities': int(df_bv['NIS_code'].nunique()),
        'bv_domains': len(bv_results['lookups']['domains']),
        'bv_subdomeins': len(bv_results['lookups']['subdomeins']),
        'bv_beleidsvelds': len(bv_results['lookups']['beleidsvelds']),
        'rek_niveau3s': len(rek_results['lookups']['niveau3s']),
        'rek_alg_rekenings': len(rek_results['lookups']['alg_rekenings']),
        'bv_chunks': bv_chunks,
        'rek_chunks': rek_chunks,
        'chunk_size': chunk_size,
        'bv_index_price_level_period': bv_results['indexation_metadata']['price_level_period'],
        'bv_index_price_level_label': bv_results['indexation_metadata']['price_level_label'],
        'bv_index_cpi_base_year': bv_results['indexation_metadata']['cpi_base_year'],
    }
    save_json(metadata, 'metadata.json')

    print("\n" + "="*60)
    print("KLAAR!")
    print("="*60)
    print(f"\nMetadata:")
    print(f"  Rapportjaren: {metadata['rapportjaren']}")
    print(f"  Gemeenten: {metadata['total_municipalities']}")
    print(f"  BV domeinen: {metadata['bv_domains']}")
    print(f"  BV subdomeinen: {metadata['bv_subdomeins']}")
    print(f"  BV beleidsvelds: {metadata['bv_beleidsvelds']}")
    print(f"  REK niveau 3: {metadata['rek_niveau3s']}")
    print(f"  REK alg. rekenings: {metadata['rek_alg_rekenings']}")

if __name__ == '__main__':
    main()
