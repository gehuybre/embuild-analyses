import json, glob, importlib.util
from pathlib import Path
from collections import defaultdict

mod_path = Path('embuild-analyses/analyses/bouwprojecten-gemeenten/src/category_keywords.py')
spec = importlib.util.spec_from_file_location('ck', mod_path)
ck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ck)

projects = []
for f in sorted(glob.glob('embuild-analyses/public/data/bouwprojecten-gemeenten/projects_*.json')):
    data = json.loads(Path(f).read_text())
    for item in data:
        if isinstance(item, dict):
            projects.append(item)

orig_overige = sum(1 for p in projects if 'overige' in p.get('categories', []))
new_overige = sum(1 for p in projects if 'overige' in ck.classify_project(p.get('ac_short',''), p.get('ac_long','')))
changed_count = sum(1 for p in projects if set(ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))) != set(p.get('categories', [])))

# gains

gains = defaultdict(int)
examples = {}
for p in projects:
    orig = p.get('categories', [])
    if 'overige' not in orig:
        continue
    new = ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))
    for c in new:
        if c == 'overige':
            continue
        gains[c] += 1
        if c not in examples:
            examples[c] = {'municipality': p.get('municipality'), 'ac_short': p.get('ac_short')}

# save results
out = Path('tmp/reclassify_results.json')
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({
    'total_projects': len(projects),
    'orig_overige': orig_overige,
    'new_overige': new_overige,
    'changed': changed_count,
    'gains': gains,
    'examples': examples
}, ensure_ascii=False, indent=2))

# save sample changed projects
sample = []
for p in projects:
    orig = p.get('categories', [])
    new = ck.classify_project(p.get('ac_short',''), p.get('ac_long',''))
    if set(orig) != set(new):
        sample.append({'municipality': p.get('municipality'), 'ac_short': p.get('ac_short'), 'orig': orig, 'new': new})
        if len(sample) >= 200:
            break
Path('tmp/reclassification_sample.json').write_text(json.dumps(sample, ensure_ascii=False, indent=2))
print('Wrote results to tmp/reclassify_results.json and tmp/reclassification_sample.json')
