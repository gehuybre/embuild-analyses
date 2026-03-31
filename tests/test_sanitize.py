import sys
sys.path.append('embuild-analyses/analyses/bouwprojecten-gemeenten/src')
from category_keywords import summarize_projects_by_category
import pandas as pd
import json
import numpy as _np

df = pd.read_parquet('embuild-analyses/analyses/bouwprojecten-gemeenten/results/projects_2026_full.parquet')
projects = df.to_dict(orient='records')
summaries = summarize_projects_by_category(projects, top_n=10)

print("BEFORE SANITIZE:")
print("Keys:", list(summaries['riolering'].keys()))
print("Total:", summaries['riolering']['total_amount'])

# Same sanitize_value as in process_project_details.py
def sanitize_value(val):
    """Recursively sanitize values for JSON serialization."""
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
    try:
        import pandas as _pd
        if isinstance(val, _pd.Timestamp):
            return str(val)
    except:
        pass
    return val

sanitized = sanitize_value(summaries['riolering'])

print("\nAFTER SANITIZE:")
print("Keys:", list(sanitized.keys()))
print("Total:", sanitized.get('total_amount'))
print("Largest projects count:", len(sanitized.get('largest_projects', [])))
