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
import { isPublishedToSite } from "./site-apps.mjs"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const OUTPUT = join(APPS_DIR, "portal", "public", "analyses.json")
const VERSIONS_CONFIG = join(import.meta.dirname, "analysis-versions.json")

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
  if (!isPublishedToSite(slug)) continue
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

/**
 * Versiegroepen (scripts/analysis-versions.json): meerdere apps met dezelfde analyse in verschillende
 * versies verschijnen als een kaart met een versiekiezer. De groep krijgt de metadata van de
 * standaardversie en een `versions`-lijst; de losse versies staan niet apart in de lijst.
 */
function loadVersionGroups() {
  if (!existsSync(VERSIONS_CONFIG)) return {}
  return JSON.parse(readFileSync(VERSIONS_CONFIG, "utf-8"))
}

function applyVersionGroups(allEntries, groups) {
  const bySlug = new Map(allEntries.map((entry) => [entry.slug, entry]))
  const grouped = new Set()
  const groupEntries = []

  for (const [groupSlug, group] of Object.entries(groups)) {
    const versions = []
    for (const { slug, label } of group.versions ?? []) {
      const entry = bySlug.get(slug)
      if (!entry) {
        console.warn(`⚠ versiegroep ${groupSlug}: app '${slug}' niet gevonden of niet gepubliceerd — overgeslagen`)
        continue
      }
      versions.push({ entry, label })
    }
    if (versions.length === 0) continue

    for (const { entry } of versions) grouped.add(entry.slug)

    // Optionele vergelijkingspagina: staat niet apart in de lijst, maar als link op de kaart.
    const comparisonEntry = group.comparison ? bySlug.get(group.comparison.slug) : undefined
    if (group.comparison && !comparisonEntry) {
      console.warn(`⚠ versiegroep ${groupSlug}: vergelijkingsapp '${group.comparison.slug}' niet gevonden of niet gepubliceerd — overgeslagen`)
    }
    if (comparisonEntry) grouped.add(comparisonEntry.slug)

    const fallback = versions[0]
    const defaultVersion = versions.find(({ entry }) => entry.slug === group.default) ?? fallback
    if (group.default && defaultVersion !== versions.find(({ entry }) => entry.slug === group.default)) {
      console.warn(`⚠ versiegroep ${groupSlug}: standaardversie '${group.default}' niet beschikbaar — gebruik '${fallback.entry.slug}'`)
    }

    if (versions.length === 1) {
      groupEntries.push(defaultVersion.entry)
      continue
    }

    groupEntries.push({
      ...defaultVersion.entry,
      slug: groupSlug,
      defaultVersion: defaultVersion.entry.slug,
      ...(comparisonEntry
        ? { comparison: { label: group.comparison.label ?? "Vergelijk de versies", url: comparisonEntry.url } }
        : {}),
      versions: versions.map(({ entry, label }) => ({
        slug: entry.slug,
        label,
        date: entry.date,
        summary: entry.summary,
        url: entry.url,
        ...(entry.sourcePublicationDate ? { sourcePublicationDate: entry.sourcePublicationDate } : {}),
      })),
    })
  }

  return [...allEntries.filter((entry) => !grouped.has(entry.slug)), ...groupEntries]
}

const publishedEntries = applyVersionGroups(entries, loadVersionGroups())

// Sort by date descending (newest first)
publishedEntries.sort((a, b) => b.date.localeCompare(a.date))

const nextOutput = JSON.stringify(publishedEntries, null, 2) + "\n"
const currentOutput = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf-8") : null

if (currentOutput === nextOutput) {
  console.log(`✓ analyses.json already up to date with ${publishedEntries.length} entries`)
} else {
  writeFileSync(OUTPUT, nextOutput)
  console.log(`✓ Generated analyses.json with ${publishedEntries.length} entries`)
}
