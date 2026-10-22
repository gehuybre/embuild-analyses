# Embuild Analyses

Link naar website: https://analyses-u.pages.dev
Turborepo monorepo with 20 data-driven analysis apps + 1 portal, deployed as static sites to Cloudflare Pages.

## Quick start

```bash
pnpm turbo build              # build all 21 apps
node scripts/merge-outputs.mjs # assemble dist/
npx serve dist -p 5000         # local preview
```

`merge-outputs.mjs` automatically refreshes portal metadata and rebuilds `portal` when an analysis metadata change would otherwise leave the homepage stale. Supported data-driven apps also run a `prebuild` sync that updates the visible blog date and `dataAvailabilityLabel` from the latest local dataset before each build.

See [BUILD_COMMANDS.md](BUILD_COMMANDS.md) for more commands.

## Convert municipal project updates

From `analyses/`, using the Python environment with the existing `pandas` and
`openpyxl` dependencies:

```bash
python apps/bouwprojecten-gemeenten/versions/previous/scripts/convert_project_update.py
```

The [converter](apps/bouwprojecten-gemeenten/versions/previous/scripts/convert_project_update.py)
reads `data/update september 2026.xlsx` and writes
`data/update september 2026.csv` in the same schema as `data/data.csv`
(UTF-8, semicolon-separated, decimal commas, quoted multiline descriptions).
It maps municipality names to NIS codes using `data/data.csv` and retains policy
fields only for an unambiguous match on **NIS code + action code**. It never
borrows classifications from a different municipality. Missing or conflicting
classifications remain empty and are listed in
`data/update september 2026_unclassified.csv`; the app will show these as
`Overige` until reviewed. Retained classifications come from the previous export,
not from the September workbook.

Use `--reference PATH` and `--output PATH` for other reference/output CSV files,
or pass another workbook as the positional argument. Existing outputs require
`--overwrite`; input files cannot be overwritten. Unknown municipalities,
invalid amounts/years, non-2026 reports, and duplicate municipality/action/year
rows fail validation before output is written. Zero and negative amounts, and
book years beyond 2031, are preserved as in the source.

This command does **not** replace `data/data.csv`, regenerate public JSON, or
publish the blog. Review the classification report before activating the update.
The existing project pipeline may regenerate `data.csv` from `data-79.xlsx`
based on file timestamps; an eventual activation must update that source-selection
step as well.

Run the focused regression tests with:

```bash
python -m unittest discover -s tests -p test_convert_project_update.py
```

## Apps

<!-- AUTO:apps-table -->
| Slug | Title | Dev Port | Features |
| --- | --- | --- | --- |
| arbeiders-bedienden | Arbeiders en bedienden in de bouw | 3001 | MDX |
| bedrijventerreinen-vlaanderen | Bezettingsgraad van bedrijventerreinen in Vlaanderen | 3031 | MDX, Maps |
| betaalbaar-arr | Betaalbaar wonen per arrondissement | 3044 | MDX |
| bouwondernemers | Bouwondernemers | 3066 | MDX |
| bouwprojecten-gemeenten-2026-09 | Gemeentelijke bouwprojecten Vlaanderen 2026-2031 | 3045 | MDX |
| bouwprojecten-gemeenten | Gemeentelijke bouwprojecten Vlaanderen 2026-2031 | 3041 | MDX |
| energiekaart-premies | Energiepremies Vlaanderen | 3053 | MDX |
| epc-labelverdeling | EPC-labelverdeling in Vlaanderen | 3050 | MDX, Maps |
| faillissementen | Faillissementen in de bouwsector | 3042 | MDX |
| fin-indicatoren | Financiële indicatoren in de bouwsector | 3091 | MDX |
| gebouwenpark | Gebouwenpark 2025 | 3089 | MDX |
| gemeentelijke-investeringen-2026-02 | Gemeentelijke investeringen in Vlaanderen | 3112 | MDX, Maps |
| gemeentelijke-investeringen | Gemeentelijke investeringen in Vlaanderen | 3064 | MDX, Maps |
| gemeentelijke-investeringen-2026-09 | Gemeentelijke investeringen in Vlaanderen | 3065 | MDX, Maps |
| gemeentelijke-investeringen-2026-10 | Gemeentelijke investeringen in Vlaanderen | 3067 | — |
| gemeentelijke-investeringen-vergelijking | Gemeentelijke investeringen: vergelijking van MJP's | 3110 | — |
| gip-projecten | Geïntegreerd Investeringsprogramma MOW | 3002 | MDX |
| huishoudensgroei | Huishoudensgroei per gemeente | 3040 | MDX, Maps |
| inschrijvingen-onderwijs | Inschrijvingen in het hoger onderwijs in Vlaanderen | 3086 | MDX, Maps |
| nbb-rente | Hypothecaire rente in België | 3082 | MDX |
| portal | portal | 3000 | — |
| prijsherziening-index-i-2021 | Prijsherzieningsindex I 2021 | 3041 | MDX |
| silc-energie-2023 | SILC 2023: Energie-efficiëntie van Huishoudens in België | 3058 | MDX, Maps |
| sociaal-wonen | Sociale huurplanning per woonmaatschappij | 3097 | — |
| starters-stoppers | Starters en stoppers | 3096 | MDX |
| vacatures | Vacatures in de bouw | 3043 | — |
| vastgoed-verkopen | Verkoop van vastgoed in België | 3061 | MDX, Maps |
| vergunningen-aanvragen | Vergunningen voor woningen | 3007 | MDX |
| vergunningen-goedkeuringen | Vergunningen goedkeuringen | 3087 | MDX |
<!-- /AUTO:apps-table -->

