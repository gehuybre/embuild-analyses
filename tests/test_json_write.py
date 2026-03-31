import sys
sys.path.append('embuild-analyses/analyses/bouwprojecten-gemeenten/src')
from category_keywords import summarize_projects_by_category
import pandas as pd
import json
from pathlib import Path

df = pd.read_parquet('embuild-analyses/analyses/bouwprojecten-gemeenten/results/projects_2026_full.parquet')
projects = df.to_dict(orient='records')
summaries = summarize_projects_by_category(projects, top_n=10)

# Write just riolering to a test file
test_file = Path('embuild-analyses/public/data/bouwprojecten-gemeenten/test_riolering.json')
with open(test_file, 'w') as f:
    json.dump(summaries['riolering'], f, indent=2)

print('Wrote test file')
print('Keys in memory:', list(summaries['riolering'].keys()))
print('Total in memory:', summaries['riolering']['total_amount'])

# Read it back
with open(test_file, 'r') as f:
    loaded = json.load(f)
print('Keys loaded back:', list(loaded.keys()))
print('Total loaded back:', loaded.get('total_amount'))
