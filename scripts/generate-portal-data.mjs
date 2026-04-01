#!/usr/bin/env node

/**
 * generate-portal-data.mjs
 *
 * Reads metadata from each analysis app's src/app/page.tsx and generates
 * apps/portal/public/analyses.json for the portal listing page.
 *
 * Run via portal's prebuild script (package.json).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const OUTPUT = join(APPS_DIR, "portal", "public", "analyses.json")

function extractField(source, fieldName) {
  const quoted = new RegExp(`${fieldName}:\\s*"([^"]*)"`)
  const m = source.match(quoted)
  return m ? m[1] : undefined
}

function extractTags(source) {
  const m = source.match(/tags:\s*\[([^\]]*)\]/)
  if (!m) return []
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
}

function extractSourcePublicationDate(source) {
  // Find the source: { ... } block and extract publicationDate from it
  const sourceBlock = source.match(/source:\s*\{([^}]*)\}/s)
  if (!sourceBlock) return undefined
  const m = sourceBlock[1].match(/publicationDate:\s*"([^"]*)"/)
  return m ? m[1] : undefined
}

const entries = []

for (const slug of readdirSync(APPS_DIR).sort()) {
  if (slug === "portal") continue
  const pagePath = join(APPS_DIR, slug, "src", "app", "page.tsx")
  if (!existsSync(pagePath)) continue

  const source = readFileSync(pagePath, "utf-8")
  if (!source.includes("const metadata = {")) continue

  const title = extractField(source, "title")
  const date = extractField(source, "date")
  const summary = extractField(source, "summary")
  const tags = extractTags(source)
  const sourcePublicationDate = extractSourcePublicationDate(source)

  if (!title || !date) {
    console.warn(`⚠ ${slug}: missing title or date — skipping`)
    continue
  }

  entries.push({
    slug,
    title,
    date,
    summary: summary ?? "",
    tags,
    ...(sourcePublicationDate ? { sourcePublicationDate } : {}),
    url: `/analyses/${slug}/`,
  })
}

// Sort by date descending (newest first)
entries.sort((a, b) => b.date.localeCompare(a.date))

const nextOutput = JSON.stringify(entries, null, 2) + "\n"
const currentOutput = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf-8") : null

if (currentOutput === nextOutput) {
  console.log(`✓ analyses.json already up to date with ${entries.length} entries`)
} else {
  writeFileSync(OUTPUT, nextOutput)
  console.log(`✓ Generated analyses.json with ${entries.length} entries`)
}
