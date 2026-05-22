"""
Process municipal investment project details from meerjarenplan projecten.csv.

This script:
1. Parses the CSV file with multi-line text blocks
2. Extracts project details (Beleidsdoelstelling, Actieplan, Actie)
3. Classifies projects into contractor-relevant categories
4. Outputs chunked JSON files for web consumption
"""

import pandas as pd
import json
import re
import shutil
from numbers import Number
from pathlib import Path
from typing import Dict, List
from category_keywords import classify_project, classify_project_by_policy_domain, get_category_label, CATEGORY_DEFINITIONS, summarize_projects_by_category

# Directories
SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
REPO_ROOT = APP_DIR.parent.parent
DATA_DIR = APP_DIR / 'data'
PUBLIC_DATA_DIR = APP_DIR / 'public' / 'data'
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

# External data repo export is disabled in the monorepo setup.
DATA_REPO_DIR = APP_DIR / '_unused_data_repo'
DATA_REPO_AVAILABLE = False

# Input files
CURRENT_INPUT_CSV = DATA_DIR / 'data.csv'
HISTORICAL_INPUT_CSV = DATA_DIR / 'data-79.csv'
LATEST_INPUT_WORKBOOK = DATA_DIR / 'data-79.xlsx'
LEGACY_INPUT_CSV = DATA_DIR / 'data-54.csv'
INPUT_CSV_CANDIDATES = [
    CURRENT_INPUT_CSV,
    LEGACY_INPUT_CSV,
    APP_DIR / 'data.csv',
    APP_DIR / 'data-54.csv',
]  # Primary data source with policy categorization
PARQUET_FULL = SCRIPT_DIR.parent / 'results' / 'projects_2026_full.parquet'
CATEGORY_TOP_PROJECTS_LIMIT = 20

CSV_OUTPUT_COLUMNS = [
    'Beleidsdoelst. totaaloverzicht',
    'Actieplan totaaloverzicht',
    'Actie totaaloverzicht',
    'NIS-code',
    'Bestuur',
    'Type rapport',
    'Rapportjaar',
    'Boekjaar',
    'Beleidsdomein',
    'Beleidssubdomein',
    'Beleidsveld',
    'Niveau 4',
    'Economischesectorcode (subgroep)',
    'Uitgave',
]

WORKBOOK_COLUMN_MAPPING = {
    'Beleidsdoelst. totaaloverzicht': 'Beleidsdoelst. totaaloverzicht',
    'Actieplan totaaloverzicht': 'Actieplan totaaloverzicht',
    'Actie totaaloverzicht': 'Actie totaaloverzicht',
    'NIS-code': 'NIS-code',
    'Type rapport': 'Type rapport',
    'Rapportjaar': 'Rapportjaar',
    'Boekjaar': 'Boekjaar',
    'Uitgave': 'Uitgave',
}

POLICY_COLUMNS = [
    'Beleidsdomein',
    'Beleidssubdomein',
    'Beleidsveld',
    'Niveau 4',
    'Economischesectorcode (subgroep)',
]

NIS_MERGERS_LOOKUP = {
    '11007': '11002',  # Borsbeek -> Antwerpen
    '23023': '23106', '23024': '23106', '23032': '23106',  # Pajottegem
    '37012': '37021', '37018': '37021',  # Wingene
    '37007': '37022', '37015': '37022',  # Tielt
    '44012': '44086', '44048': '44086',  # Nazareth-De Pinte
    '44034': '44087', '44073': '44087',  # Lochristi
    '46014': '46029', '44045': '46029',  # Lokeren
    '44040': '44088', '44043': '44088',  # Merelbeke-Melle
    '46003': '46030', '46013': '46030', '11056': '46030',  # Beveren-Kruibeke-Zwijndrecht
    '73006': '73110', '73032': '73110',  # Bilzen-Hoeselt
    '73009': '73111', '73083': '73111',  # Tongeren-Borgloon
    '71069': '71071', '71057': '71071',  # Tessenderlo-Ham
    '71022': '71072', '73040': '71072',  # Hasselt
}

NEW_MUNI_NAMES = {
    '23106': 'Pajottegem',
    '37021': 'Wingene',
    '37022': 'Tielt',
    '44086': 'Nazareth-De Pinte',
    '44087': 'Lochristi',
    '44088': 'Merelbeke-Melle',
    '46029': 'Lokeren',
    '46030': 'Beveren-Kruibeke-Zwijndrecht',
    '71071': 'Tessenderlo-Ham',
    '71072': 'Hasselt',
    '73110': 'Bilzen-Hoeselt',
    '73111': 'Tongeren-Borgloon',
}


def _safe_parent(path: Path, level: int):
    """Return parent at `level` if available, else None."""
    return path.parents[level] if len(path.parents) > level else None


