# Revtool lokaal extraheren

[extract_revtool.py](./extract_revtool.py) extraheert werkbladen, opgeslagen
celwaarden, Excel-formules, VBA en Power Query uit de aangeleverde Revtool.
Het script opent **geen Excel**, voert **geen macro's** uit, ververst **geen
dataverbindingen** en herberekent **geen formules**. Het originele bestand
wordt niet opgeslagen of gewijzigd; de SHA-256 wordt voor en na de extractie
gecontroleerd.

## Installatie en gebruik

Voer vanuit de repository `analyses` uit met de gewenste Python-omgeving:

```bash
python -m pip install -r apps/prijsherziening-index-i-2021/scripts/requirements-revtool.txt
python apps/prijsherziening-index-i-2021/scripts/extract_revtool.py
```

Zonder argumenten kiest het script de nieuwste
`revtool-nl-versie-JJJJ-MM-DD.xlsm` in de lokale map `data`, op basis van de
datum in de bestandsnaam, niet de wijzigingsdatum.

Een volgende versie kan dus gewoon in die map worden geplaatst. Een andere
bestandsnaam of locatie kan ook expliciet worden opgegeven:

```bash
python apps/prijsherziening-index-i-2021/scripts/extract_revtool.py \
  --input /pad/naar/nieuwe-revtool.xlsm
```

Optionele argumenten:

- `--output /pad/naar/extractie`: aparte uitvoermap.
- `--pdf-csv /pad/naar/waarden-S-s.csv`: andere lokale PDF-extractie voor de
  vergelijking.

Standaard komt de uitvoer in `data/revtool-extracted/<naam-van-de-werkmap>/`.
Versies met verschillende bestandsnamen blijven zo naast elkaar bewaard.
Opnieuw uitvoeren voor dezelfde versie overschrijft de gegenereerde bestanden.
Gebruik een aparte uitvoermap voor verschillende snapshots met dezelfde naam.

De bestaande ignore-regels houden zowel de bronwerkmap als de extractie lokaal.
Ze worden niet automatisch gepubliceerd of door de calculator ingelezen.
De licentie voor verdere verspreiding is niet vastgesteld.

## Uitvoer

| Bestand/map | Inhoud |
| --- | --- |
| `manifest.json` | Bronhash, dependencyversies, werkbladen met zichtbaarheid, tabelbereiken, benoemde bereiken, aantallen formules en fouten, VBA-procedures, readerwaarschuwingen en hashes van de gegenereerde bestanden |
| `sheets/*.csv` | Elk werkblad, inclusief verborgen werkbladen, als rechthoekige tabel met de opgeslagen waarden |
| `sheets/*.cells.json` | Niet-lege cellen met adres, opgeslagen waarde, datatype, formule, ontbrekende formulecache, getalnotatie, hyperlinks en opmerkingen |
| `vba/*.bas`, `vba/*.cls` | Statisch gedecodeerde VBA-modules en werkblad-/werkmapcode |
| `powerquery/*.m` | De ingebedde Power Query M-code, inclusief de daarin vermelde bronnen en transformaties |
| `package/` | Ongewijzigde VBA-binary, verbindingsdefinities en custom XML, inclusief het oorspronkelijke DataMashup-pakket |
| `index_series.csv` | Lange tabel met datum, reeks, werkblad, tabel, celadres, waarde, status, ruwe waarde en eventuele formule |
| `series_catalogue.json` | Reekscatalogus met kopcel, beschikbaar datumbereik en aantallen per status |
| `pdf_comparison.csv` | Volledige vergelijking van de standaard kleine-s-reeksen met de PDF-extractie |
| `pdf_comparison.json` | Samenvatting, afwijkingen, vergelijkingsregels en hash van de gebruikte PDF-CSV |

CSV's zijn UTF-8 met komma als veldscheiding en punt als decimaalteken.
Datums zijn ISO-datums. De werkblad-CSV's hebben geen toegevoegde koprij:
Excel-rij- en kolomposities blijven dus behouden.

De export is geen visuele Excel-kopie. Grafieken, vormen en geavanceerde
opmaak worden niet opnieuw opgebouwd. Openpyxl-waarschuwingen hierover
worden expliciet bewaard in het manifest; het originele XLSM blijft intact.

## Reeksen voor verdere uitbreiding

