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
import { join, relative } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const DIST = join(ROOT, "dist")

// Clean dist
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true })
}
mkdirSync(DIST, { recursive: true })

// 1. Copy portal output → dist/
const portalOut = join(APPS_DIR, "portal", "out")
if (existsSync(portalOut)) {
  cpSync(portalOut, DIST, { recursive: true })
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
