# Offline Press Review

## Doel

Deze workflow laat je nieuwe persartikels lokaal beoordelen met Codex in VS Code, zonder LLM-calls in GitHub Actions.

De flow heeft 3 fasen:

1. Nieuwe persartikels detecteren en een reviewqueue bouwen
2. Codex de queue laten beoordelen
3. Goedgekeurde matches toepassen op de app-output

De automatische GitHub workflow blijft enkel `press.ndjson` up-to-date houden. De inhoudelijke koppeling tussen persartikels en blogs gebeurt offline.

## Bestanden

**Versiebeheerd**

- [`scripts/press-blog-profiles.json`](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/scripts/press-blog-profiles.json)
  Profielen per blog: titel, summary, tags en keywords voor candidate selection
- [`scripts/press-reviewed-links.json`](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/scripts/press-reviewed-links.json)
  Gecureerde, goedgekeurde article-to-blog matches
- [`scripts/build_press_review_queue.py`](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/scripts/build_press_review_queue.py)
  Bouwt de reviewqueue voor nieuwe artikels
- [`scripts/apply_press_review_queue.py`](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/scripts/apply_press_review_queue.py)
  Past gereviewde beslissingen toe en refresht de publieke JSON-output
- [`scripts/update_press_references.py`](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/scripts/update_press_references.py)
  Bouwt de publieke persreferenties op en merge’t reviewed links boven queryresultaten

**Lokaal, niet in git**

- `.cache/press-review-queue.json`
  Werkbestand dat Codex moet invullen
- `.cache/press-review-queue.md`
  Leesbare briefing van de queue
- `.cache/press-review-state.json`
  Lokale geheugenlaag met verwerkte artikels

## Voorwaarden

- Lokale `emv-pers` checkout aanwezig op:
  `/Users/gerthuybrechts/pyprojects/emv-pers`
- Up-to-date persdata in:
  `/Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson`
- Werken vanuit:
  `/Users/gerthuybrechts/pyprojects/data-blog-u/analyses`

## Stap 1: Reviewqueue bouwen

Ga naar de monorepo root van `analyses`:

```bash
cd /Users/gerthuybrechts/pyprojects/data-blog-u/analyses
```

Bouw daarna een queue van nieuwe persartikels:

```bash
python3 scripts/build_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --max-items 20
```

Optioneel:

- alleen bepaalde blogs scoren:

```bash
python3 scripts/build_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --slug arbeiders-bedienden \
  --slug betaalbaar-arr \
  --max-items 20
```

- meer logging:

```bash
python3 scripts/build_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --max-items 20 \
  --verbose
```

Output:

- `.cache/press-review-queue.json`
- `.cache/press-review-queue.md`

## Stap 2: Codex laat de queue beoordelen

Open in VS Code:

- [press-review-queue.json](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.json)
- [press-review-queue.md](/Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.md)

Laat Codex alleen de JSON queue aanpassen. De `top_candidates` worden door code voorgesteld; Codex beslist of een artikel echt nuttig is voor één of meer blogs.

### Standaardprompt

```text
Lees deze 2 bestanden:
- /Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.json
- /Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.md

Doel:
Beoordeel voor elk item met review.status = "pending" of het persartikel echt nuttig is voor één of meer blogs in deze repo.

Werkwijze:
1. Gebruik eerst article.title, article.excerpt, top_candidates, blog title, blog summary en de candidate reasons.
2. Als dat niet volstaat, gebruik article.paragraphs en article.quotes.
3. Keur alleen goed als het artikel inhoudelijk echt relevant is voor de analyse van die blog, niet alleen omdat er losse overlap in woorden zit.
4. Als geen blog echt past, zet review.status op "rejected".
5. Als een blog wel past, zet review.status op "approved" en vul review.selected_slugs in met één of meer slugs.
6. Voeg altijd een korte, concrete review.notes toe in het Nederlands.

Belangrijke regels:
- Pas alleen /Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.json aan.
- Verander geen andere bestanden.
- Laat top_candidates ongemoeid.
- Gebruik alleen deze review.status waarden: "pending", "approved", "rejected".
- review.selected_slugs moet leeg zijn bij rejected.
- Kies liever conservatief dan te breed.
- Koppel een artikel alleen aan meerdere blogs als het echt voor elk van die blogs inhoudelijke meerwaarde heeft.

Beoordelingscriteria:
- "arbeiders-bedienden": arbeidsmarkt, tewerkstelling, vacatures, instroom, arbeidskrapte, werknemersprofielen in de bouw
- "betaalbaar-arr": betaalbaar wonen, woningmarkt, woningaanbod, vergunningen met impact op wonen, huishoudensgroei
- "faillissementen": faillissementen, insolvabiliteit, stopzettingen, falingsdruk in de bouw
- "vergunningen-aanvragen": aanvragen, omgevingsloket, vergunningsaanvragen, woningbouw, renovatie, sloop
- "vergunningen-goedkeuringen": goedkeuringen, bouwvergunningen, vergunningsbeleid, afgeleverde vergunningen

Uit te voeren:
Werk alle pending items af in de JSON.
```