De normalisatie gebruikt de **gestructureerde Excel-tabellen** op de
databladen, niet vaste celbereiken of vaste tabelnamen. Daardoor mogen
tabellen in volgende versies groeien of verschuiven.

- **Standaardindexen:** i, i2021, K1, K2, M, MM, s volgens categorie en
  werkgeversgrootte, elektriciens, asfalteerders, PC 111 en PPI-componenten.
- **Materiaalindexen o.w.:** specifieke bouwmaterialen, plus onder meer
  elektriciteit, aardgas, water en consumptie-/inflatie-indexen.
- **Grymafer:** maand- en weekreeksen voor betonstaal, draad en netten.
  Het weeknummer zelf wordt niet als prijsreeks behandeld.
- **Indexen goederen & diensten:** onder meer vervoer, opslag, architecten,
  ingenieurs en productgroepen.
- **Indexeringen Lonen per PC:** verschillende paritaire comites,
  functiecategorieen en representatieve loonreeksen.

De samenstellingsgewichten, standaardformule, formules op maat, kortingen,
toeslagen en prognoselogica blijven beschikbaar in de volledige
werkbladexports en formules; ze worden niet ten onrechte als gerealiseerde
prijsreeksen genormaliseerd.

`numeric` betekent alleen dat een numerieke waarde is opgeslagen in Excel.
Het is **geen bevestiging dat het een gerealiseerde waarneming is**.
Met name loontabellen bevatten ook vooruit ingevulde of geprojecteerde
waarden. Controleer eenheid, basisperiode, actualiteit, publicatiestatus,
bron en toepassingsregels voordat een reeks in de calculator wordt gebruikt.

Ontbrekende waarden, tekstwaarden en Excel-fouten krijgen respectievelijk
`missing`, `non_numeric` en `excel_error`. Ze worden niet naar nul omgezet,
geinterpoleerd of automatisch door een oudere waarneming vervangen.
Niet-ondersteunde structuren, dubbele datums, ontbrekende reekskoppen en
een ontbrekende standaard-s-vergelijking veroorzaken expliciete fouten.

## Verificatie van de PDF-extractie

De vergelijking gebruikt de bestaande [PDF-CSV](../data/waarden-S-s.csv),
alleen het regime voor offerten vanaf 11/06/2007 en eurobedragen.
Per Excel-maand wordt de op de eerste dag geldende **kleine s** gekozen:
de laatste ingangsdatum die niet na die dag ligt, binnen de vermelde
geldigheidsperiode. Dit toetst **niet** de afzonderlijke ingangsdatum van
grote S voor aanbestedingen.

De absolute tolerantie is `0.0005`, de helft van de gepubliceerde
duizendste. Elke afwijking behoudt het Excel-celadres, de PDF-ingangsdatum,
omzendbrief, bronbestand en fysieke PDF-pagina. Maanden zonder Excel-waarde
worden apart gerapporteerd en tellen niet als match.

De werkgeverslabels verschillen tussen de bronnen: Revtool gebruikt
`<10`, `10-19`, `>=20`; de bestaande PDF-CSV gebruikt `<10`, `10-20`, `>20`.
De vergelijking koppelt de overeenkomstige bronkolommen. Dit verandert
geen juridische grenswaarden; die afwijkende formulering vereist aparte
beoordeling bij een uitbreiding van de calculator.

De werkmap is een **controlebron, geen automatische correctiebron**. In de
aangeleverde versie wijkt bijvoorbeeld categorie B voor de middelste
werkgeversgroep af in de periode juli 2019 tot en met december 2020.
De originele PDF-pagina voor juli 2019 bevestigt de bestaande PDF-extractie;
Revtool bevat daar de waarde van de grotere werkgeversgroep. Ook de
afwijking voor categorie C bij de grootste werkgeversgroep in februari en
maart 2025 is op de originele PDF-pagina gecontroleerd.
De vergelijking wijzigt de PDF-CSV, openbare data en calculator niet.

## Tests

Vanuit `analyses`, met dezelfde Python-omgeving:

```bash
python -m unittest discover -s tests -p 'test_prijsherziening_*.py' -v
```

De tests gebruiken kleine lokale werkmappen en toetsen onder meer
versiekeuze, tabelgrenzen, verborgen werkbladen, formules zonder cache,
fouten en ontbrekende waarden, statische VBA-/Power Query-extractie,
bronintegriteit en de toepassingsperioden van de PDF-vergelijking.

## Twee afzonderlijke calculators

