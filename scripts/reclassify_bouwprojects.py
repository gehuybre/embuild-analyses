import json, glob, importlib.util
from pathlib import Path

mod_path = Path('embuild-analyses/analyses/bouwprojecten-gemeenten/src/category_keywords.py')
spec = importlib.util.spec_from_file_location('category_keywords', mod_path)
ck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ck)

files = sorted(glob.glob('embuild-analyses/public/data/bouwprojecten-gemeenten/projects_*.json'))
projects=[]
for f in files:
    projects += json.loads(Path(f).read_text())

orig_overige = sum(1 for p in projects if 'overige' in p.get('categories', []))
new_overige = sum(1 for p in projects if 'overige' in ck.classify_project(p.get('ac_short',''), p.get('ac_long','')))
changed = sum(1 for p in projects if set(ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))) != set(p.get('categories', [])))
print(json.dumps({
    'total_projects': len(projects),
    'orig_overige': orig_overige,
    'new_overige': new_overige,
    'changed': changed
}, ensure_ascii=False, indent=2))

# compute gains from previous overige

from collections import defaultdict

gains = defaultdict(int)
examples = {}
for p in projects:
    orig = p.get('categories', [])
    if 'overige' not in orig: continue
    new = ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))
    for c in new:
        if c == 'overige': continue
        gains[c] += 1
        if c not in examples:
            examples[c] = {'municipality': p.get('municipality'), 'ac_short': p.get('ac_short')}

print('\nTop gains (from overige):')
for k,v in sorted(gains.items(), key=lambda x:-x[1])[:10]:
    print(f'  {k}: {v} (example: {examples.get(k)})')

# Save sample of changed projects for inspection
sample = []
count = 0
for p in projects:
    orig = p.get('categories', [])
    new = ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))
    if set(orig) != set(new):
        sample.append({'municipality': p.get('municipality'), 'ac_short': p.get('ac_short'), 'orig': orig, 'new': new})
        count += 1
        if count >= 200:
            break

out_path = Path('tmp/reclassification_sample.json')
out_path.parent.mkdir(exist_ok=True)
out_path.write_text(json.dumps(sample, ensure_ascii=False, indent=2))
print('\nWrote', len(sample), 'changed projects to', out_path)