### Korte prompt

```text
Werk alle pending items af in /Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.json op basis van de context in die file en in /Users/gerthuybrechts/pyprojects/data-blog-u/analyses/.cache/press-review-queue.md.

Regels:
- alleen die JSON aanpassen
- status = approved of rejected
- bij approved: selected_slugs invullen
- bij rejected: selected_slugs leeg
- notes altijd kort en concreet in het Nederlands
- conservatief beslissen, alleen echte inhoudelijke relevantie
```

## Stap 3: Gereviewde beslissingen toepassen

Als de queue ingevuld is:

```bash
python3 scripts/apply_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson
```

Dit doet 3 dingen:

1. Schrijft goedgekeurde matches weg naar `scripts/press-reviewed-links.json`
2. Markeert verwerkte artikels in `.cache/press-review-state.json`
3. Bouwt `apps/*/public/press-references/*.json` en `apps/*/public/data/press_references.json` opnieuw op

Na deze stap zitten de goedgekeurde artikels in de publieke app-output.

## Output controleren

Controleer of de output consistent is:

```bash
python3 scripts/update_press_references.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --check
```

Bij succes:

```text
Press references are up to date.
```

## Typische werkroutine

1. `press.ndjson` wordt elders geüpdatet
2. Bouw een nieuwe queue
3. Laat Codex de queue beoordelen
4. Apply de goedgekeurde beslissingen
5. Check dat alles up to date is
6. Review en commit eventueel:
   - `scripts/press-reviewed-links.json`
   - gewijzigde `apps/*/public/press-references/*.json`
   - gewijzigde `apps/*/public/data/press_references.json`

## Belangrijke ontwerpkeuze

Deze flow is bewust hybride:

- **code** doet candidate selection
- **Codex** doet de inhoudelijke finale beslissing
- **reviewed links** blijven persistent in git
- **queue en state** blijven lokaal in `.cache/`

Zo vermijd je:

- onnodige LLM-calls in CI
- kosten/quotas in GitHub Models of Copilot
- slechte matches op basis van alleen keyword overlap

## Veelvoorkomende gevallen

### Queue opnieuw opbouwen zonder oude pending items kwijt te raken

De builder bewaart bestaande `review`-velden per article id als dezelfde artikels opnieuw in de queue komen.

### Een artikel expliciet afkeuren

Zet:

```json
"review": {
  "status": "rejected",
  "selected_slugs": [],
  "notes": "Niet inhoudelijk relevant voor de bestaande blogs."
}
```

### Een artikel aan meerdere blogs koppelen

Dat mag, maar alleen wanneer het artikel voor elk van die blogs echt meerwaarde heeft. Niet doen bij louter semantische overlap.

## Snelle referentie

Queue bouwen:

```bash
python3 scripts/build_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --max-items 20
```

Queue toepassen:

```bash
python3 scripts/apply_press_review_queue.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson
```

Consistency check:

```bash
python3 scripts/update_press_references.py \
  --source-file /Users/gerthuybrechts/pyprojects/emv-pers/press.ndjson \
  --check
```
