# Gemeentelijke investeringen, MJP-vergelijking

De pagina scheidt twee vergelijkingen:

- **Wijzigingen in MJP 2026**: de mei- en septemberversie vergelijken per boekjaar, beleidsdomein, beleidsveld, gemeente en economische rekening.
- **Vergelijk de MJP's**: de plannen 2014, 2020 en 2026 vergelijken per jaar van hun zesjarige legislatuur, op basis van de septemberversie.

- Pagina: `/analyses/gemeentelijke-investeringen-vergelijking/`
- Data: `public/data/comparison.json`, gebouwd met `python3 scripts/build_comparison_data.py` uit de parquet-bestanden van
  mei en september (enkel boekjaren binnen de legislatuur, nominale bedragen). De MJP-totalen komen uit de septemberdata.
  Draai het opnieuw na elke nieuwe export.
- Portaal: geen eigen kaart, maar een link op de kaart van de versiegroep (`scripts/analysis-versions.json`, veld `comparison`)

De bedragen zijn geplande nominale investeringsuitgaven, geen realisaties en niet gecorrigeerd voor inflatie. De
mei- en septemberversie hebben volgens hun filters dezelfde BV-scope (inclusief I.1.B.2.a).
