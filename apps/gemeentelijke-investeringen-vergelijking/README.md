# Gemeentelijke investeringen, vergelijking van versies

Vergelijkt de drie versies van de analyse per rapportjaar, boekjaar, beleidsdomein, beleidsveld, gemeente en economische
rekening, voor de paren februari-mei, mei-september en februari-september:

- februari 2026: `../gemeentelijke-investeringen-2026-02` (reconstructie uit de exports van januari 2026)
- mei 2026: `../gemeentelijke-investeringen`
- september 2026: `../gemeentelijke-investeringen-2026-09`

- Pagina: `/analyses/gemeentelijke-investeringen-vergelijking/`
- Data: `public/data/comparison.json`, gebouwd met `python3 scripts/build_comparison_data.py` uit de parquet-bestanden van
  de drie versies (enkel boekjaren binnen de legislatuur, nominale bedragen). Draai het opnieuw na elke nieuwe export.
- Portaal: geen eigen kaart, maar een link op de kaart van de versiegroep (`scripts/analysis-versions.json`, veld `comparison`)
- Een vierde versie toevoegen: voeg ze toe aan `VERSIONS` en `PAIRS` in het script.

Bevindingen die de pagina toont: volgens de filters hebben alle versies dezelfde scope (incl. I.1.B.2.a). Na de correctie
van een verwerkingsfout (zie `../gemeentelijke-investeringen-2026-09/README.md`, "Correctie van de versie van mei 2026")
zijn februari en mei voor 2014 en 2020 op de euro gelijk en wijkt september 0,13% af. In 2026 komen de verschillen uit
datawijzigingen: de februariversie mist drie gemeenten en veel plannen werden daarna aangepast (vermoeden, niet bewezen).
