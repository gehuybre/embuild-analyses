# Architecture

## Monorepo layout

```
analyses/
  apps/
    portal/                 ← homepage listing all analyses (no basePath)
    arbeiders-bedienden/    ← one app per analysis
    ...
  packages/
    embuild-shared/         ← shared components, utilities, styles
  scripts/
    merge-outputs.mjs       ← assembles dist/ from all app outputs
    generate-portal-data.mjs← generates portal listing from app metadata
    generate-docs.mjs       ← auto-generates doc sections
  dist/                     ← merged output for deployment (gitignored)
```

Managed with **Turborepo 2.9** + **pnpm 10.33** workspaces (`pnpm-workspace.yaml` includes `apps/*` and `packages/*`).

## How apps work

Each analysis is a standalone **Next.js 14** app with `output: "export"` (static HTML).

- **Portal** (`apps/portal/`) builds at root path (`/`). Its `public/` directory holds `analyses.json` (auto-generated listing) and `maps/` (shared GeoJSON files).
- **Analysis apps** each have a `basePath: "/analyses/{slug}"` in `next.config.mjs`. Their static output lands in `out/analyses/{slug}/`.

### Metadata convention

Every analysis app defines a `metadata` object in `src/app/page.tsx`:

```tsx
const metadata = {
  title: "...",
  date: "YYYY-MM-DD",
  summary: "...",
  tags: ["..."],
  source: {
    provider: "...",
    title: "...",
    url: "...",
    publicationDate: "YYYY-MM-DD",
  },
}
```

This is passed to `<AnalysisLayout {...metadata}>` and also scraped by `scripts/generate-portal-data.mjs` to build the portal listing.

### Data files

Each app keeps its data in `public/data/` (JSON files). These are served at `/{basePath}/data/` in the static output.

## Shared package: `@embuild/shared`

Located at `packages/embuild-shared/`. Exports via conditional package.json exports:

```
@embuild/shared/components/ui/*       → UI primitives (Card, Badge, Button, etc.)
@embuild/shared/components/shared/*   → Analysis components (AnalysisLayout, MapSection, etc.)
@embuild/shared/lib/*                 → Utilities (path-utils, chart-theme, embed-config, etc.)
@embuild/shared/styles/*              → globals.css
@embuild/shared/types/*               → TypeScript types
```

Import example:
```tsx
import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { Card } from "@embuild/shared/components/ui/card"
import { getBasePath } from "@embuild/shared/lib/path-utils"
```

## Build pipeline

```
pnpm turbo build
  → each app runs `next build` (static export → out/)
  → portal prebuild runs generate-portal-data.mjs first

node scripts/merge-outputs.mjs
  → copies portal out/ → dist/
  → copies each analysis out/analyses/{slug}/ → dist/analyses/{slug}/
  → portal's public/maps/ ends up at dist/maps/

Result:
  dist/
    index.html, _next/           ← portal
    analyses.json                ← portal listing
    maps/                        ← shared GeoJSON (from portal)
    analyses/
      arbeiders-bedienden/       ← each analysis
      ...
```

## Portal data generation

`scripts/generate-portal-data.mjs` runs as the portal's `prebuild` script. It:

1. Reads every `apps/*/src/app/page.tsx`
2. Extracts `title`, `date`, `summary`, `tags`, `source.publicationDate` via regex
3. Writes `apps/portal/public/analyses.json` sorted by date descending

This means adding a new app automatically adds it to the portal listing on next build.

### Multiple versions of one analysis

When an analysis gets a new data version next to the old one (a copy of the app under a new slug, e.g.
`gemeentelijke-investeringen-2026-09`), list both in `scripts/analysis-versions.json`:

```json
{
  "gemeentelijke-investeringen": {
    "default": "gemeentelijke-investeringen-2026-09",
    "versions": [
      { "slug": "gemeentelijke-investeringen-2026-09", "label": "September 2026" },
      { "slug": "gemeentelijke-investeringen", "label": "Mei 2026" }
    ]
  }
}
```

`generate-portal-data.mjs` then folds the versions into one portal card with a version selector (`default` decides
which version the card opens first). Each version keeps its own app, URLs and embeds. A new version also needs its own
entry in `embed-config.ts` (same sections, new slug), in `analysis-defaults.ts`, and an embed route under
`src/app/embed/<slug>/[section]/`.

Optioneel krijgt de groep een `comparison`-veld (`{ "slug", "label" }`) dat naar een aparte vergelijkingsapp wijst
(bv. `gemeentelijke-investeringen-vergelijking`). Die app staat niet apart in het portaal, maar als link op de kaart.
Haar data komt uit `scripts/build_comparison_data.py` in de vergelijkingsapp, die de parquet-bestanden van de versies
leest; draai dat script opnieuw na elke nieuwe export. Een versie die uit oudere bestanden is gereconstrueerd
(`gemeentelijke-investeringen-2026-02`) volgt hetzelfde patroon.

## Maps

Shared GeoJSON files live in `apps/portal/public/maps/`:
- `belgium_municipalities.json`
- `belgium_provinces.json`
- `belgium_arrondissements.json`
- `belgium_regions.json`

Map components (`MunicipalityMap`, `ArrondissementMap`) fetch these via `getSharedAssetPath("/maps/...")` which returns root-relative URLs (no basePath prefix). After merge, they're served at `/maps/`.

## Styling

- **Tailwind CSS v4** with PostCSS
- Single entry point: `packages/embuild-shared/src/styles/globals.css`
- `@source "../components"` scans shared components for class names
- `@source "../../../../apps"` scans all app-specific components
- All apps import `@embuild/shared/styles/globals.css` in their root layout

## MDX support

6 apps use MDX (`@next/mdx`): arbeiders-bedienden, betaalbaar-arr, bouwprojecten-gemeenten, nbb-rente, vastgoed-verkopen, vergunningen-aanvragen. Their `next.config.mjs` wraps the config with `withMDX()` and `tsconfig.json` includes `**/*.mdx`.

<!-- AUTO:shared-components -->
**UI primitives** (`components/ui/`): `alert`, `badge`, `button`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `separator`, `skeleton`, `table`, `tabs`

**Analysis components** (`components/shared/`): `AnalysisLayout`, `AnalysisSection`, `ArrondissementMap`, `DeployVersionGuard`, `DumbbellChart`, `EmbedAutoResize`, `EmbedErrorBoundary`, `EmbedParentResizeListener`, `EmbeddableSection`, `ExportButtons`, `FilterableChart`, `FilterableTable`, `GeoContext`, `GeoFilter`, `GeoFilterInline`, `HierarchicalFilter`, `HorizontalBarChart`, `MapControls`, `MapLegend`, `MapSection`, `MapWithCustomGeo`, `MunicipalityMap`, `MunicipalitySearch`, `PeriodComparisonSection`, `PressReferences`, `TimeSeriesSection`, `TimeSlider`

**Lib modules** (`lib/`): `analysis-defaults`, `bouwprojecten-data`, `chart-theme`, `embed-config`, `embed-data-constraints`, `embed-data-registry`, `embed-data-transformers`, `embed-path-validation`, `embed-types`, `filter-validation`, `geo-utils`, `investeringen-data`, `map-utils`, `name-utils`, `nis-fusion-utils`, `number-formatters`, `path-utils`, `press-utils`, `quarterly-narrative`, `sector-short-labels`, `use-is-embed-route`, `use-json-bundle`, `utils`
<!-- /AUTO:shared-components -->
