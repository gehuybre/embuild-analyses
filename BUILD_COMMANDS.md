# Build Commands

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

## Rebuild everything with merge in one line

```bash
pnpm turbo build && node scripts/merge-outputs.mjs
```

## Re-serve an existing dist

```bash
npx serve dist -p 5000
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
