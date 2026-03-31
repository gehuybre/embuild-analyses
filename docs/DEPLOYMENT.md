# Deployment

## Overview

The site deploys to **Cloudflare Pages** via **Wrangler Direct Upload** (not Git integration). GitHub Actions builds the site and uploads `dist/` directly.

## Cloudflare Pages project

Create a Pages project in Cloudflare for your repo. The project name goes into the `CLOUDFLARE_PAGES_PROJECT` repository variable.

If you created the project via Cloudflare Git integration, that's fine — disable automatic deployments and deploy with Wrangler instead.

## GitHub secrets

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Token with `Account / Cloudflare Pages / Edit` permission |

## GitHub repository variables

| Variable | Required | Description |
| --- | --- | --- |
| `CLOUDFLARE_PAGES_PROJECT` | Yes | Exact Cloudflare Pages project name |
| `NEXT_PUBLIC_DATA_BASE_URL` | No | Base URL of external data host (falls back to same-origin) |
| `NEXT_PUBLIC_BASE_PATH` | No | Leave empty for root-domain deployment |

`NEXT_PUBLIC_DEPLOY_VERSION` is injected automatically as the commit SHA for cache-busting.

## Workflows

### Deploy site

**`.github/workflows/deploy-cloudflare-pages.yml`**

Triggers on push to `main` or manual dispatch. Steps:
1. Checkout
2. Setup Node 20
3. Install dependencies
4. Build static export
5. Deploy to Cloudflare Pages via Wrangler

> **Note:** This workflow currently references `embuild-analyses/` paths and needs updating to work with the Turborepo layout. The build step should become `pnpm turbo build && node scripts/merge-outputs.mjs` and the deploy should upload `dist/`.

### Data update workflows

Four workflows auto-update analysis data on a schedule:

| Workflow | Schedule | Analysis |
| --- | --- | --- |
| `update-nbb-rente-data.yml` | Monday 04:15 UTC | NBB interest rates |
| `update-vergunningen-aanvragen-data.yml` | Scheduled | Building permits |
| `update-vergunningen-goedkeuringen-data.yml` | Scheduled | Permit approvals |
| `update-gemeentelijke-investeringen-data.yml` | Scheduled | Municipal investments |

Each workflow: runs a Python `process_data.py` → verifies output JSON → commits to main → (optionally) exports to data repo.

> **Note:** These workflows also reference the old `embuild-analyses/` paths and need updating.

### Publish data

**`.github/workflows/publish-data.yml`** — manual trigger. Exports all analysis outputs to the data backup repo (`gehuybre/data-backup-2026-03-31`) using `scripts/export_data_repo.py`.

## First production rollout

1. Create the Pages project in Cloudflare
2. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets
3. Add `CLOUDFLARE_PAGES_PROJECT` and optionally `NEXT_PUBLIC_DATA_BASE_URL` as repository variables
4. Trigger the deploy workflow manually
5. Add a custom domain (e.g. `analyses.example.be`) in Cloudflare Pages settings

## Custom domain

After the first successful deployment, add your domain in Cloudflare Pages:
- `analyses.example.be` (or similar)
