# Gemeentelijke investeringen, versie september 2026

Aparte versie van [gemeentelijke-investeringen](../gemeentelijke-investeringen/) (versie mei 2026), die onaangeroerd blijft.
Beide versies staan naast elkaar op de site en in het portaal (versiekiezer op de kaart, zie
`scripts/analysis-versions.json`).

- Pagina: `/analyses/gemeentelijke-investeringen-2026-09/`
- Embeds: `/analyses/gemeentelijke-investeringen-2026-09/embed/gemeentelijke-investeringen-2026-09/<sectie>/`
  (dezelfde negen secties als de vorige versie, geregistreerd in `embed-config.ts`)
- Bestaande embeds van de vorige versie blijven ongewijzigd werken.

## Brongegevens

`data/MJP BV 2026 MVA v september.xlsx` (BBC-DR export, alle drie rapportjaren in een tidy tabel, met extra
opsplitsing op Niveau 8). Toegepaste filters, zoals vermeld in cel A1 van de export:

- Meest recente: Ja
- Type rapport: Meerjarenplan
- Type boekhouding: Budgettaire Boekhouding
- Rapportjaar: 2014, 2020 en 2026
- Type bestuur: Gemeente en OCMW of District
- Niveau 2: I.1 Investeringsuitgaven
- Opgenomen op niveau 4 en 5: I.1.D Toegestane investeringssubsidies, I.1.B.1.a Terreinen en gebouwen,
  I.1.B.1.b Wegen en overige infrastructuur, I.1.B.1.e Erfgoed
- Rijen: NIS-code; kolommen: Rapportjaar, Boekjaar en Niveau 8; waarden: Uitgave en Uitgave per inwoner;
  dimensie: Beleidsveld (BV)

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

Voor 2014 en 2020 zijn de cijfers grotendeels dezelfde: 91 tot 93% van de cellen (gemeente x beleidsveld x boekjaar) is op de
euro identiek. De Vlaamse totalen liggen wel lager: 2014 -0,65%, 2020 -1,32%, 2026 -0,81%. Het verschil zit bijna volledig in
het beleidsveld 0050 Patrimonium zonder maatschappelijk doel (-86 M voor 2014, -158 M voor 2020, -168 M voor 2026).

Oorzaak: de vorige export (mei 2026) nam ook **I.1.B.2.a Onroerende goederen** (Andere materiële vaste activa) op. Deze export
doet dat niet. De pagina vermeldt dit expliciet. Wie de cijfers volledig vergelijkbaar wil, exporteert opnieuw met dat filter
erbij en draait de scripts opnieuw.

Buiten dat zijn er echte verschuivingen in 2026 (o.a. Wegen +35 M, Gewoon basisonderwijs +25 M).

## Economische rekening (REK)

`data/MJP REK 2026 MVA v september.xlsx` heeft dezelfde filters als de BV-export (I.1.B.1 zonder I.1.B.1.c Roerende goederen
en I.1.B.1.d Leasing, plus I.1.D), met Rapportjaar, Boekjaar en Alg. rekening als kolommen en NIS-code als rij. Het totaal per
gemeente, rapportjaar en boekjaar is op de euro gelijk aan het BV-bestand (5.897 cellen gecontroleerd). Verschillen in
de totalen per rapportjaar (circa 0,1%) komen doordat waarden van 0 of lager per rekening, respectievelijk per beleidsveld,
worden weggelaten.

De scope is smaller dan in de vorige versie, die ook I.1.A (financiële vaste activa) en I.1.C (immateriële vaste activa)
bevatte. De REK toont daarom twee categorieën in plaats van vier. Niveau 3 wordt afgeleid uit de rekening (REK664 is
I.1.D, de overige rekeningen zijn I.1.B).

Een eerdere REK-export zonder Rapportjaar-kolom (boekjaren 2020, 2026 en 2027 waren opgeteld over twee plannen) is niet
gebruikt.
