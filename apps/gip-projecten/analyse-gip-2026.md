# Analyse GIP 2026 verwerking en vergelijking

Datum verwerking: 2026-05-27

## Bronnen

- `bronnen/VR_2025_1407_MED.0277-4_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_g3zk8e.pdf`
- `bronnen/3_-_BIJLAGE_-_GIP_-_Grote_Projecten_yvc7un.pdf`
- `bronnen/VR 2026 2205 MED.0202-1 GIP MOW 2026 - mededeling BIS.pdf`
- `bronnen/VR_2026 2025_1407_MED.0277-4_GIP_2025-2029_van_het_beleidsdomein_MOW_-_bijlage_BIS_g3zk8e.pdf`

## App-wijzigingen

- De app bevat nu aparte datasets voor `2025` en `2026`.
- Bovenaan de blogpagina staat een versiekeuze met knoppen `2025` en `2026`.
- `public/data/gip_data_2025.json` bevat de vorige GIP 2025-2027-versie.
- `public/data/gip_data_2026.json` bevat de nieuwe GIP 2026-actualisatie.
- `public/data/gip_data.json` en `public/data/metadata.json` wijzen naar de nieuwste versie: `2026`.
- De 2026-versie heeft alleen budgetjaar 2026. De budgetselector toont daarom geen aparte 2025/2027-opties voor die versie.

## Verwerkingscontrole

| Kenmerk | Versie 2025 | Versie 2026 |
|---|---:|---:|
| Projectlijnen | 777 | 605 |
| Unieke projectnamen | 722 | 552 |
| Totaal budget in dataset | EUR 7.510.150.848 | EUR 3.685.246.893 |
| Budget 2026 | EUR 2.423.646.670 | EUR 3.685.246.893 |
| Gekarteerde projectlijnen | 556 | 401 |
| Gekarteerd budget | EUR 3.659.533.303 | EUR 2.704.634.625 |
| Gekarteerd budgetaandeel | 48,7% | 73,4% |

De som van alle uitgelezen 2026-projectlijnen is exact gelijk aan de totaalrij in de nieuwe bijlage: EUR 3.685.246.893.

## Budgetvergelijking 2026

Vergelijkingsbasis: de kolom `Budget 2026` uit de oude GIP 2025-2027-dataset tegenover de nieuwe GIP 2026-tabel.

| Programma | Oud budget 2026 | Nieuw budget 2026 | Verschil |
|---|---:|---:|---:|
| Grote werken in het wegennet | EUR 621.224.376 | EUR 1.473.046.956 | +EUR 851.822.580 |
| Duurzaam personenvervoer en modal shift | EUR 397.062.958 | EUR 913.120.346 | +EUR 516.057.388 |
| Regulier onderhoud en exploitatie | EUR 74.835.000 | EUR 0 | -EUR 74.835.000 |
| Asset Management | EUR 730.443.744 | EUR 765.223.789 | +EUR 34.780.045 |
| Grote investeringen in de zeehavens | EUR 70.750.000 | EUR 45.520.000 | -EUR 25.230.000 |
| Diversen en recurrente kosten | EUR 196.322.960 | EUR 173.425.220 | -EUR 22.897.740 |
| Investeringen in de regionale luchthavens | EUR 2.894.000 | EUR 21.780.000 | +EUR 18.886.000 |
| Grote werken in het waterwegennet | EUR 74.700.222 | EUR 56.981.250 | -EUR 17.718.972 |
| Waterbeheersing | EUR 112.767.969 | EUR 99.786.400 | -EUR 12.981.569 |
| Investeringen in duurzaam goederenvervoer | EUR 77.468.256 | EUR 67.554.500 | -EUR 9.913.756 |
| Verkeersveiligheid | EUR 65.177.185 | EUR 68.808.432 | +EUR 3.631.247 |

Het nieuwe 2026-totaal ligt EUR 1.261.600.223 hoger dan de oude 2026-kolom. De mededeling vermeldt dat de GIP 2026-tabel ook investeringen via andere financieringsbronnen bevat. Daardoor geeft de tabel 3,6 miljard euro weer in plaats van het reguliere GIP-budget van ongeveer 2 miljard euro. Het gaat vooral om meer dan EUR 1 miljard voor de hoofdwerken van Oosterweel, gefinancierd met tolinkomsten, en EUR 638 miljoen voor leefbaarheidsprojecten, gefinancierd vanuit het overkappingsfonds.

De twee grootste 2026-stijgingen zijn dus geen volledig nieuwe projecten: `Oosterweel Kanaaltunnels & R1` en `Leefbaarheid - fase II` stonden al in de GIP 2025-2027-tabel. De stijging zit vooral in het feit dat de 2026-actualisatie deze posten veel zwaarder en explicieter in het jaar 2026 toont.

## Grootste 2026-budgetlijnen in GIP 2026

| Budget 2026 | Programma | Project |
|---:|---|---|
| EUR 1.006.726.000 | Grote werken in het wegennet | Oosterweel Kanaaltunnels & R1 |
| EUR 626.200.000 | Duurzaam personenvervoer en modal shift | Leefbaarheid - fase II |
| EUR 135.000.000 | Asset Management | Onderhoudsbaggerwerken vaarpassen |
| EUR 70.602.953 | Duurzaam personenvervoer en modal shift | E-bussysteem - laadinfrastructuur en stelplaatsen |
| EUR 69.405.667 | Grote werken in het wegennet | R0-Noord - Fase 1 - Viaduct Vilvoorde |

## Project-key vergelijking

Projecten werden heuristisch gematcht op `entiteit + project + deelproject`. Door naamswijzigingen en herschikkingen is dit geen sluitende boekhoudkundige aansluiting, maar het geeft wel de grootste inhoudelijke bewegingen.

| Metriek | Aantal |
|---|---:|
| Actieve oude 2026-projectlijnen | 415 |
| Actieve nieuwe 2026-projectlijnen | 605 |
| Gematchte projectlijnen | 250 |
| Nieuwe of sterk hernoemde projectlijnen | 355 |
| Verdwenen of sterk hernoemde projectlijnen | 165 |
| Gematchte projectlijnen met budgetwijziging | 173 |

Grootste wijzigingen bij gematchte projectlijnen:

| Verschil | Oud -> nieuw | Project |
|---:|---|---|
| +EUR 857.101.000 | EUR 149.625.000 -> EUR 1.006.726.000 | Oosterweel Kanaaltunnels & R1 |
| +EUR 620.200.000 | EUR 6.000.000 -> EUR 626.200.000 | Leefbaarheid - fase II |
| -EUR 72.208.000 | EUR 80.000.000 -> EUR 7.792.000 | Fiets- en voetgangersbrug Schelde incl. Scheldebalkon |
| -EUR 28.730.000 | EUR 31.000.000 -> EUR 2.270.000 | Complex project Extra Containercapaciteit Antwerpen |
| -EUR 13.614.149 | EUR 47.748.000 -> EUR 34.133.851 | Investeringen in tunnels - deelrenovaties |

## Grote-projectentab

De oude versie bevatte een aparte bijlage met capex en investeringsimpact 2025-2040. In de aangeleverde 2026-bestanden zit geen equivalent van die meerjarige capextabel. Daarom toont de 2026-versie in de app een melding in de tab `Grote projecten` in plaats van de oude langetermijngrafieken.
