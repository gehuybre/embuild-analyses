# Build Commands
cd /Users/gerthuybrechts/pyprojects/data-blog-u/analyses
npx serve dist -p 5000


Run these from the repository root: `/Users/gerthuybrechts/pyprojects/data-blog-u/analyses`

## Full rebuild + local preview

```bash
pnpm turbo build
node scripts/merge-outputs.mjs
npx serve dist -p 5000
```

## Rebuild one app

```bash
pnpm --filter portal build
pnpm --filter arbeiders-bedienden build
```

## Rebuild + merge one app

```bash
pnpm build:single-preview -- <app-slug>
```

Examples:

```bash
pnpm build:single-preview -- vergunningen-goedkeuringen
pnpm build:single-preview -- nbb-rente
```

`merge-outputs` now auto-refreshes portal metadata and rebuilds `portal` when an app metadata change would otherwise leave the homepage out of sync.
For supported data-driven apps, each app `prebuild` also syncs the visible blog date and `Data beschikbaar tot en met …` label from the latest local dataset before the build starts.

## Build one app as a standalone public site

```bash
pnpm build:standalone -- fin-indicatoren
pnpm build:fin-indicatoren:standalone
```

This builds the app with `NEXT_PUBLIC_BASE_PATH=""` and writes a root-hostable static site to `dist-standalone/fin-indicatoren/`.

## Rebuild everything with merge in one line

```bash
pnpm turbo build && node scripts/merge-outputs.mjs
```

## Re-serve an existing dist

```bash
npx serve dist -p 5000
```

## Validate embed routes

```bash
node scripts/validate_embed_consistency.js
node scripts/validate_embed_consistency.js --slug bouwprojecten-gemeenten
node scripts/validate_embed_consistency.js --built
```

## Stop a server on port 5000

```bash
lsof -ti:5000 | xargs kill -9
```

## Useful notes

- `portal` is the homepage app at `/`.
- Analysis apps build to `apps/<slug>/out` and are merged into `dist/analyses/<slug>/`.
- Shared GeoJSON map files live in `apps/portal/public/maps/` and are served at `/maps/` via the portal app's static output.
- If `serve` says port `5000` is in use, it will pick another port unless you stop the old process first.