## Gemeentelijke investeringen per boekjaar

### Centrale brondata en versiearchief

Nieuwe BBC-DR- en andere bronbestanden voor gemeentelijke investeringen gaan
altijd naar `data/gemeentelijke-investeringen/inbox/`. Archiveer de bestanden
vóór verwerking met een versiecode:

```bash
python3 scripts/archive_investment_data.py 2026-11
```

De opdracht kopieert de inboxbestanden naar
`data/gemeentelijke-investeringen/versions/YYYY-MM/raw/`, maakt of actualiseert
een `manifest.json` met SHA-256, bestandsgrootte en archiveringsdatum, en laat
de inbox intact. Vul exportdatum, bron, filters en notities aan als die
informatie bekend is. Maak de inbox na controle handmatig leeg voordat
bestanden voor een andere versie worden aangeleverd. Bestanden met dezelfde
naam maar andere inhoud worden nooit overschreven; geef een nieuwe export dan
een nieuwe bestandsnaam. Gebruik een nieuwe maandcode voor een nieuwe
bronversie, zodat historische input onveranderd blijft.

De apps van februari, mei, september en oktober lezen hun invoer uit hun eigen
centrale versiearchief. Hun app-code, resultaten en gepubliceerde URL's blijven
gescheiden. Brongegevens zijn lokaal en worden niet naar Git gecommit. Zie
[`data/README.md`](data/README.md) voor het volledige proces en de structuur.

### App-versies en standalone builds

Analysefamilies met meerdere publicaties staan gegroepeerd in
`apps/<familie>/versions/<versie>/`. Dit geldt momenteel voor
[gemeentelijke investeringen](apps/gemeentelijke-investeringen/) en
[bouwprojecten per gemeente](apps/bouwprojecten-gemeenten/). De app-namen in
`package.json`, de versiekiezer en bestaande `/analyses/<slug>/`-URL's blijven
stabiel. `pnpm-workspace.yaml` en de app-registry ontdekken geneste versies
automatisch.

Nieuwe versies van andere analyses volgen hetzelfde model zodra er een tweede
publicatie nodig is: maak een familiemap met `versions/`, plaats de versie-app
daaronder, behoud de app-slug voor de publicatie-URL en voeg die toe aan
`scripts/analysis-versions.json`. Houd de vorige map en de verwerkte data
ongewijzigd.

Elke gewijzigde analyse bouwt in CI ook een standalone-export naast de gewone
site-export. Die staat in het `dist-standalone`-workflowartifact; elke appmap
bevat een `README.md` met de voorgestelde Cloudflare Pages-projectnaam en
`https://<project>.pages.dev/`. Er wordt niet automatisch naar Cloudflare
gedeployed. Lokaal kan dezelfde export gemaakt worden met
`pnpm build:standalone -- <app-slug>`.