De eerste calculator gebruikt uitsluitend de officiele, vaste
materiaalsamenstelling van I-2021. De loon- en materiaalaandelen van de
contractprijs blijven instelbaar, maar er is geen materiaalkeuze.

De afzonderlijke calculator op maat biedt een direct zichtbaar
materiaalmandje met een doorzoekbare reekskeuze en een gewicht per materiaal.
Beide calculators delen de rekenmotor, maar hebben onafhankelijke datums,
invoer en resultaten en unieke invoerveld-ID's. Een ongeldig mandje of een
ontbrekende Revtool-momentopname blokkeert de standaardcalculator niet.

Beide tonen altijd een herkenbaar resultaatblok na het laden van de
S/s-data. De datums zijn bij het openen bewust nog leeg: er wordt geen
contractdatum verondersteld. Zolang invoer ontbreekt of ongeldig is, vermeldt
het blok de concrete reden in plaats van te verdwijnen. Bij geldige invoer
worden de herziene prijs en het verschil automatisch getoond; er is geen
aparte berekenknop nodig. De brongegevens vermelden de beschikbare
materiaalmaanden. Buiten de beschikbare gegevens wordt geen waarde
verzonnen of stilzwijgend vervangen.

De bestaande PPI-componenten komen uit het actuele officiele I-2021-bestand.
Een afzonderlijk, bewust uit te voeren exportcommando maakt de extra
Revtool-materiaaldata beschikbaar:

```bash
python apps/prijsherziening-index-i-2021/scripts/export_revtool_materials.py
```

Dit kiest standaard de nieuwste gedateerde extractiemap en schrijft
`public/data/revtool_materials.json`. Met `--extraction` en `--output` kunnen
andere locaties worden gekozen. De exporter controleert de CSV-hash tegen
het extractiemanifest voordat hij de uitvoer overschrijft.

Voor een nieuwe versie is de volgorde dus:

```bash
python apps/prijsherziening-index-i-2021/scripts/extract_revtool.py
python apps/prijsherziening-index-i-2021/scripts/export_revtool_materials.py
```

De materiaalexport bevat uitsluitend positieve, opgeslagen maandwaarden van
O.W. en Grymafer, met bronwerkmap, SHA-256, snapshotdatum, tabel, werkblad
en celadressen. Wekelijkse waarden, lonen, prognosetabellen, ontbrekende
waarden en maanden na de datum in de bestandsnaam worden niet overgenomen.
O.W. begint bewust pas in december 2023: er wordt geen automatische
koppeling over de publicatiewijziging heen gemaakt. Stopgezette reeksen
worden niet doorgetrokken. Ontbrekende waarden krijgen geen nul of oudere
waarde als vervanging.

Dit JSON-bestand wordt wel mee gepubliceerd met de app; de oorspronkelijke
Excel, VBA, Power Query en volledige extractie blijven lokaal. De interface
vermeldt expliciet dat de extra reeksen een opgeslagen momentopname zijn,
niet onafhankelijk als actuele publicaties bevestigd. De normale
I-2021/S-s-updates blijven afzonderlijk werken: ze verversen dit snapshot
niet automatisch. Controleer bij iedere nieuwe versie ook bronvoorwaarden,
definities en eventuele basiswijzigingen voordat de materiaalexport wordt
vrijgegeven. Schemawijzigingen mogen niet met een stille standaard worden
opgevangen.

### Reken- en datumregels

- Invoergewichten zijn percentages. Het vaste aandeel is automatisch
  `1 - loonaandeel - materiaalaandeel`; een negatief vast aandeel blokkeert
  de berekening.
- De gewichten binnen het materiaalmandje tellen op tot 100%. Het effectieve
  gewicht in de totale prijs is `materiaalaandeel * mandgewicht`.
  Zo gebruikt dezelfde rekenmotor zowel absolute als geneste gewichten.
- Materiaalreferenties zijn de **maand voor** de contract-/aanbestedingsdatum
  en de herzieningsdatum. Dit is een expliciete wijziging ten opzichte van
  de vroegere calculator, die de gekozen kalendermaand gebruikte.
- De S/s-selectie blijft gebaseerd op de gepubliceerde geldigheidsperiodes.
  Grote S gebruikt de afzonderlijke aanbestedingsingangsdatum. Er worden
  niet nogmaals tien dagen afgetrokken. De historische PDF bevat onder meer
  voor oktober 2017 een afwijkende S-datum; die wordt niet stilzwijgend
  vervangen door een veronderstelde tien-dagenregel.
