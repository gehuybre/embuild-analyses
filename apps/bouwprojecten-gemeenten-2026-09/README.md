# Gemeentelijke bouwprojecten, versie september 2026

Deze aparte app bewaart de vorige versie van
[bouwprojecten-gemeenten](../bouwprojecten-gemeenten/) en haar embeds.
Het portaal groepeert beide apps via
[analysis-versions.json](../../scripts/analysis-versions.json), met september
2026 als standaard.

- Pagina: `/analyses/bouwprojecten-gemeenten-2026-09/`
- Embed: `/analyses/bouwprojecten-gemeenten-2026-09/embed/bouwprojecten-gemeenten-2026-09/projectbrowser/`
- Oude pagina en embeds: ongewijzigd.

## Bron en verwerking

Het bestand `../bouwprojecten-gemeenten/data/update september 2026.xlsx`
bevat de meest recente meerjarenplannen met rapportjaar 2026 voor Gemeente en
OCMW. De filters in cel A1 selecteren investeringsuitgaven en sluiten
financiele en immateriele vaste activa uit. De naam van het bestand duidt de
versie aan; de officiele publicatiedatum is niet vastgesteld.

Vanuit `analyses/`, met de bestaande Python-omgeving (`pandas`, `openpyxl`):

```bash
python apps/bouwprojecten-gemeenten/scripts/convert_project_update.py \
  --output apps/bouwprojecten-gemeenten-2026-09/data/data.csv
python apps/bouwprojecten-gemeenten-2026-09/scripts/process_project_details.py
pnpm --filter bouwprojecten-gemeenten-2026-09 build
```

De converter koppelt gemeentenaam aan NIS-code via de vorige bron en neemt
beleidsvelden alleen over bij een eenduidige match op NIS-code + actiecode.
`data/data_unclassified.csv` bevat de acties zonder zo'n match. Dit zijn
geerfde classificaties, niet opnieuw vastgestelde beleidsvelden. Er wordt
nooit een actiecode van een andere gemeente gebruikt.

De verwerking is een snapshot van de oude projectlogica: positieve
uitgavenregels met een actieomschrijving worden samengevoegd op gemeente +
actiecode. Negatieve en nulregels tellen niet mee in de getoonde totalen.
Daardoor kan het projecttotaal hoger zijn dan de netto som van de export.
Een actie is niet noodzakelijk een afzonderlijke bouwopdracht; de export
bevat ook andere investeringsuitgaven.

Boekjaren 2032 en 2033 blijven behouden in de totalen, zoals in de oude versie.
De projectbrowser toont afzonderlijke jaren 2026-2031.

Bedragen per inwoner gebruiken de mediane bevolkingsverhouding uit de
septemberversie van gemeentelijke investeringen (`Totaal / Per_inwoner`),
bij voorkeur rapportjaar 2026. De plausibiliteitsgrens laat ook gemeenten
onder 1.000 inwoners toe, zodat Herstappe niet als ontbrekend wordt behandeld.

Ruwe data en conversierapporten blijven lokaal en genegeerd door Git. De
gegenereerde JSON-bestanden onder `public/data/` worden gepubliceerd.
`public/data/source_snapshot.json` bevat de SHA-256-vingerafdrukken van de
Excel, de conversie en de vorige referentie-CSV, met de berekende kerncijfers.
Het script vereist expliciet de september-CSV en overschrijft die niet op
basis van tijdstempels van een ander werkboek.

## Controles

[test_bouwprojecten_september.py](../../tests/test_bouwprojecten_september.py)
controleert de gegenereerde JSON, bedragen, gemeenten, indelingen en
versie-isolatie. Vanuit `analyses/`:

```bash
python -m unittest discover -s tests -p 'test_bouwprojecten_september.py'
node scripts/validate_embed_consistency.js --slug bouwprojecten-gemeenten-2026-09 --built
```
