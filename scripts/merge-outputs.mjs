#!/usr/bin/env node

/**
 * merge-outputs.mjs
 *
 * Merges the static outputs of all apps into a single directory
 * suitable for Cloudflare Pages deployment.
 *
 * Structure:
 *   dist/
 *     index.html              ← portal
 *     _next/                  ← portal assets
 *     analyses/
 *       arbeiders-bedienden/
 *         index.html
 *         _next/
 *         data/
 *         ...
 *       bedrijventerreinen-vlaanderen/
 *         ...
 *
 * Usage:
 *   node scripts/merge-outputs.mjs
 */

import { readdirSync, cpSync, existsSync, rmSync, mkdirSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const DIST = join(ROOT, "dist")
const PORTAL_DIR = join(APPS_DIR, "portal")
const PORTAL_OUT = join(PORTAL_DIR, "out")
const PORTAL_OUT_INDEX = join(PORTAL_OUT, "index.html")
const PORTAL_ANALYSES_JSON = join(PORTAL_DIR, "public", "analyses.json")
const PORTAL_INPUTS = [
  PORTAL_ANALYSES_JSON,
  join(PORTAL_DIR, "src", "app", "page.tsx"),
  join(PORTAL_DIR, "src", "app", "layout.tsx"),
]

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function ensurePortalOutputUpToDate() {
  run("node", ["scripts/generate-portal-data.mjs"])

  if (!existsSync(PORTAL_OUT_INDEX)) {
    console.log("↻ Portal output missing; rebuilding portal.")
    run("pnpm", ["--filter", "portal", "build"])
    return
  }

  const portalIndexMtime = statSync(PORTAL_OUT_INDEX).mtimeMs
  const latestInputMtime = PORTAL_INPUTS
    .filter((path) => existsSync(path))
    .reduce((latest, path) => Math.max(latest, statSync(path).mtimeMs), 0)

  if (latestInputMtime > portalIndexMtime) {
    console.log("↻ Portal inputs changed; rebuilding portal to keep the homepage in sync.")
    run("pnpm", ["--filter", "portal", "build"])
  }
}

ensurePortalOutputUpToDate()

// Clean dist
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true })
}
mkdirSync(DIST, { recursive: true })

// 1. Copy portal output → dist/
if (existsSync(PORTAL_OUT)) {
  cpSync(PORTAL_OUT, DIST, { recursive: true })
  console.log("✓ Portal → dist/")
} else {
  console.warn("⚠ Portal has no out/ directory — skipping")
}

// 2. Copy each analysis → dist/analyses/{slug}/
const analysesDir = join(DIST, "analyses")
mkdirSync(analysesDir, { recursive: true })

let count = 0
for (const slug of readdirSync(APPS_DIR).sort()) {
  if (slug === "portal") continue
  const appOut = join(APPS_DIR, slug, "out")
  if (!existsSync(appOut)) {
    console.warn(`⚠ ${slug} has no out/ directory — skipping`)
    continue
  }

  // The app's basePath is /analyses/{slug}, so its out/ contains analyses/{slug}/
  // We need to copy the content from out/analyses/{slug}/ → dist/analyses/{slug}/
  const basedOut = join(appOut, "analyses", slug)
  if (existsSync(basedOut)) {
    const dest = join(analysesDir, slug)
    cpSync(basedOut, dest, { recursive: true })
    count++
    console.log(`✓ ${slug}`)
  } else {
    // Fallback: copy entire out/ into dist/analyses/{slug}/
    const dest = join(analysesDir, slug)
    cpSync(appOut, dest, { recursive: true })
    count++
    console.log(`✓ ${slug} (direct copy)`)
  }
}

console.log(`\n━━━ Merged ${count} analyses + portal into dist/ ━━━`)

// Verify
const distFiles = readdirSync(DIST)
const distAnalyses = existsSync(analysesDir) ? readdirSync(analysesDir) : []
console.log(`dist/ contains: ${distFiles.join(", ")}`)
console.log(`dist/analyses/ contains: ${distAnalyses.length} directories`)