De [versie oktober 2026](apps/gemeentelijke-investeringen/versions/2026-10/README.md)
voegt vergelijkingen met jaarrekeningen en origineel beginkrediet toe, op basis
van de volledige economische exports met dezelfde bouwscope. De nieuwe
BV-export is afgekapt en niet op bouw te filteren; die wordt niet gebruikt.
Het portaal toont de versies via een dropdown, met oktober als standaard.

De apps `gemeentelijke-investeringen` (mei) en `gemeentelijke-investeringen-2026-09`
(september) tonen elk een jaargrafiek voor heel Vlaanderen, met tabel, CSV-export
en embed via `investments-bv-yearly`. De gedeelde component
[InvesteringenYearlySection](packages/embuild-shared/src/components/shared/InvesteringenYearlySection.tsx)
leest per app `public/data/bv_yearly_totals.json`.

De bestaande `scripts/prepare_visualizations.py` van elke app genereert dat bestand
uit de eigen `investments_bv.parquet`: som van `Totaal` over gemeenten en
beleidsvelden, per `Boekjaar`. Alleen boekjaren binnen het bijbehorende rapportjaar
tellen mee: 2014-2019 uit plan 2014, 2020-2025 uit plan 2020 en 2026-2031 uit
plan 2026. Overlappende jaren uit andere plannen en boekjaren na 2031 worden dus
niet opgeteld. Dit zijn geplande uitgaven binnen de bestaande BV-scope, geen
gerealiseerde investeringen of bijkomend voor inflatie gecorrigeerde bedragen.
De twee bronversies worden niet vermengd. Ontbrekende boekjaren geven een
validatiefout in plaats van een misleidend nulbedrag.

Validatie vanuit `analyses/`, met de bestaande pandas/parquet-omgeving:

```bash
python -m unittest discover -s tests -p test_investeringen_yearly.py
pnpm --filter gemeentelijke-investeringen --filter gemeentelijke-investeringen-2026-09 typecheck
```

## Shared package

`@embuild/shared` (`packages/embuild-shared/`) exports UI primitives, analysis components, and utilities.

<!-- AUTO:shared-components -->
**UI primitives** (`components/ui/`): `alert`, `badge`, `button`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `separator`, `skeleton`, `table`, `tabs`

**Analysis components** (`components/shared/`): `AnalysisLayout`, `AnalysisSection`, `ArrondissementMap`, `DeployVersionGuard`, `DumbbellChart`, `EmbedAutoResize`, `EmbedErrorBoundary`, `EmbedParentResizeListener`, `EmbeddableSection`, `ExportButtons`, `FilterableChart`, `FilterableTable`, `GeoContext`, `GeoFilter`, `GeoFilterInline`, `HierarchicalFilter`, `HorizontalBarChart`, `InvesteringenYearlySection`, `MapControls`, `MapLegend`, `MapSection`, `MapWithCustomGeo`, `MunicipalityMap`, `MunicipalitySearch`, `PeriodComparisonSection`, `PressReferences`, `TimeSeriesSection`, `TimeSlider`

**Lib modules** (`lib/`): `analysis-defaults`, `bouwprojecten-data`, `chart-theme`, `embed-config`, `embed-data-constraints`, `embed-data-registry`, `embed-data-transformers`, `embed-path-validation`, `embed-types`, `filter-validation`, `geo-utils`, `investeringen-data`, `map-utils`, `name-utils`, `nis-fusion-utils`, `number-formatters`, `path-utils`, `press-utils`, `quarterly-narrative`, `sector-short-labels`, `use-is-embed-route`, `use-json-bundle`, `utils`
<!-- /AUTO:shared-components -->

## Scripts

