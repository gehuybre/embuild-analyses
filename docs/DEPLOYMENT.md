# Deployment

## Overview

The site deploys to **Cloudflare Pages** via **Wrangler Direct Upload** (not Git integration). GitHub Actions builds all 21 apps with Turborepo, merges them into `dist/`, and uploads directly.

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

`NEXT_PUBLIC_DEPLOY_VERSION` is injected automatically as the commit SHA for cache-busting.

## Deploy workflow

**`.github/workflows/deploy.yml`**

Triggers on push to `main` (when `apps/`, `packages/`, or key scripts change) or manual dispatch.

Steps:
1. Checkout
2. Setup pnpm + Node 20
3. `pnpm install --frozen-lockfile`
4. `pnpm turbo build` (builds all 21 apps)
5. `node scripts/merge-outputs.mjs` (assembles `dist/`)
6. Wrangler uploads `dist/` to Cloudflare Pages

## Data update workflows

Four workflows auto-update analysis data on a schedule:

| Workflow | Schedule | Analysis |
| --- | --- | --- |
| `update-nbb-rente-data.yml` | Monday 04:15 UTC | NBB interest rates |
| `update-vergunningen-aanvragen-data.yml` | Scheduled | Building permits |
| `update-vergunningen-goedkeuringen-data.yml` | Scheduled | Permit approvals |
| `update-gemeentelijke-investeringen-data.yml` | Scheduled | Municipal investments |

> **Note:** These workflows still reference old `embuild-analyses/` paths and need updating for the Turborepo layout.

## First production rollout

1. Create a new Pages project in Cloudflare (e.g. `embuild-analyses`)
2. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets on `gehuybre/embuild-analyses`
3. Add `CLOUDFLARE_PAGES_PROJECT` as a repository variable (set to the new project name)
4. Trigger the `Deploy to Cloudflare Pages` workflow manually
5. Add a custom domain in Cloudflare Pages settings