- Zoals in Revtool worden de afzonderlijke indexveranderingen op vijf
  decimalen afgerond, vervolgens de resultaatfactor op vijf decimalen en
  het herziene bedrag op twee decimalen. Halve waarden worden van nul af
  afgerond. Het vaste aandeel verandert niet.
- Componenten met gewicht nul vereisen geen indexwaarden. Positief gewogen
  componenten met ontbrekende, nul-, negatieve of niet-eindige indexwaarden
  blokkeren de berekening. Dubbele materiaalreeksen worden geweigerd.
- Het resultaatdetailscherm toont de referentiemaanden, bronwaarden,
  effectieve aandelen, bijdragen in procentpunten en de afzonderlijke
  afrondingscorrectie. De calculator past geen juridische contractregels
  automatisch toe en is geen juridisch advies.

### S-grafiek en datumkeuze

Het dashboard bevat twee afzonderlijke grafieken:

- De I-grafiek selecteert standaard uitsluitend **Index I-2021**, niet
  de onderzoeksreeks voor cement. De bestaande componentselectie blijft
  beschikbaar.
- De S-grafiek toont standaard **minder dan 10 werknemers, categorie A**.
  De filters "Aantal werknemers (werklieden)" en "Categorie" laten meerdere
  selecties toe. Elke combinatie is een eigen reeks, met een vaste kleur
  en lijnstijl ongeacht de andere geselecteerde reeksen.

De S-grafiek gebruikt dezelfde bron, categorieen en werkgeversklassen als de
calculator. Grote S staat op de gepubliceerde ingangsdatum voor
aanbestedingen, niet op de ingangsdatum van kleine s. De verticale as toont
eurobedragen, geen genormaliseerde index met basis 100. De lijn is een
traplijn: waarden blijven alleen binnen hun gedocumenteerde
geldigheidsperiode gelden; ontbrekende periodes worden niet overbrugd.
De begeleidende tabel bevat alle geselecteerde bronwaarnemingen met links
naar de fysieke PDF-pagina's. De historische gezamenlijke werkgeversklasse
van minstens 10 werklieden blijft volgens de bestaande calculatorselectie
beschikbaar in beide grotere werkgeversreeksen.

In de calculator zijn de twee datums rechtstreeks instelbaar met aparte
keuzes voor dag, maand en jaar, zonder maand per maand terug te bladeren.
De jaren starten bij 2007; de bestaande validatie voor offerten vanaf
11/06/2007 blijft gelden. Een onvolledige datum geeft geen berekening.
Bij verandering naar een kortere maand of een niet-schrikkeljaar wordt de
dag begrensd op de laatste geldige dag van de maand. De geselecteerde
volledige datum wordt onder de keuzes getoond. De reken- en
referentiemaandregels veranderen hierdoor niet.

### Validatie

```bash
python -m unittest discover -s tests -p 'test_prijsherziening_*.py' -v
node --test tests/test_prijsherziening_dates.cjs
pnpm --filter prijsherziening-index-i-2021 typecheck
```

De standaardberekening en het particuliere materiaalmandje worden getoetst
aan opgeslagen Excel-voorbeelden, ook met een onafhankelijke Python
Decimal-berekening. De openbare voorbeeldformule bevat een positief gewogen
handmatige staalcomponent met nulwaarden die Excel als nul verandering
behandelt. De calculator wijkt daar bewust van af en meldt ontbrekende of
ongeldige invoer in plaats van een schijnbaar geldige prijs te tonen.

Controleer bij interfacewijzigingen ook in de browser:

- Bij openen hebben beide calculators een resultaatblok met de vraag om
  twee datums; alleen de calculator op maat heeft een materiaalkeuze.
- Met minder dan 10 werklieden, categorie A, contractdatum 01/06/2025,
  herzieningsdatum 01/06/2026, prijs 100000 en loon-/materiaalaandelen
  40%/40% tonen beide met I-2021 een herziene prijs van 103945.
- Verander alleen het mandje van de calculator op maat: de standaardprijs
  blijft ongewijzigd. Een ongeldig totaal toont de reden in het resultaatblok.
- Controleer ook ontbrekende materiaalmaanden, onafhankelijke
  datum-/prijsvelden, unieke ID's en de mobiele breedte.
