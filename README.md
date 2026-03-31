# Embuild Analyses

Turborepo monorepo with 20 data-driven analysis apps + 1 portal, deployed as static sites to Cloudflare Pages.

## Quick start

```bash
pnpm turbo build              # build all 21 apps
node scripts/merge-outputs.mjs # assemble dist/
npx serve dist -p 5000         # local preview
```

See [BUILD_COMMANDS.md](BUILD_COMMANDS.md) for more commands.

## Apps

<!-- AUTO:apps-table -->
| Slug | Title | Dev Port | Features |
| --- | --- | --- | --- |
| arbeiders-bedienden | Arbeiders en bedienden in de bouw | 3001 | MDX |
| bedrijventerreinen-vlaanderen | Bezettingsgraad van bedrijventerreinen in Vlaanderen | 3031 | MDX, Maps |
| betaalbaar-arr | Betaalbaar wonen per arrondissement | 3044 | MDX |
| bouwondernemers | Bouwondernemers | 3066 | MDX |
| bouwprojecten-gemeenten | Gemeentelijke bouwprojecten Vlaanderen 2026-2031 | 3041 | MDX |
| energiekaart-premies | Energiepremies Vlaanderen | 3053 | MDX |
| epc-labelverdeling | EPC-labelverdeling in Vlaanderen | 3050 | MDX, Maps |
| faillissementen | Faillissementen in de bouwsector | 3042 | MDX |
| gebouwenpark | Gebouwenpark 2025 | 3089 | MDX |
| gemeentelijke-investeringen | Gemeentelijke investeringen in Vlaanderen | 3064 | MDX, Maps |
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
| `update_publication_date.py` | Scrape publication date from Statbel pages and update MDX frontmatter. |
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
