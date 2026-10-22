# Gemeentelijke bouwinvesteringen, oktober 2026

Nieuwe, afzonderlijke bronversie op `/analyses/gemeentelijke-investeringen-2026-10/`.
De historische apps blijven ongewijzigd. Het portaal gebruikt deze versie standaard
en toont de vier versies via een dropdown.

## Grafieken

- `investments-yearly-actual`: meest recent meerjarenplan tegenover jaarrekening.
- `investments-yearly-latest`: afzonderlijke grafiek van het meest recente plan.
- `investments-yearly-original`: afzonderlijke grafiek van het originele beginkrediet.

De drie grafieken tonen boekjaren 2014-2031, kleuren per planperiode, volle tint voor
het meest recente plan en lichte tint van dezelfde kleur voor de vergelijking.
De twee afzonderlijke plangrafieken gebruiken dezelfde verticale schaal.
Tabel, CSV en embeds gebruiken dezelfde gegenereerde gegevens. Voor 2026-2031 is
geen jaarrekening beschikbaar: `null`, geen nul en geen lichte balk.
De embedroutes hebben de vorm
`/analyses/gemeentelijke-investeringen-2026-10/embed/gemeentelijke-investeringen-2026-10/<sectie>/`.
De query `?view=table` of `?gemeentelijke-investeringen-2026-10.view=table` opent de tabel.

## Bronnen en filtering

De oorspronkelijke bestanden staan centraal in
`../../../../data/gemeentelijke-investeringen/versions/2026-10/raw/`. Nieuwe exports
gaan eerst naar `../../../../data/gemeentelijke-investeringen/inbox/` en worden vanuit
`analyses/` gearchiveerd met `python3 scripts/archive_investment_data.py YYYY-MM`.
De app leest alleen uit het archief van de eigen versie.

| Bron | Gebruik |
| --- | --- |
| `MJP meest recente oktober 26  - alle.xlsx` | Meest recente plan, economische rekeningen |
| `MJP origineel beginkrediet - alle.xlsx` | Oorspronkelijk plan/beginkrediet, economische rekeningen |
| `JR oktober 26.xlsx` | Werkelijke uitgaven, economische rekeningen |
| `MJP meest recente oktober 26 - alle - BV.xlsx` | Niet gebruikt: afgekapt op 150.000 rijen en geen economische rekeningcodes |
| `MJP origineel - alle - BV.xlsx` | Niet gebruikt: geen economische rekeningcodes om de bouwscope af te zonderen |

De economische exports zijn niet afgekapt. De lezer herstelt hun onjuiste
Excel-dimensie `A1:A1` en valideert de kopteksten, bronfilters, unieke sleutels,
getallen, rapporttypes en verwachte jaren. Een afgekapt gebruikt bestand geeft
een fout; ontbrekende jaren worden nooit stilzwijgend nul.

Dezelfde **bouwscope als de bestaande BV-selectie**, toegepast op `Niveau 5`:

- `I.1.B.1.a` terreinen en gebouwen;
- `I.1.B.1.b` wegen en overige infrastructuur;
- `I.1.B.1.e` erfgoed;
- `I.1.B.2.a` onroerende goederen;
- `I.1.D` toegestane investeringssubsidies.

Financiële/immateriële activa, roerende goederen en leasing vallen weg.
Alleen `I.1 Investeringsuitgaven`, besturen met een Vlaamse NIS-code, en
boekjaren binnen het eigen zesjarige plan worden opgenomen. Bij jaarrekeningen
is rapportjaar gelijk aan boekjaar.

Conform de bestaande **REK-verwerking** telt alleen een positieve uitgave per
economische rekening mee, voor alle drie reeksen op dezelfde manier. Negatieve
boekingen worden niet gesaldeerd met andere rekeningen. Aantallen en som van de
weggelaten niet-positieve cellen staan per bron in het controlebestand.
Dit kan afwijken van de oudere BV-totalen: daar werd eerst per beleidsveld
gesaldeerd en daarna de positieve-celselectie toegepast.

Er is geen bijkomende inflatiecorrectie. Bij de meest recente plannen kunnen
historische uitgaven reeds aan de jaarrekening zijn aangepast. Interpreteer de
eerste grafiek daarom niet als uitvoering van het oorspronkelijke beginkrediet.
Voor 2019 verschilt de brondekking: de telling is zichtbaar per bron in tabel en
CSV, en als waarschuwing in beide grafieken. Er is geen imputatie of correctie
naar een gemeenschappelijke gemeentesteekproef.

Een gefilterde BV-export met economische classificatie (of reeds op deze
bouwscope gefilterde BV-export), zonder afkapping, is nodig voor betrouwbare
oktobergrafieken per beleidsveld. Er worden geen septembercijfers als oktober
gepresenteerd.

## Reproduceren

Vanuit `analyses/`, met de bestaande Python-omgeving met pandas, numpy en openpyxl:

```bash
python3 apps/gemeentelijke-investeringen/versions/2026-10/scripts/build_october_data.py
python3 -m unittest discover -s tests -p test_investeringen_october.py -v
pnpm --filter gemeentelijke-investeringen-2026-10 --filter portal typecheck
pnpm --filter gemeentelijke-investeringen-2026-10 --filter portal build
```

Opties: `--source-dir PATH` en `--output PATH`.
Gegenereerd in `public/data/`:

- `yearly_comparison.json`: jaartotalen, definities, dekkingsaantallen en waarschuwingen;
- `construction_{latest,original,actual}.csv`: alle positieve bouwcellen binnen de gebruikte jaren;
- `source_snapshot.json`: bronfilters, SHA-256 van alle vijf bestanden, rijtellingen,
  uitgesloten cellen, niet-gebruikte BV-bestanden en claimregister per bron/boekjaar.

Downloadtijd en licentie zijn niet in de aangeleverde exports vermeld en worden
niet verzonnen. De build wijzigt de oorspronkelijke Excelbestanden niet.