def get_input_csv_path():
    """Return the first available input CSV path."""
    for candidate in INPUT_CSV_CANDIDATES:
        if candidate.exists():
            return candidate
    return INPUT_CSV_CANDIDATES[0]


def format_csv_number(value):
    """Format workbook numeric values for the Dutch CSV parser."""
    if pd.isna(value) or value == '':
        return ''
    if isinstance(value, Number):
        number = f'{float(value):.15g}'
        if '.' not in number:
            number = f'{number}.0'
        return number.replace('.', ',')
    return str(value)


def extract_code_from_text(text_block):
    """Extract a Code field from a BBC-DR multiline text block."""
    if pd.isna(text_block):
        return ''
    code_match = re.search(r'Code:\s*([^\r\n]+)', str(text_block))
    return code_match.group(1).strip() if code_match else ''


def build_legacy_policy_lookups():
    """Build policy-domain lookups from the previous CSV export when available."""
    if not LEGACY_INPUT_CSV.exists():
        return {}, {}

    legacy_df = pd.read_csv(LEGACY_INPUT_CSV, sep=';', quotechar='"', encoding='utf-8', dtype=str)
    legacy_df['NIS-code'] = legacy_df['NIS-code'].astype(str).str.split('.').str[0].str.strip()
    legacy_df['_actie_code'] = legacy_df['Actie totaaloverzicht'].map(extract_code_from_text)

    by_nis_action = {}
    by_action = {}

    for _, row in legacy_df.iterrows():
        action_code = row.get('_actie_code', '')
        if not action_code:
            continue

        policy = {col: row.get(col, '') if pd.notna(row.get(col, '')) else '' for col in POLICY_COLUMNS}
        nis_code = row.get('NIS-code', '')
        by_nis_action.setdefault((nis_code, action_code), policy)

        current = by_action.get(action_code)
        if current is None or not current.get('Beleidsdomein'):
            by_action[action_code] = policy

    return by_nis_action, by_action


def convert_project_workbook_to_csv(workbook_path: Path, csv_path: Path, nis_to_name: Dict[str, str]):
    """Convert the current project workbook export to the historical CSV schema."""
    print(f"Converting project workbook to CSV: {workbook_path.name} -> {csv_path.name}")

    raw = pd.read_excel(workbook_path, sheet_name=0, header=None)
    header_idx = -1
    for i, row in raw.iterrows():
        if str(row.iloc[0]).strip() == 'NIS-code':
            header_idx = i
            break

    if header_idx == -1:
        raise ValueError(f"'NIS-code' header row not found in {workbook_path}")

    headers = [str(value).strip() for value in raw.iloc[header_idx].tolist()]
    data = raw.iloc[header_idx + 1:].copy()
    data.columns = headers

    missing_cols = [source for source in WORKBOOK_COLUMN_MAPPING.values() if source not in data.columns]
    if missing_cols:
        raise ValueError(f"Missing columns in {workbook_path.name}: {missing_cols}")

    policy_by_nis_action, policy_by_action = build_legacy_policy_lookups()
    converted = pd.DataFrame()

    for output_col, source_col in WORKBOOK_COLUMN_MAPPING.items():
        converted[output_col] = data[source_col]

    converted['NIS-code'] = converted['NIS-code'].astype(str).str.split('.').str[0].str.strip()
    converted = converted[converted['NIS-code'].str.isdigit()].copy()
    converted['Bestuur'] = converted['NIS-code'].map(
        lambda nis_code: f"Gemeente en OCMW {nis_to_name.get(nis_code, nis_code)}"
    )

    for col in POLICY_COLUMNS:
        converted[col] = ''

    policy_matched = 0
    for idx, row in converted.iterrows():
        action_code = extract_code_from_text(row.get('Actie totaaloverzicht', ''))
        policy = (
            policy_by_nis_action.get((row['NIS-code'], action_code))
            or policy_by_action.get(action_code)
        )
        if not policy:
            continue

        policy_matched += 1
        for col in POLICY_COLUMNS:
            converted.at[idx, col] = policy.get(col, '')

    converted['Uitgave'] = converted['Uitgave'].map(format_csv_number)
    converted = converted[CSV_OUTPUT_COLUMNS]

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    converted.to_csv(csv_path, sep=';', quotechar='"', index=False)
    print(
        f"CSV written to {csv_path} "
        f"({len(converted)} rows, policy matched for {policy_matched}/{len(converted)} rows)"
    )


