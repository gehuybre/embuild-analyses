import importlib.util, glob, json, re
from collections import Counter
from pathlib import Path

spec=importlib.util.spec_from_file_location('ck','embuild-analyses/analyses/bouwprojecten-gemeenten/src/category_keywords.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

projects=[]
for f in glob.glob('embuild-analyses/public/data/bouwprojecten-gemeenten/projects_*.json'):
    data=json.loads(Path(f).read_text())
    for item in data:
        if isinstance(item, dict): projects.append(item)

remaining=[]
for p in projects:
    new = m.classify_project(p.get('ac_short',''), p.get('ac_long',''))
    if new == ['overige']:
        remaining.append(p)

print('remaining overige count:', len(remaining))

stop = set(['voor','onze','zijn','wordt','worden','waar','iedereen','alle','kunnen','maken','zodat','meer','minder','jaar','jaren','beleid','beleid-','beleid.','project','projecten','projectmatig','projectontwikkeling','gemeente','gemeenten','gemeentelijke','gemeentebestuur','lokale','lokaal','bestuur','daar','dit','dat','wordt','deze'])
existing_keywords = set(k for cat in m.CATEGORY_DEFINITIONS.values() for k in cat['keywords'])

c = Counter()
bi = Counter()
for p in remaining:
    txt=' '.join([p.get('ac_short','') or '', p.get('ac_long','') or '', p.get('bd_short','') or '', p.get('bd_long','') or '']).lower()
    toks = re.findall(r"[a-zà-ÿ]{4,}", txt)
    toks = [t for t in toks if t not in stop]
    for t in toks:
        if t not in existing_keywords:
            c[t]+=1
    for i in range(len(toks)-1):
        b=toks[i]+' '+toks[i+1]
        if all(part not in existing_keywords for part in b.split()):
            bi[b]+=1

# print top tokens
print('\nTop tokens (filtered, top 60):')
for t,n in c.most_common(60):
    print(t, n)

print('\nTop bigrams (top 40):')
for t,n in bi.most_common(40):
    print(t, n)

# candidate keywords (freq threshold)
cands = [t for t,n in c.most_common(300) if n>=150]
print('\nCandidates (count>=150):')
print(cands)

# save results
out = Path('tmp/overige_inspect.json')
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({'count':len(remaining),'tokens':c.most_common(300),'bigrams':bi.most_common(300),'candidates':cands}, ensure_ascii=False, indent=2))
print('\nWrote results to', out)
