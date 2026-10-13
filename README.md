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
python apps/bouwprojecten-gemeenten/scripts/convert_project_update.py
```

The [converter](apps/bouwprojecten-gemeenten/scripts/convert_project_update.py)
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
| bouwprojecten-gemeenten | Gemeentelijke bouwprojecten Vlaanderen 2026-2031 | 3041 | MDX |
| bouwprojecten-gemeenten-2026-09 | Gemeentelijke bouwprojecten Vlaanderen 2026-2031 | 3045 | MDX |
| energiekaart-premies | Energiepremies Vlaanderen | 3053 | MDX |
| epc-labelverdeling | EPC-labelverdeling in Vlaanderen | 3050 | MDX, Maps |
| faillissementen | Faillissementen in de bouwsector | 3042 | MDX |
| gebouwenpark | Gebouwenpark 2025 | 3089 | MDX |
| gemeentelijke-investeringen | Gemeentelijke investeringen in Vlaanderen | 3064 | MDX, Maps |
| gemeentelijke-investeringen-2026-09 | Gemeentelijke investeringen in Vlaanderen | 3065 | MDX, Maps |
| gip-projecten | Geïntegreerd Investeringsprogramma 2025-2029 | 3002 | MDX |
| huishoudensgroei | Huishoudensgroei per gemeente | 3040 | MDX, Maps |
| inschrijvingen-onderwijs | Inschrijvingen in het hoger onderwijs in Vlaanderen | 3086 | MDX, Maps |
| nbb-rente | Hypothecaire rente in België | 3082 | MDX |
| portal | portal | 3000 | — |
| prijsherziening-index-i-2021 | Prijsherzieningsindex I 2021 | 3041 | MDX |
| silc-energie-2023 | SILC 2023: Energie-efficiëntie van Huishoudens in België | 3058 | MDX, Maps |
| starters-stoppers | Starters en stoppers | 3096 | MDX |
| vastgoed-verkopen | Verkoop van vastgoed in België | 3061 | MDX, Maps |
| vergunningen-aanvragen | Vergunningen voor woningen | 3007 | MDX |
| vergunningen-goedkeuringen | Vergunningen goedkeuringen | 3087 | MDX |
<!-- /AUTO:apps-table -->

## Shared package

`@embuild/shared` (`packages/embuild-shared/`) exports UI primitives, analysis components, and utilities.

<!-- AUTO:shared-components -->
**UI primitives** (`components/ui/`): `alert`, `badge`, `button`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `separator`, `skeleton`, `table`, `tabs`

**Analysis components** (`components/shared/`): `AnalysisLayout`, `AnalysisSection`, `ArrondissementMap`, `DeployVersionGuard`, `DumbbellChart`, `EmbedAutoResize`, `EmbedErrorBoundary`, `EmbedParentResizeListener`, `EmbeddableSection`, `ExportButtons`, `FilterableChart`, `FilterableTable`, `GeoContext`, `GeoFilter`, `GeoFilterInline`, `HierarchicalFilter`, `HorizontalBarChart`, `MapControls`, `MapLegend`, `MapSection`, `MapWithCustomGeo`, `MunicipalityMap`, `MunicipalitySearch`, `PeriodComparisonSection`, `PressReferences`, `TimeSeriesSection`, `TimeSlider`

**Lib modules** (`lib/`): `analysis-defaults`, `bouwprojecten-data`, `chart-theme`, `embed-config`, `embed-data-constraints`, `embed-data-registry`, `embed-data-transformers`, `embed-path-validation`, `embed-types`, `filter-validation`, `geo-utils`, `investeringen-data`, `map-utils`, `name-utils`, `nis-fusion-utils`, `number-formatters`, `path-utils`, `press-utils`, `quarterly-narrative`, `sector-short-labels`, `use-is-embed-route`, `use-json-bundle`, `utils`
<!-- /AUTO:shared-components -->

## Scripts

<!-- AUTO:scripts-catalog -->
| Script | Purpose |
| --- | --- |
| `check-data-migration.js` |  |
| `check-data-migration.ts` | Script to verify migration from old data locations to new split repo system |
| `check_remote_metadata.py` | Check if remote data has changed by comparing ETag and Last-Modified headers. |
| `compare_output_sizes.py` | Compare file sizes for CSV, indexed CSV, and Parquet outputs for the investments analysis. |
| `concat_docs.py` | Concatenate all markdown-like files under a docs directory into one output file. |
| `export_data_repo.py` |  |
| `generate-docs.mjs` | Scans the codebase and injects auto-generated sections into markdown files. |
| `generate-portal-data.mjs` | Reads metadata from each analysis app's src/app/page.tsx and generates |
| `generate_province_map.py` | Generate province-level GeoJSON from municipality-level data. |
| `generate_triage.js` |  |
| `inspect_remaining_overige.py` |  |
| `library_audit.js` | A small heuristic library audit script. |
| `merge-outputs.mjs` | Merges the static outputs of all apps into a single directory |
| `reclassify_bouwprojects.py` |  |
| `reclassify_write_results.py` |  |
| `save_remote_metadata.py` | Save remote metadata (URL, ETag, Last-Modified, SHA256) to a JSON file. |
| `update_analysis_data_status.py` | Sync visible blog metadata with the latest available dataset period and bump the blog date when the data period changes. |
| `update_publication_date.py` | Scrape publication date from Statbel pages and update analysis metadata files. |
| `update_publication_dates_from_calendar.py` | Update Statbel analysis frontmatter using the Statbel publication calendar. |
| `update_vergunningen_goedkeuringen_content.py` | Sync vergunningen-goedkeuringen MDX copy with the latest generated dataset period. |
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
> **17 scripts** still reference the deleted `embuild-analyses/` path and need updating:

> - `check-data-migration.js`
> - `check-data-migration.ts`
> - `compare_output_sizes.py`
> - `export_data_repo.py`
> - `generate_province_map.py`
> - `inspect_remaining_overige.py`
> - `library_audit.js`
> - `reclassify_bouwprojects.py`
> - `reclassify_write_results.py`
> - `update_publication_date.py`
> - `update_publication_dates_from_calendar.py`
> - `update_vergunningen_goedkeuringen_content.py`
> - `validate_embed_consistency.js`
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
