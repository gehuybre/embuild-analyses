# Gemeentelijke investeringen, versie februari 2026

Reconstructie van een vroege versie van de analyse, naast de versies van mei en september 2026 (versiekiezer op de
portaalkaart, zie `scripts/analysis-versions.json`). De naam "februari 2026" volgt het prijspeil (februari 2026) en de
benaming van de eigenaar; de bestanden zelf dateren van januari en maart 2026.

- Pagina: `/analyses/gemeentelijke-investeringen-2026-02/`
- Embeds: `/analyses/gemeentelijke-investeringen-2026-02/embed/gemeentelijke-investeringen-2026-02/<sectie>/`
- Vergelijking met de andere versies: `/analyses/gemeentelijke-investeringen-vergelijking/`

## Bronnen

Alles in `data/` (staat in .gitignore) komt uit twee oudere projectmappen:

| Bestand in `data/` | Herkomst | Datum |
|---|---|---|
| `MJP BV 2014 MVA.csv`, `MJP BV 2020 MVA.csv`, `MJP BV 2026 MVA.csv` | `~/pyprojects/data-blog/embuild-analyses/analyses/gemeentelijke-investeringen/data/` (ruwe BBC-DR exports) | 16 januari 2026 |
| `REK januari 2026 (verwerkt, 14 jan).parquet` | zelfde map, `results/investments_rek.parquet` | 14 januari 2026 |
| `BV januari 2026 (verwerkt, zoals gepubliceerd).parquet` | zelfde map, `results/investments_bv.parquet` | 16 januari 2026 |
| `CPI All base years.txt` | kopie uit de septemberversie (prijspeil februari 2026) | |

De verwerkte JSON van `~/pyprojects/data-blog-b/data/data/gemeentelijke-investeringen` (17 tot 19 maart 2026) is geen
extra bron: de totalen per rapportjaar zijn identiek aan de januari-parquet (13.529, 15.872 en 14.563 M). Het bevestigt dat
de maart-versie dezelfde (foutieve) cijfers toonde en dat het prijspeil februari 2026 was.

Filters van de ruwe exports (laatste rij van elke CSV): Meest recente: Ja; Type rapport: Meerjarenplan; Budgettaire
Boekhouding; Gemeente en OCMW of District; Niveau 7: 220/3, 224/8, 229, 260/4, 270/4 en 664 (dus inclusief onroerende
goederen, I.1.B.2.a); uitgesloten: I.1.A en I.1.C. Dezelfde scope als mei en september.

## Verwerking

```bash
python3 scripts/process_investments.py        # CSV's + REK-parquet -> results/ + public/data/*.parquet
python3 scripts/prepare_visualizations.py     # parquet -> JSON voor de frontend
```

`process_investments.py` leest de ruwe CSV's als tekst en zet Nederlandse getallen zelf om. De oorspronkelijke verwerking
las ze in blokken met `pd.read_csv`; kolommen die enkel getalachtige waarden bevatten (bv. `990.000`) werden daardoor als
decimaal getal ingelezen (990,0) en na het weghalen van de punt als 9.900 opgeslagen, en gehele getallen onder 1.000 als
tien keer te groot. Het aantal rijen van de herverwerkte BV is identiek aan de oorspronkelijke parquet (77.536); enkel
7.001 bedragen verschillen, waarvan 6.576 met een verhouding van precies 10, 100 of 1.000 en de overige 425 met verhouding
0,1 (de gehele getallen).

| Rapportjaar | Zoals gepubliceerd (M) | Herberekend (M) | Verschil |
|---|---|---|---|
| 2014 | 13.529 | 13.675 | +1,08% |
| 2020 | 15.872 | 15.966 | +0,59% |
| 2026 | 14.563 | 14.903 | +2,33% |

De versie van mei 2026 had dezelfde fout voor 2014 en 2020 en is op 7 oktober 2026 gecorrigeerd. Sindsdien zijn februari en
mei voor 2014 en 2020 op de euro gelijk.

Het aantal gemeenten per rapportjaar (BV): 285, 285 en 282. Voor 2026 ontbreken Boom, Alveringem en Maaseik: hun plan zat
nog niet in de export van 16 januari. De REK bevat voor 2026 slechts 275 gemeenten.

## Beperkingen

- De REK komt uit de verwerkte parquet van 14 januari 2026 omdat de ruwe REK-exports niet bewaard zijn. Een controle van
  de rekeningen die ook in de REK-export van oktober voorkomen (45 rekeningen) vond geen enkele cel met een schaalfout,
  maar voor de overige 69 rekeningen kan dat niet nagegaan worden. De REK bevat vier categorieën (I.1.A tot en met
  I.1.D), terwijl de BV I.1.A en I.1.C uitsluit.
- De exports bevatten de ruwe boekjaren van de legislatuur: 2014-2019, 2020-2025 en 2026-2031 voor de BV; de REK-parquet
  loopt voor 2014 tot 2020, voor 2020 tot 2027 en voor 2026 tot 2033.
- De paginadatum (19 maart 2026) is de datum van de laatst bijgewerkte verwerkte bestanden van deze versie, niet een
  gedocumenteerde publicatiedatum.
