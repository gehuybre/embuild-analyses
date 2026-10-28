# Gemeentelijke bouwinvesteringen, oktober 2026

Nieuwe, afzonderlijke bronversie op `/analyses/gemeentelijke-investeringen-2026-10/`.
De historische bronversies blijven afzonderlijk beschikbaar. Het portaal gebruikt deze versie standaard
en toont de vier versies via een dropdown.

## Grafieken

- `investments-yearly-actual`: meest recent meerjarenplan tegenover jaarrekening.
- `investments-yearly-actual-real`: zelfde vergelijking, gedeflateerd naar prijspeil februari 2026 met `public/data/inflation_factors.json` (gebouwd door `scripts/build_october_inflation.py`: Statbel tot de laatste maand, daarna Planbureau-prognose uit `apps/nbb-rente`, daarna constante inflatie = gemiddelde van de laatste vier prognosemaanden).
- `investments-yearly-latest`: afzonderlijke grafiek van het meest recente plan.
- `investments-yearly-original`: afzonderlijke grafiek van het originele beginkrediet.
- `investments-planned-2026-2031`: geplande bouwinvesteringen per boekjaar 2026-2031
  (meest recent plan), gestapeld per beleidsdomein, met filters voor provincie,
  gemeente, beleidsdomein en algemene rekening (of rekeninggroep).
- `investments-bv`: investeringen per beleidsdomein (meest recent plan), per planperiode 2014-2019,
  2020-2025 en 2026-2031, met filter op domein, totaal of per inwoner, en tabel (top 20) en kaart
  van de gemeenten voor 2026-2031. Overgenomen uit de septemberversie.
- `investments-bv-indexed`: dezelfde opbouw zonder domeinfilter, gedeflateerd per boekjaar met
  `inflation_factors.json` (prijspeil februari 2026) en daarna opgeteld per planperiode. Anders dan
  september, dat de legislatuur-middelpunten januari 2017 en januari 2023 gebruikte.
- `investments-bv-breakdown`: verdeling per beleidsdomein (uitklapbaar per subdomein),
  per planperiode, met meest recent plan of jaarrekening, totaal of per inwoner.
- `investments-rek-breakdown`: verdeling per algemene rekening (top 9 + overige),
  met dezelfde filters.

Alle grafieken hebben een filter voor provincie en gemeente. Vlaanderen gebruikt
de gepubliceerde jaartotalen; provincies en gemeenten komen uit `public/data/geo/`.

### Doorklikken naar projecten

Is een gemeente gekozen, dan opent een klik op een balk of tabelcel van
`investments-planned-2026-2031` de projectbrowser
`/analyses/bouwprojecten-gemeenten-2026-09/?gemeente=<NIS>&categorie=<domein>&jaar=<jaar>&rekening=<Niveau 4>`.
Het beleidsdomein (`2 Zich verplaatsen en mobiliteit`) wordt categorie `02-mobiliteit`;
de rekeninggroep wordt de Niveau 4-groep van de projectdata (`I.1.B.1.a/b/e` →
`I.1.B.1`, `I.1.B.2.a` → `I.1.B.2`, `I.1.D` → `I.1.D`). In de BV-verdeling linkt
een gekozen gemeente in periode 2026-2031 per domein naar dezelfde browser.
De projectbedragen omvatten de volledige Niveau 4-groep (bv. ook roerende
goederen) en komen uit de septemberexport, dus ze tellen niet exact op tot de
bouwbedragen in deze grafieken.

De drie grafieken tonen boekjaren 2014-2031, kleuren per planperiode, volle tint voor
het meest recente plan en lichte tint van dezelfde kleur voor de vergelijking.
De twee afzonderlijke plangrafieken gebruiken dezelfde verticale schaal.
Tabel, CSV en embeds gebruiken dezelfde gegenereerde gegevens. Voor 2026-2031 is
geen jaarrekening beschikbaar: `null`, geen nul en geen lichte balk.
De embedroutes hebben de vorm
`/analyses/gemeentelijke-investeringen-2026-10/embed/gemeentelijke-investeringen-2026-10/<sectie>/`.
De query `?view=table` of `?gemeentelijke-investeringen-2026-10.view=table` opent de tabel.
Andere filters gebruiken dezelfde vorm: `geo` (`vlaanderen`, provinciecode of NIS-code),
`domein` (index in `geo/index.json`), `rekening` (`g:<groep>` of `a:<index>`),
`metric` (`total`/`capita`), `periode` (`2014`/`2020`/`2026`) en `bron` (`actual`).
Embeds bevatten alleen titels, grafieken of tabellen, filters, legenda's en
bronvermeldingen. De extra uitleg, dekkingswaarschuwingen en link naar
broncontrole blijven op de volledige analysepagina staan.

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
| `JR 2014.xlsx`, `JR 2020.xlsx` | Jaarrekening per gemeente, rekening en beleidsveld (geo-filters, BV/REK) |
| `MJP 2014.xlsx`, `MJP 2020.xlsx`, `MJP 2026.xlsx` | Meest recent plan per gemeente, rekening en beleidsveld |

De vijf detailexports (filter `[Meest recente] is Ja`) bevatten zowel `Alg. rekening`
als `Beleidsveld`. Per gemeente, boekjaar en rekening blijven rekeningen met een
positieve som behouden, met al hun beleidsveldregels. Zo sluiten de jaartotalen
exact aan bij de economische exports, behalve MJP 2026 (hoogstens circa 1 miljoen
euro per boekjaar; de controle faalt boven 0,1%). Het originele beginkrediet bestaat
per gemeente, maar niet per beleidsveld. Bevolking = `Uitgave / Uitgave per inwoner`.

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

De verdelingen per beleidsdomein en rekening gebruiken dezelfde bouwscope als de
jaartotalen; de septemberversie gebruikte alle materiële vaste activa.

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
- `construction_detail_bv.csv`: bouwcellen per bron, gemeente, boekjaar, rekening en beleidsveld;
- `geo/index.json` (domeinen, subdomeinen, rekeningen, provincies, gemeenten) en
  `geo/<vlaanderen|provinciecode|NIS>.json` (reeksen, bevolking en kubus
  `[bron, jaar, subdomein, rekening, bedrag]`);
- `municipality_domain_year.json`: gemeente x domein x boekjaar (meest recent plan) en bevolking, gebouwd
  door `scripts/build_october_domain_summary.py` uit `geo/` (opnieuw draaien na `build_october_data.py`);
- `source_snapshot.json`: bronfilters, SHA-256 van alle bronbestanden (ook de detailexports), rijtellingen,
  uitgesloten cellen, aansluiting detail/jaartotalen, niet-gebruikte BV-bestanden en claimregister per bron/boekjaar.

Downloadtijd en licentie zijn niet in de aangeleverde exports vermeld en worden
niet verzonnen. De build wijzigt de oorspronkelijke Excelbestanden niet.