<!-- AUTO:scripts-catalog -->
| Script | Purpose |
| --- | --- |
| `ai_press_review.py` | AI-powered press release relevance assessment using the Claude API. |
| `app-registry.mjs` |  |
| `apply_press_review_queue.py` |  |
| `archive_investment_data.py` | Archive files from the municipal-investments inbox under a YYYY-MM version. |
| `build-apps.mjs` |  |
| `build-single-app-preview.mjs` |  |
| `build-standalone-app.mjs` |  |
| `build-standalone-apps.mjs` |  |
| `build_press_review_queue.py` |  |
| `check-data-migration.js` |  |
| `check-data-migration.ts` | Script to verify migration from old data locations to new split repo system |
| `check-standalone-sync.mjs` | Controleert dat de site-versie (basePath /analyses/<slug>) en de standalone versie (basePath "") |
| `check_remote_metadata.py` | Check if remote data has changed by comparing ETag and Last-Modified headers. |
| `check_reviewed_press_references.py` |  |
| `compare_output_sizes.py` | Compare file sizes for CSV, indexed CSV, and Parquet outputs for the investments analysis. |
| `concat_docs.py` | Concatenate all markdown-like files under a docs directory into one output file. |
| `detect-changed-apps.mjs` |  |
| `export_data_repo.py` |  |
| `generate-docs.mjs` | Scans the codebase and injects auto-generated sections into markdown files. |
| `generate-portal-data.mjs` | Reads metadata from each analysis app's src/app/page.tsx and generates |
| `generate_basic_auth_secret.py` | Generate a Cloudflare BASIC_AUTH_SESSION_SECRET value. |
| `generate_province_map.py` | Generate province-level GeoJSON from municipality-level data. |
| `generate_triage.js` |  |
| `inspect_remaining_overige.py` |  |
| `keyword_press_review.py` | Keyword-based press release relevance assessment. |
| `library_audit.js` | A small heuristic library audit script. |
| `merge-outputs.mjs` | Merges the static outputs of all apps into a single directory |
| `reclassify_bouwprojects.py` |  |
| `reclassify_write_results.py` |  |
| `resolve_statbel_bankruptcies_url.py` | Resolve the freshest Statbel bankruptcies ZIP URL. |
| `save_remote_metadata.py` | Save remote metadata (URL, ETag, Last-Modified, SHA256) to a JSON file. |
| `site-apps.mjs` | Apps met `"publishToSite": false` in hun package.json staan niet op de gedeelde Cloudflare-site |
| `update_analysis_data_status.py` | Sync visible analysis metadata with the latest available dataset period. |
| `update_press_references.py` |  |
| `update_publication_date.py` | Scrape publication date from Statbel pages and update analysis metadata files. |
| `update_publication_dates_from_calendar.py` | Update Statbel analysis frontmatter using the Statbel publication calendar. |
| `update_vergunningen_goedkeuringen_content.py` | Sync vergunningen-goedkeuringen MDX copy with the latest generated dataset period. |
| `upload_statbel_bouwvergunningen_cache.sh` | Upload a fresh Statbel building permits ZIP to the GitHub Release cache and trigger the workflow. |
| `validate_component_usage.py` | Compatibility shim that delegates to the canonical validation script kept under |
| `validate_embed_consistency.js` |  |
| `validate_mdx.py` | Compatibility shim that delegates to the canonical validation script kept under |
| `agent/check_embed_config.py` |  |
| `agent/check_nis_codes.py` |  |
| `agent/preflight.py` |  |
| `agent/run_qa.sh` |  |
| `agent/validate_results.py` |  |
<!-- /AUTO:scripts-catalog -->

<!-- AUTO:stale-scripts -->
> **14 scripts** still reference the deleted `embuild-analyses/` path and need updating:

> - `check-data-migration.js`
> - `check-data-migration.ts`
> - `compare_output_sizes.py`
> - `generate_province_map.py`
> - `inspect_remaining_overige.py`
> - `library_audit.js`
> - `reclassify_bouwprojects.py`
> - `reclassify_write_results.py`
> - `update_publication_dates_from_calendar.py`
> - `upload_statbel_bouwvergunningen_cache.sh`
> - `agent/check_embed_config.py`
> - `agent/check_nis_codes.py`
> - `agent/preflight.py`
> - `agent/validate_results.py`
<!-- /AUTO:stale-scripts -->

## Docs

- [Architecture](docs/ARCHITECTURE.md) — monorepo layout, build pipeline, design decisions
- [Adding an analysis](docs/ADDING-AN-ANALYSIS.md) — step-by-step guide
- [Deployment](docs/DEPLOYMENT.md) — Cloudflare Pages setup and CI
- [Build commands](BUILD_COMMANDS.md) — common commands reference
