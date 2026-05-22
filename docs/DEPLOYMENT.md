# Deployment

## Overview

The site deploys to **Cloudflare Pages** via **Wrangler Direct Upload** (not Git integration). GitHub Actions restores cached app outputs, rebuilds only the apps affected by the pushed changes, merges them into `dist/`, and uploads directly.

**Important:** This repo (`gehuybre/embuild-analyses`) uses a **separate** Cloudflare Pages project from the old backup repo (`gehuybre/analyses-backup-2026-03-31`). Set `CLOUDFLARE_PAGES_PROJECT` to a new project name to avoid overwriting the existing site.

## Cloudflare Pages project

1. Create a **new** Pages project in Cloudflare (e.g. `embuild-analyses`)
2. Use that project name as the `CLOUDFLARE_PAGES_PROJECT` repository variable

If you created the project via Cloudflare Git integration, disable automatic deployments and deploy with Wrangler instead.

## GitHub secrets

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Token with `Account / Cloudflare Pages / Edit` permission |

## GitHub repository variables

| Variable | Required | Description |
| --- | --- | --- |
| `CLOUDFLARE_PAGES_PROJECT` | Yes | Cloudflare Pages project name (use a **new** name, not the old one) |
| `CLOUDFLARE_PAGES_PROJECT_FIN_INDICATOREN` | Optional | Separate Cloudflare Pages project name for the standalone `fin-indicatoren` public site. |

`NEXT_PUBLIC_DEPLOY_VERSION` is injected automatically as the commit SHA for cache-busting.

## Deploy workflow

**`.github/workflows/deploy.yml`**

Triggers on push to `main` (when `apps/`, `packages/`, or key scripts change) or manual dispatch.

Steps:
1. Checkout
2. Setup pnpm + Node 20
3. `pnpm install --frozen-lockfile`
4. Detect which apps changed in the pushed commit range
5. Restore cached `apps/*/out` build outputs from the previous successful deploy
6. Build only the changed apps, then backfill any missing outputs on a cold cache
7. `node scripts/merge-outputs.mjs` (assembles `dist/`)
8. Wrangler uploads `dist/` to Cloudflare Pages

## Data update workflows

Five workflows auto-update analysis data on a schedule:

| Workflow | Schedule | Analysis |
| --- | --- | --- |
| `update-faillissementen-data.yml` | Daily + push on source changes | Bankruptcies |
| `update-nbb-rente-data.yml` | Monthly | NBB interest rates |
| `update-vergunningen-aanvragen-data.yml` | Monthly + push on source changes | Building permits |
| `update-vergunningen-goedkeuringen-data.yml` | Statbel release schedule | Permit approvals |
| `update-gemeentelijke-investeringen-data.yml` | Monthly + push on source changes | Municipal investments |

Each workflow should treat the app directory as the unit of ownership:

- `apps/{slug}/data/` for raw inputs and refresh metadata
- `apps/{slug}/scripts/` for ETL code
- `apps/{slug}/public/data/` for published frontend assets

The workflow file in `.github/workflows/` should stay thin and only orchestrate the app-local script plus commit/deploy steps.

## First production rollout

1. Create a new Pages project in Cloudflare (e.g. `embuild-analyses`)
2. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets on `gehuybre/embuild-analyses`
3. Add `CLOUDFLARE_PAGES_PROJECT` as a repository variable (set to the new project name)
4. Trigger the `Deploy to Cloudflare Pages` workflow manually
5. Add a custom domain in Cloudflare Pages settings

## Standalone public deploy for `fin-indicatoren`

Use this when you want to share only `fin-indicatoren` on a separate public host without exposing the portal or other analyses.

### Local build

```bash
pnpm build:standalone -- fin-indicatoren
```

This writes a root-hostable static export to `dist-standalone/fin-indicatoren/`.

### GitHub Actions workflow

Use `.github/workflows/deploy-fin-indicatoren-public.yml`.

It:

1. Installs dependencies
2. Builds only `fin-indicatoren` with `NEXT_PUBLIC_BASE_PATH=""`
3. Uploads `dist-standalone/fin-indicatoren/`
4. Deploys it to a separate Cloudflare Pages project

### Required configuration

- Reuse the existing `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets
- Add the repository variable `CLOUDFLARE_PAGES_PROJECT_FIN_INDICATOREN`

Recommended setup:

- Create a second Pages project, for example `embuild-fin-indicatoren`
- Attach a separate hostname or subdomain to that project
- Do not point that hostname at the main analyses Pages project
