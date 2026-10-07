# Gemeentelijke investeringen, versie september 2026

Aparte versie van [gemeentelijke-investeringen](../gemeentelijke-investeringen/) (versie mei 2026), die onaangeroerd blijft.
Beide versies staan naast elkaar op de site en in het portaal (versiekiezer op de kaart, zie
`scripts/analysis-versions.json`).

- Pagina: `/analyses/gemeentelijke-investeringen-2026-09/`
- Embeds: `/analyses/gemeentelijke-investeringen-2026-09/embed/gemeentelijke-investeringen-2026-09/<sectie>/`
  (dezelfde negen secties als de vorige versie, geregistreerd in `embed-config.ts`)
- Bestaande embeds van de vorige versie blijven ongewijzigd werken.

## Brongegevens

`data/MJP BV 2026 MVA v september.xlsx` (BBC-DR export van 7 oktober 2026, alle drie rapportjaren in een tidy tabel,
oorspronkelijk `data-5.xlsx`). Toegepaste filters, zoals vermeld in cel A1 van de export:

- Meest recente: Ja
- Type rapport: Meerjarenplan
- Type boekhouding: Budgettaire Boekhouding
- Rapportjaar: 2014, 2020 en 2026
- Type bestuur: Gemeente en OCMW of District
- Niveau 2: I.1 Investeringsuitgaven
- Opgenomen op niveau 4 en 5: I.1.B.1 Gemeenschapsgoederen en bedrijfsmatige materiële vaste activa (zonder
  I.1.B.1.c Roerende goederen en I.1.B.1.d Leasing), **I.1.B.2.a Onroerende goederen** en I.1.D Toegestane
  investeringssubsidies
- Rijen: NIS-code; kolommen: Rapportjaar, Boekjaar en Niveau 2; waarden: Uitgave en Uitgave per inwoner;
  dimensie: Beleidsveld (BV)

Dit is dezelfde scope als de versie van mei 2026 (I.1.A financiële en I.1.C immateriële vaste activa vallen in beide weg
bij de BV). Een eerdere septemberexport zonder I.1.B.2.a staat nog in `data/` onder de naam
`... (zonder I.1.B.2.a).xlsx`, maar wordt niet meer gebruikt.

De map `data/` staat in .gitignore (zoals bij de vorige versie). Enkel de verwerkte bestanden in `public/data/` worden
gepubliceerd.

## Verwerking

```bash
python3 scripts/process_investments.py        # xlsx -> results/ + public/data/investments_bv.parquet
python3 scripts/prepare_visualizations.py     # parquet -> JSON voor de frontend
python3 scripts/compare_with_previous_version.py   # controle t.o.v. de vorige versie
```

`process_investments.py` sommeert over Niveau 8, laat cellen met netto uitgave van 0 of minder weg en past gemeentefusies
toe (enkel rapportjaar 2026), met dezelfde semantiek als de vorige versie. De CPI-indexatie is ongewijzigd (prijspeil
februari 2026).

## Verschillen met de vorige versie (controle)

De scope is gelijk aan die van mei 2026, dus de totalen zijn vergelijkbaar. Binnen de legislatuur van elk rapportjaar
(versie september tegenover versie mei, na de correctie hieronder): 2014 +0,13%, 2020 +0,13%, 2026 +0,72%.

- **2014 en 2020**: 99,1% van de cellen is op de euro gelijk. De restverschillen (+18 M in 2014, +22 M in 2020) zijn
  enkel positief, zitten in de BV (de REK is voor 2014 identiek) en liggen vooral bij de beleidsvelden Musea en Overig
  kunst- en cultuurbeleid in enkele steden (Brugge, Gent). De oorzaak is niet vastgesteld.
- **2026**: echte verschuivingen (o.a. Wegen +42 M, Gewoon basisonderwijs +25 M, Gebiedsontwikkeling +18 M), waarschijnlijk
  doordat gemeenten hun plan sinds mei hebben aangepast (het filter Meest recente is Ja). Dat laatste is een hypothese,
  geen vastgestelde oorzaak.

`scripts/compare_with_previous_version.py` toont de details.

### Correctie van de versie van mei 2026 (7 oktober 2026)

Een eerste vergelijking toonde voor 2014 en 2020 veel grotere verschillen (+1,21% en +0,73%). Die kwamen uit de verwerking
van mei, niet uit de data. `process_investments.py` las de CSV in blokken met `pd.read_csv`; kolommen waarvan alle
waarden op een getal leken (bv. `990.000`) werden als decimaal getal ingelezen (990,0) en daarna door de Nederlandse
getalparser tot 9.900 herleid. Gehele getallen onder 1.000 in zulke kolommen (bv. `23`) werden tien keer te groot (230).
Voorbeeld: Dendermonde, Dienstencentra, boekjaar 2019: 990.000 in de export, 9.900 in de oude parquet. De CSV's worden nu
als tekst ingelezen (`dtype=str`) in de verwerking van de mei-app, en de mei-app is herberekend en opnieuw gepubliceerd.
Gevolg: 2014 +1,1% en 2020 +0,6% in de mei-app; 2026 ongewijzigd, want die komt uit een xlsx-conversie zonder dit probleem.
De januari-exports (versie februari 2026) werden vóór de correctie al apart zonder de fout ingelezen en komen voor 2014 en
2020 op de euro overeen met de gecorrigeerde mei-versie. De REK van mei is niet getroffen (geen enkele cel met die
verhouding bij de 45 rekeningen die ook in de REK van september voorkomen).

## Economische rekening (REK)

`data/MJP REK 2026 MVA v september.xlsx` (oorspronkelijk `data-6.xlsx`) heeft dezelfde filters als de BV-export, met
Rapportjaar, Boekjaar en Alg. rekening als kolommen en NIS-code als rij. De totalen over alle cellen zijn op de euro gelijk
aan die van de BV-export (51.917 M). Per gemeente, rapportjaar en boekjaar wijken 306 van 5.878 cellen meer dan 1 euro af,
omdat cellen met een netto waarde van 0 of lager per rekening, respectievelijk per beleidsveld, worden weggelaten (grote
negatieve posten, bv. verkopen van onroerende goederen).

De scope is smaller dan in de vorige versie, die ook I.1.A (financiële vaste activa) en I.1.C (immateriële vaste activa)
bevatte. De REK toont daarom twee categorieën in plaats van vier. Niveau 3 wordt afgeleid uit de rekening (REK664 is
I.1.D, de overige rekeningen REK22x, REK26x en REK27x zijn I.1.B).

Een eerdere REK-export zonder Rapportjaar-kolom (boekjaren 2020, 2026 en 2027 waren opgeteld over twee plannen) is niet
gebruikt.
