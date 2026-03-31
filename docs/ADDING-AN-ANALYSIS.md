# Adding an analysis

## 1. Copy an existing app

Pick a simple app as template (e.g. `energiekaart-premies`) and copy:

```bash
cp -r apps/energiekaart-premies apps/my-new-analysis
```

## 2. Update package.json

```jsonc
{
  "name": "my-new-analysis",   // must match directory name
  "scripts": {
    "dev": "next dev --port 30XX"  // pick an unused port
  }
}
```

## 3. Update next.config.mjs

Change the basePath:

```js
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/analyses/my-new-analysis'
```

## 4. Update page.tsx metadata

Edit `src/app/page.tsx` — this is the single source of truth for the portal listing:

```tsx
const metadata = {
  title: "My New Analysis",
  date: "2026-04-01",
  summary: "Description shown on the portal card.",
  tags: ["tag1", "tag2"],
  source: {
    provider: "Data Provider Name",
    title: "Dataset title",
    url: "https://...",
    publicationDate: "2026-04-01",
  },
}
```

## 5. Add data

Put JSON data files in `public/data/`. Access them in components via:

```tsx
import { getDataPath } from "@embuild/shared/lib/path-utils"

const url = getDataPath("/data/my-file.json")
```

## 6. Build and verify

```bash
pnpm --filter my-new-analysis build
node scripts/merge-outputs.mjs
npx serve dist -p 5000
# Visit http://localhost:5000/analyses/my-new-analysis/
```

The portal listing updates automatically — `generate-portal-data.mjs` runs during the portal prebuild and picks up the new app's metadata.

## 7. (Optional) Add a data-update workflow

If the analysis has a `process_data.py` or similar script that refreshes data, add a GitHub Actions workflow in `.github/workflows/update-my-new-analysis-data.yml`. See existing workflows (e.g. `update-nbb-rente-data.yml`) as templates.

## Checklist

- [ ] `package.json` name matches directory name
- [ ] `next.config.mjs` basePath is `/analyses/{slug}`
- [ ] `page.tsx` has `const metadata = { ... }` with title, date, summary, tags, source
- [ ] `layout.tsx` imports `@embuild/shared/styles/globals.css`
- [ ] Data files in `public/data/`
- [ ] App builds: `pnpm --filter {slug} build`
- [ ] Appears in portal listing after full rebuild
