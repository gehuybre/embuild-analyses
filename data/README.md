# Centrale brondata

Nieuwe bronbestanden voor gemeentelijke investeringen gaan altijd eerst naar
`gemeentelijke-investeringen/inbox/`. Archiveren gebeurt daarna naar een
afzonderlijke versie; de verwerkingsscripts lezen uitsluitend uit dat archief.

```text
data/gemeentelijke-investeringen/
  inbox/                    # Nieuwe bestanden aanleveren
  versions/
    YYYY-MM/
      raw/                  # Ongewijzigde bronbestanden voor die versie
      manifest.json         # SHA-256, bestandsgrootte en archiveringsdatum
```

Vanuit `analyses/` archiveer je de huidige inboxbestanden met:

```bash
python3 scripts/archive_investment_data.py 2026-10
```

Gebruik de datum van de bronversie als argument, bijvoorbeeld `2026-11` voor
een nieuwe novemberversie. De opdracht kopieert bestanden en overschrijft geen
verschillende bestanden met dezelfde naam. Hernoem een nieuw exportbestand bij
een naamconflict. De inbox blijft intact; controleer het archief en maak de
inbox daarna handmatig leeg voordat je bestanden voor een volgende versie
aanlevert. Het archief registreert per bestand SHA-256 en bestandsgrootte.
Vul in `manifest.json` daarna `metadata.export_date`, `source`, `filters` en
`notes` aan als die informatie bekend is. Onbekende waarden blijven leeg en
worden niet geraden.

Historische versies blijven apart en worden niet overschreven. Apps en hun
gegenereerde publicatiedata blijven in `apps/`; alleen de invoerbestanden staan
centraal. Brongegevens worden lokaal gehouden en niet naar Git gecommit.