def ensure_current_project_csv(nis_to_name: Dict[str, str]):
    """Generate historical and canonical CSV files from the latest workbook when needed."""
    if not LATEST_INPUT_WORKBOOK.exists():
        return

    source_mtime = max(LATEST_INPUT_WORKBOOK.stat().st_mtime, Path(__file__).stat().st_mtime)
    needs_historical = not HISTORICAL_INPUT_CSV.exists() or HISTORICAL_INPUT_CSV.stat().st_mtime < source_mtime
    needs_current = not CURRENT_INPUT_CSV.exists() or CURRENT_INPUT_CSV.stat().st_mtime < source_mtime

    if needs_historical:
        convert_project_workbook_to_csv(LATEST_INPUT_WORKBOOK, HISTORICAL_INPUT_CSV, nis_to_name)

    if needs_current:
        if not HISTORICAL_INPUT_CSV.exists():
            convert_project_workbook_to_csv(LATEST_INPUT_WORKBOOK, HISTORICAL_INPUT_CSV, nis_to_name)
        shutil.copy2(HISTORICAL_INPUT_CSV, CURRENT_INPUT_CSV)
        print(f"Current project CSV updated: {CURRENT_INPUT_CSV}")


def _try_parse_float(value):
    """Best-effort float parser for JSON values."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        return float(value)
    except Exception:
        try:
            return float(str(value).replace(',', '.'))
        except Exception:
            return None


def clean_text_value(value):
    """Return a stripped string, treating NaN as empty."""
    if value is None:
        return ''
    try:
        if pd.isna(value):
            return ''
    except Exception:
        pass
    return str(value).strip()


def _median(values: List[float]):
    """Compute median for a non-empty numeric list."""
    sorted_values = sorted(values)
    n = len(sorted_values)
    mid = n // 2
    if n % 2 == 1:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def _find_investments_data_dir():
    """Find a directory containing bv_municipality_data_chunk_*.json files."""
    p4 = _safe_parent(SCRIPT_DIR, 4)
    p5 = _safe_parent(SCRIPT_DIR, 5)
    candidates = [
        REPO_ROOT / 'apps' / 'gemeentelijke-investeringen' / 'public' / 'data',
        REPO_ROOT / 'apps' / 'gemeentelijke-investeringen' / 'results',
        (p4 / 'apps' / 'gemeentelijke-investeringen' / 'public' / 'data') if p4 else None,
        (p5 / 'apps' / 'gemeentelijke-investeringen' / 'public' / 'data') if p5 else None,
        Path.cwd() / 'apps' / 'gemeentelijke-investeringen' / 'public' / 'data',
    ]

    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.exists() and list(candidate.glob('bv_municipality_data_chunk_*.json')):
            return candidate

    return None


def load_population_lookup():
    """
    Build a NIS -> population lookup from gemeentelijke-investeringen data.

    Population is inferred as Totaal / Per_inwoner and aggregated with a median
    to reduce the impact of outliers.
    """
    investments_dir = _find_investments_data_dir()
    if not investments_dir:
        print("Warning: Could not find gemeentelijke-investeringen chunk data for per-capita calculation")
        return {}

    chunk_files = sorted(investments_dir.glob('bv_municipality_data_chunk_*.json'))
    print(f"Loading population lookup from {len(chunk_files)} municipal investment chunks in {investments_dir}")

    ratios_2026: Dict[str, List[float]] = {}
    ratios_all_years: Dict[str, List[float]] = {}
    outlier_count = 0

    for chunk_file in chunk_files:
        with open(chunk_file, 'r', encoding='utf-8') as f:
            rows = json.load(f)

        for row in rows:
            nis_raw = row.get('NIS_code')
            nis_code = str(nis_raw).strip() if nis_raw is not None else ''
            if not nis_code:
                continue

            total = _try_parse_float(row.get('Totaal'))
            per_inwoner = _try_parse_float(row.get('Per_inwoner'))
            if not total or not per_inwoner or total <= 0 or per_inwoner <= 0:
                continue

            inferred_population = total / per_inwoner
            # Drop clearly implausible ratios to avoid known parse outliers.
            if inferred_population < 1000 or inferred_population > 2_000_000:
                outlier_count += 1
                continue

            ratios_all_years.setdefault(nis_code, []).append(inferred_population)

            rapportjaar = row.get('Rapportjaar')
            if rapportjaar == 2026 or str(rapportjaar) == '2026':
                ratios_2026.setdefault(nis_code, []).append(inferred_population)

    population_lookup = {}
    nis_codes = set(ratios_all_years.keys()) | set(ratios_2026.keys())
    for nis_code in nis_codes:
        values = ratios_2026.get(nis_code) or ratios_all_years.get(nis_code, [])
        if not values:
            continue
        population_lookup[nis_code] = _median(values)

    print(
        f"Built population lookup for {len(population_lookup)} municipalities "
        f"(filtered {outlier_count} outlier rows)"
    )
    return population_lookup


def apply_per_capita(projects, population_lookup):
    """Populate per-capita values on project records using NIS-level population lookup."""
    if not projects:
        return projects

    missing_population = 0
    updated = 0

    for project in projects:
        nis_code = str(project.get('nis_code', '')).strip()
        population = population_lookup.get(nis_code)

        yearly_amounts = project.get('yearly_amounts') or {}
        yearly_per_capita = {}

        if population and population > 0:
            total_amount = _try_parse_float(project.get('total_amount')) or 0
            project['amount_per_capita'] = round(total_amount / population, 2) if total_amount > 0 else 0

            for year, amount in yearly_amounts.items():
                amount_value = _try_parse_float(amount) or 0
                yearly_per_capita[str(year)] = round(amount_value / population, 2) if amount_value > 0 else 0

            updated += 1
        else:
            missing_population += 1
            project['amount_per_capita'] = 0
            for year in yearly_amounts.keys():
                yearly_per_capita[str(year)] = 0

        # Ensure complete 2026-2031 range for UI compatibility
        for year in range(2026, 2032):
            yearly_per_capita.setdefault(str(year), 0)

        project['yearly_per_capita'] = yearly_per_capita

    print(
        f"Per-capita values updated for {updated}/{len(projects)} projects; "
        f"{missing_population} without population lookup"
    )
    return projects


def load_input_dataframe():
    """Load data from the preferred source.

    Priority:
      1) Current CSV input (`data/data.csv`) with policy mapping where available
      2) Legacy CSV input (`data/data-54.csv`) when no current CSV is present
      3) Parquet full snapshot (`results/projects_2026_full.parquet`) if present and appears to be processed

    Returns:
      - If parquet contains processed project records (has 'ac_short' and 'total_amount'), returns (True, list_of_project_dicts)
      - Otherwise returns (False, pandas.DataFrame) for raw CSV to be processed
    """
    # Prefer CSV because it preserves the beleidsdomein-based classification used by the UI.
    input_csv = get_input_csv_path()
    if input_csv.exists():
        print(f"Loading CSV input: {input_csv}")
        df = pd.read_csv(input_csv, sep=';', quotechar='"', encoding='utf-8')
        print(f"Loaded {len(df)} records from CSV")
        return False, df

    # Fall back to a processed parquet snapshot when the raw CSV is unavailable.
    if PARQUET_FULL.exists():
        print(f"Found parquet snapshot: {PARQUET_FULL}. Loading as processed projects...")
        try:
            df_parquet = pd.read_parquet(PARQUET_FULL)
            if 'ac_short' in df_parquet.columns and 'total_amount' in df_parquet.columns:
                projects = df_parquet.to_dict(orient='records')
                print(f"Loaded {len(projects)} processed projects from parquet.")
                return True, projects
            print("Parquet file found but doesn't contain processed project columns.")
        except Exception as e:
            print(f"Failed to read parquet snapshot ({e})")

    checked_paths = ", ".join(str(path) for path in INPUT_CSV_CANDIDATES)
    raise FileNotFoundError(f"No input file found. Checked parquet: {PARQUET_FULL} and csv: {checked_paths}")

# NIS code lookup for municipality names
SHARED_DATA_DIR = REPO_ROOT / 'packages' / 'embuild-shared' / 'src' / 'data'
NIS_FILE = SHARED_DATA_DIR / 'nis' / 'refnis.csv'


def _is_current_flemish_municipality(code: str) -> bool:
    """Filter to current Flemish municipalities only."""
    first = code[:1]
    first_two = code[:2]

    if first in {'5', '6', '8', '9'}:
        return False
    if first_two == '21':
        return False
    if first == '2' and first_two not in {'23', '24'}:
        return False
    return True


def load_nis_lookups():
    """Load NIS municipality lookups plus the full current municipality list."""
    nis_df = pd.read_csv(NIS_FILE, encoding='utf-8')

    # Start from active municipalities only to avoid historic/deelgemeente noise.
    municipalities = nis_df[
        (nis_df['LVL_REFNIS'] == 4) &
        (nis_df['DT_VLDT_END'] == '31/12/9999')
    ].copy()

    # Create lookup dictionaries for the current Flemish municipality set.
    name_to_nis = {}  # municipality name -> NIS code
    nis_to_name = {}  # NIS code -> municipality name
    all_municipalities = {}  # current municipality code -> name

    for _, row in municipalities.iterrows():
        nis_code = str(row['CD_REFNIS'])
        if not _is_current_flemish_municipality(nis_code):
            continue

        name = row['TX_REFNIS_NL'].strip()
        if '(' in name:
            name = name.split('(')[0].strip()

        # Replace merged-source municipalities by their post-2025 target.
        if nis_code in NIS_MERGERS_LOOKUP and nis_code != NIS_MERGERS_LOOKUP[nis_code]:
            continue

        name_to_nis[name] = nis_code
        nis_to_name[nis_code] = name
        all_municipalities[nis_code] = name

    # Inject merger targets that are present in the source data but not yet in refnis.csv.
    for nis_code, name in NEW_MUNI_NAMES.items():
        name_to_nis[name] = nis_code
        nis_to_name[nis_code] = name
        all_municipalities[nis_code] = name

    all_municipalities = dict(sorted(all_municipalities.items(), key=lambda item: item[1]))
    return name_to_nis, nis_to_name, all_municipalities


def load_policy_domain_data():
    """
    Load policy domain data from the current project CSV.

    Creates a lookup mapping (municipality_name, actie_code) to policy domain.
    This allows assigning categories based on actual policy domains instead of keywords.

    Returns:
        dict mapping (municipality_name, actie_code) -> (beleidsdomein, beleidssubdomein) tuple
        or municipality_name -> list of (beleidsdomein, beleidssubdomein) tuples if no code match
    """
    policy_file = get_input_csv_path()

    if not policy_file.exists():
        print(f"Warning: Policy domain file not found at {policy_file}")
        return {}

    print(f"Loading policy domain data from {policy_file}")
    policy_df = pd.read_csv(policy_file, sep=';', encoding='utf-8')

    # Create lookup: (municipality, policy_domain) mappings
    policy_lookup = {}

    for _, row in policy_df.iterrows():
        municipality = clean_text_value(row.get('Bestuur', ''))
        beleidsdomein = clean_text_value(row.get('Beleidsdomein', ''))
        beleidssubdomein = clean_text_value(row.get('Beleidssubdomein', ''))

        if not municipality or not beleidsdomein:
            continue

        # Store by municipality
        if municipality not in policy_lookup:
            policy_lookup[municipality] = []

        # Add unique policy domain/subdomain pair
        pair = (beleidsdomein, beleidssubdomein)
        if pair not in policy_lookup[municipality]:
            policy_lookup[municipality].append(pair)

    print(f"Loaded policy data for {len(policy_lookup)} municipalities")
    return policy_lookup


def extract_code_description(text_block):
    """
    Extract code and descriptions from a multi-line text block.

    Expected format:
    "Code: XXX
    Korte omschrijving: Short text
    Lange omschrijving: Long text
    Commentaar: Optional comment
    Evaluatie: Optional evaluation"

    Returns:
        dict with keys: code, short, long, comment, evaluation
    """
    if pd.isna(text_block) or not text_block.strip():
        return {}

    result = {}

    # Extract the full code line. Source files use separators like `/`, `_`, and `-`,
    # so stopping at the first non-alphanumeric character collapses distinct actions.
    code_match = re.search(r'Code:\s*([^\r\n]+)', text_block)
    if code_match:
        result['code'] = code_match.group(1)

    # Extract korte omschrijving
    short_match = re.search(r'Korte omschrijving:\s*(.+?)(?:\n|$)', text_block, re.DOTALL)
    if short_match:
        short_text = short_match.group(1).strip()
        # Extract until next section or newline
        short_text = re.split(r'\n(?=Lange omschrijving:|Commentaar:|Evaluatie:)', short_text)[0].strip()
        result['short'] = short_text

    # Extract lange omschrijving
    long_match = re.search(r'Lange omschrijving:\s*(.+?)(?=\nCommentaar:|\nEvaluatie:|$)', text_block, re.DOTALL)
    if long_match:
        result['long'] = long_match.group(1).strip()

    # Extract commentaar (optional)
    comment_match = re.search(r'Commentaar:\s*(.+?)(?=\nEvaluatie:|$)', text_block, re.DOTALL)
    if comment_match:
        comment_text = comment_match.group(1).strip()
        if comment_text:
            result['comment'] = comment_text

    # Extract evaluatie (optional)
    eval_match = re.search(r'Evaluatie:\s*(.+?)$', text_block, re.DOTALL)
    if eval_match:
        eval_text = eval_match.group(1).strip()
        if eval_text:
            result['evaluation'] = eval_text

    return result


def parse_csv():
    """Parse the CSV file with multi-line text blocks."""
    print("\n" + "="*60)
    print("PARSING MEERJARENPLAN PROJECTEN CSV")
    print("="*60)

    # Read CSV with proper handling of quoted multi-line fields
    df = pd.read_csv(get_input_csv_path(), sep=';', quotechar='"', encoding='utf-8')

    print(f"Loaded {len(df)} records from CSV")
    print(f"Columns: {list(df.columns)}")

    return df


def parse_dutch_number(value):
    """Parse Dutch-formatted number (dots as thousands separator)."""
    if pd.isna(value):
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove dots (thousand separators) and handle potential commas
    amount_str = str(value).strip().replace('.', '').replace(',', '.')
    try:
        return float(amount_str)
    except:
        return 0


def process_projects(df, nis_lookups, policy_lookup=None):
    """Process project CSV data into structured project records.

    The CSV contains individual investment line items, with policy categorization
    when it can be supplied by the source or inferred from a previous export.
    Projects are aggregated by municipality + action code.

    Args:
        df: Input dataframe
        nis_lookups: Tuple of (name_to_nis, nis_to_name) dictionaries
        policy_lookup: Not used when data-54.csv has inline policy data
    """
    print("\n" + "="*60)
    print("PROCESSING PROJECTS FROM CURRENT CSV")
    print("="*60)

    name_to_nis, nis_to_name = nis_lookups[:2]
    projects_map = {}  # Group by municipality + action code
    skipped_no_municipality = 0
    skipped_no_nis = 0
    skipped_no_policy = 0
    policy_classified = 0
    fallback_classified = 0

    for idx, row in df.iterrows():
        if idx % 5000 == 0:
            print(f"Processing record {idx}/{len(df)}...")

        # Get NIS code directly from the project CSV.
        nis_code = row.get('NIS-code')
        if pd.isna(nis_code):
            skipped_no_nis += 1
            continue
        nis_code = str(int(nis_code))

        # Get municipality name from NIS code (correct, authoritative source)
        municipality_name = nis_to_name.get(nis_code)
        if not municipality_name:
            skipped_no_municipality += 1
            continue

        # Extract policy domain if present; new rows can fall back to keyword classification.
        beleidsdomein = clean_text_value(row.get('Beleidsdomein', ''))
        beleidssubdomein = clean_text_value(row.get('Beleidssubdomein', ''))

        # Extract policy domain and action plan details
        bd_data = extract_code_description(row.get('Beleidsdoelst. totaaloverzicht', ''))
        ap_data = extract_code_description(row.get('Actieplan totaaloverzicht', ''))
        ac_data = extract_code_description(row.get('Actie totaaloverzicht', ''))

        if not ac_data.get('short'):
            continue

        # Parse amount
        amount = parse_dutch_number(row.get('Uitgave', 0))
        if amount <= 0:
            continue

        # Get fiscal year
        fiscal_year = str(row.get('Boekjaar', 2026))

        # Create project key: municipality + action code
        ac_code = ac_data.get('code', '')
        project_key = f"{municipality_name}|{ac_code}"

        # Classify using policy domain (preferred method)
        if beleidsdomein:
            categories = classify_project_by_policy_domain(beleidsdomein, beleidssubdomein)
            policy_classified += 1
        else:
            categories = classify_project(ac_data.get('short', ''), ac_data.get('long', ''))
            skipped_no_policy += 1
            fallback_classified += 1

        # Initialize or update project
        if project_key not in projects_map:
            projects_map[project_key] = {
                "municipality": municipality_name,
                "nis_code": nis_code,
                "bd_code": bd_data.get('code', ''),
                "bd_short": bd_data.get('short', ''),
                "bd_long": bd_data.get('long', ''),
                "ap_code": ap_data.get('code', ''),
                "ap_short": ap_data.get('short', ''),
                "ap_long": ap_data.get('long', ''),
                "ac_code": ac_code,
                "ac_short": ac_data.get('short', ''),
                "ac_long": ac_data.get('long', ''),
                "categories": categories,
                "total_amount": 0,
                "amount_per_capita": 0,
                "yearly_amounts": {str(y): 0 for y in range(2026, 2032)},
                "yearly_per_capita": {str(y): 0 for y in range(2026, 2032)}
            }

        # Accumulate amount
        projects_map[project_key]["total_amount"] += amount
        projects_map[project_key]["yearly_amounts"][fiscal_year] = \
            projects_map[project_key]["yearly_amounts"].get(fiscal_year, 0) + amount

    # Convert to list and calculate per-capita
    projects = []
    for project_data in projects_map.values():
        # Round amounts
        project_data["total_amount"] = round(project_data["total_amount"], 2)
        project_data["yearly_amounts"] = {
            str(k): round(v, 2) for k, v in project_data["yearly_amounts"].items()
        }
        # Per-capita fields are populated in a dedicated post-processing step.
        project_data["amount_per_capita"] = 0
        project_data["yearly_per_capita"] = {str(y): 0 for y in range(2026, 2032)}
        projects.append(project_data)

    print(f"\nProcessed {len(projects)} unique projects")
    print(f"  - Policy-based classification: {policy_classified}")
    print(f"  - Fallback classification without policy domain: {fallback_classified}")
    print(f"Skipped: {skipped_no_municipality} (no municipality), {skipped_no_nis} (no NIS), {skipped_no_policy} rows without policy domain")

    return projects


def sanitize_value(val):
    """Recursively sanitize values for JSON serialization."""
    import numpy as _np
    import pandas as _pd

    if val is None:
        return None
    if isinstance(val, dict):
        return {k: sanitize_value(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [sanitize_value(item) for item in val]
    if isinstance(val, (_np.integer, _np.floating)):
        return float(val)
    if isinstance(val, _np.ndarray):
        return val.tolist()
    if isinstance(val, _pd.Timestamp):
        return str(val)
    return val


def normalize_category_ids(raw_categories):
    """Normalize stored category values to a simple list of category ids."""
    normalized = sanitize_value(raw_categories)
    if normalized is None:
        return ['overige']
    if isinstance(normalized, str):
        categories = [normalized.strip()] if normalized.strip() else []
        return categories or ['overige']
    if not isinstance(normalized, list):
        normalized = [normalized]

    categories = []
    for category in normalized:
        if category is None:
            continue
        text = str(category).strip()
        if not text:
            continue
        categories.append(text)
    return categories or ['overige']


def sanitize_project(project):
    """Convert project records to JSON-serializable native Python values."""
    sanitized = sanitize_value(project)
    if isinstance(sanitized, dict):
        sanitized['categories'] = normalize_category_ids(sanitized.get('categories'))
    return sanitized


def write_json_output(relative_path: Path, payload):
    """Write JSON payload to the public data directory and the split data repo when available."""
    filepath = PUBLIC_DATA_DIR / relative_path
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    if DATA_REPO_AVAILABLE:
        repo_filepath = DATA_REPO_DIR / relative_path
        repo_filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(repo_filepath, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    return filepath


def clear_generated_json_directory(relative_dir: Path):
    """Remove stale JSON files from a generated subdirectory before re-exporting."""
    for base_dir in [PUBLIC_DATA_DIR, DATA_REPO_DIR if DATA_REPO_AVAILABLE else None]:
        if not base_dir:
            continue
        target_dir = base_dir / relative_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        for json_file in target_dir.glob('*.json'):
            json_file.unlink()


def export_municipality_files(projects_sorted, all_municipalities):
    """Write one JSON file per municipality plus a lightweight municipality index."""
    print("\nExporting municipality-level files...")

    clear_generated_json_directory(Path("municipality"))

    municipalities = {}
    for project in projects_sorted:
        municipalities.setdefault(project['nis_code'], []).append(project)

    for nis_code in all_municipalities:
        municipalities.setdefault(nis_code, [])

    municipality_index = []
    for nis_code, municipality_projects in sorted(
        municipalities.items(),
        key=lambda item: all_municipalities.get(item[0], item[0])
    ):
        municipality_projects = sorted(
            municipality_projects,
            key=lambda item: item['total_amount'],
            reverse=True,
        )
        municipality_name = all_municipalities.get(nis_code) or (
            municipality_projects[0]['municipality'] if municipality_projects else f"Gemeente {nis_code}"
        )
        relative_path = Path("municipality") / f"{nis_code}.json"
        write_json_output(relative_path, [sanitize_project(project) for project in municipality_projects])
        municipality_index.append({
            "nis_code": nis_code,
            "municipality": municipality_name,
            "file": relative_path.as_posix(),
            "project_count": len(municipality_projects),
            "total_amount": round(sum(project['total_amount'] for project in municipality_projects), 2),
        })

    write_json_output(Path("municipality_index.json"), municipality_index)
    print(f"  → municipality_index.json ({len(municipality_index)} municipalities)")


def export_category_files(projects_sorted, category_summaries):
    """Write one full JSON file per category and attach file references to metadata."""
    print("\nExporting category-level files...")

    clear_generated_json_directory(Path("category"))

    category_projects = {}
    for project in projects_sorted:
        for category_id in normalize_category_ids(project.get('categories')):
            category_projects.setdefault(category_id, []).append(project)

    for category_id, category_projects_list in category_projects.items():
        relative_path = Path("category") / f"{category_id}.json"
        write_json_output(relative_path, [sanitize_project(project) for project in category_projects_list])
        if category_id in category_summaries:
            category_summaries[category_id]['data_file'] = relative_path.as_posix()
        print(f"  → {relative_path.as_posix()} ({len(category_projects_list)} projects)")

    return category_summaries


def clear_generated_files(glob_pattern: str):
    """Remove stale generated files before writing a fresh set."""
    for base_dir in [PUBLIC_DATA_DIR, DATA_REPO_DIR if DATA_REPO_AVAILABLE else None]:
        if not base_dir:
            continue
        base_dir.mkdir(parents=True, exist_ok=True)
        for json_file in base_dir.glob(glob_pattern):
            json_file.unlink()


def chunk_and_save(projects, all_municipalities, chunk_size=2000):
    """Split projects into chunks and save as JSON files."""
    print("\n" + "="*60)
    print("CHUNKING AND SAVING DATA")
    print("="*60)

    # Sort projects by total amount (descending)
    projects_sorted = sorted(projects, key=lambda x: x['total_amount'], reverse=True)

    # Split into chunks
    chunks = [projects_sorted[i:i + chunk_size] for i in range(0, len(projects_sorted), chunk_size)]

    print(f"Creating {len(chunks)} chunks of ~{chunk_size} projects each")
    clear_generated_files('projects_2026_chunk_*.json')

    for i, chunk in enumerate(chunks):
        filename = f"projects_2026_chunk_{i}.json"
        # sanitize chunk contents for JSON
        sanitized_chunk = [sanitize_project(p) for p in chunk]

        # Write to public data directory
        filepath = write_json_output(Path(filename), sanitized_chunk)
        size_mb = filepath.stat().st_size / 1024 / 1024
        print(f"  → {filename} ({len(chunk)} projects, {size_mb:.2f} MB)")

    # Create metadata file
    total_amount = sum(p['total_amount'] for p in projects)
    municipalities_with_projects = len(set(p['nis_code'] for p in projects))

    # Summarize projects by category (counts, sums, largest projects)
    category_summaries = summarize_projects_by_category(projects, top_n=CATEGORY_TOP_PROJECTS_LIMIT)
    category_summaries = export_category_files(projects_sorted, category_summaries)
    export_municipality_files(projects_sorted, all_municipalities)

    # Normalize numeric types for JSON compatibility
    total_amount_native = float(total_amount)
    metadata = {
        "total_projects": int(len(projects)),
        "total_amount": round(total_amount_native, 2),
        "municipalities": int(len(all_municipalities)),
        "municipalities_with_projects": int(municipalities_with_projects),
        "chunks": len(chunks),
        "chunk_size": chunk_size,
        "category_top_projects_limit": CATEGORY_TOP_PROJECTS_LIMIT,
        "categories": category_summaries
    }

    for cat_id, cat in metadata['categories'].items():
        metadata['categories'][cat_id] = sanitize_value(cat)

    # Print a more informative category breakdown
    print(f"\nCategory breakdown (top {CATEGORY_TOP_PROJECTS_LIMIT} largest projects shown per category):")
    for cat_id, cat_data in sorted(metadata['categories'].items(), key=lambda x: x[1]['project_count'], reverse=True):
        print(f"  {cat_data['label']}: {cat_data['project_count']} projects, total €{cat_data['total_amount']:,.0f}")

    write_json_output(Path("projects_metadata.json"), metadata)

    print(f"\n  → projects_metadata.json")
    print(f"\nMetadata:")
    print(f"  Total projects: {metadata['total_projects']}")
    print(f"  Total amount: €{metadata['total_amount']:,.0f}")
    print(f"  Municipalities: {metadata['municipalities']}")
    print(f"  Chunks: {metadata['chunks']}")
    print(f"\nCategory breakdown:")
    for cat_id, cat_data in sorted(metadata['categories'].items(), key=lambda x: x[1]['project_count'], reverse=True):
        print(f"  {cat_data['label']}: {cat_data['project_count']} projects")

    # Report export locations
    print(f"\nExport locations:")
    print(f"  ✓ Local: {PUBLIC_DATA_DIR}")
    if DATA_REPO_AVAILABLE:
        print(f"  ✓ Data repo: {DATA_REPO_DIR}")
    else:
        print("  i Data repo not available (is the data repo cloned locally?)")


def main():
    """Main processing pipeline."""
    print("\n" + "="*60)
    print("MUNICIPAL INVESTMENT PROJECT DETAILS PROCESSOR")
    print("="*60)

    # Load NIS lookups
    print("\nLoading NIS municipality lookups...")
    nis_lookups = load_nis_lookups()
    print(f"Loaded {len(nis_lookups[2])} current municipalities")

    ensure_current_project_csv(nis_lookups[1])

    # Load policy domain data
    print("\nLoading policy domain data...")
    policy_lookup = load_policy_domain_data()

    # Load input: prefer parquet snapshot when available
    is_processed, data = load_input_dataframe()

    if is_processed:
        # Parquet snapshot already contains processed project dicts
        projects = data
    else:
        # Raw CSV dataframe - run full processing
        df = data
        projects = process_projects(df, nis_lookups, policy_lookup)

    # Ensure per-capita values are populated from inferred municipality populations.
    population_lookup = load_population_lookup()
    projects = apply_per_capita(projects, population_lookup)

    # Chunk and save (will write updated metadata including per-category summaries)
    chunk_and_save(projects, nis_lookups[2])

    print("\n" + "="*60)
    print("KLAAR!")
    print("="*60)


if __name__ == "__main__":
    main()
