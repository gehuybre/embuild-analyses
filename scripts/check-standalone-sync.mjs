#!/usr/bin/env node
/**
 * Controleert dat de site-versie (basePath /analyses/<slug>) en de standalone versie (basePath "")
 * van een app uit dezelfde bron komen en elkaar niet tegenspreken.
 *
 * Er bestaat geen kopie om te synchroniseren: beide zijn builds van dezelfde broncode. Dit script
 * bouwt ze allebei en controleert de dingen die in de praktijk uit elkaar kunnen lopen.
 *
 * Gebruik: node scripts/check-standalone-sync.mjs <slug> [--no-build]
 *   --no-build  hergebruik apps/<slug>/out (site) en dist-standalone/<slug> (standalone)
 *
 * Controles:
 *  1. site-build en standalone build slagen
 *  2. dezelfde bestanden in data/ met identieke inhoud
 *  3. dezelfde embed-secties, en elke sectie uit EMBED_CONFIGS heeft een index.html in beide
 *  4. standalone verwijst nergens naar /analyses/<slug> of naar het gedeelde /maps/
 *  5. site-build verwijst wel naar /analyses/<slug>/_next (assetPrefix klopt)
 *  6. embed-HTML bevat de basePath van zijn eigen variant en niet die van de andere
 */
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((a) => a !== "--")
const slug = args.find((a) => !a.startsWith("--"))
const noBuild = args.includes("--no-build")

if (!slug) {
  console.error("Usage: node scripts/check-standalone-sync.mjs <slug> [--no-build]")
  process.exit(2)
}

const appDir = join(ROOT, "apps", slug)
if (!existsSync(appDir)) {
  console.error(`Unknown app slug: ${slug}`)
  process.exit(2)
}

function run(cmd, cmdArgs) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`)
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", env: process.env })
  if (r.status !== 0) {
    console.error(`FAIL: ${cmd} ${cmdArgs.join(" ")} faalde (exit ${r.status})`)
    process.exit(1)
  }
}

// 1. bouwen: eerst site (out blijft staan), daarna standalone (herstelt out zelf)
if (!noBuild) {
  run("pnpm", ["--filter", slug, "build"])
  run("pnpm", ["build:standalone", "--", slug])
}

// een basePath-build kan out/analyses/<slug>/ of out/ opleveren (zie merge-outputs.mjs)
const siteOutRoot = join(appDir, "out")
const nested = join(siteOutRoot, "analyses", slug)
const siteDir = existsSync(nested) ? nested : siteOutRoot
const standaloneDir = join(ROOT, "dist-standalone", slug)

const errors = []
const fail = (m) => errors.push(m)

for (const [label, dir] of [["site", siteDir], ["standalone", standaloneDir]]) {
  if (!existsSync(join(dir, "index.html"))) fail(`${label}: ${relative(ROOT, dir)}/index.html ontbreekt`)
}
if (errors.length) report()

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex")
const TEXT = /\.(html|js|css|json|txt|map)$/

// 2. data/
const dataFiles = (dir) => (existsSync(join(dir, "data")) ? walk(join(dir, "data")).map((p) => relative(dir, p)).sort() : [])
const siteData = dataFiles(siteDir)
const standData = dataFiles(standaloneDir)
if (JSON.stringify(siteData) !== JSON.stringify(standData)) {
  fail(`data/ verschilt: alleen site: ${siteData.filter((f) => !standData.includes(f))}; alleen standalone: ${standData.filter((f) => !siteData.includes(f))}`)
} else {
  for (const f of siteData) {
    if (sha(join(siteDir, f)) !== sha(join(standaloneDir, f))) fail(`${f} verschilt tussen site en standalone`)
  }
}
if (siteData.length === 0) fail("geen data/ in de builds")

// 3. embed-secties
function configuredSections() {
  const src = readFileSync(join(ROOT, "packages/embuild-shared/src/lib/embed-config.ts"), "utf8")
  const start = src.indexOf(`slug: "${slug}"`)
  if (start < 0) return []
  const open = src.indexOf("sections: {", start)
  let depth = 0
  let end = open + "sections: ".length
  for (let i = end; i < src.length; i++) {
    if (src[i] === "{") depth++
    if (src[i] === "}" && --depth === 0) { end = i; break }
  }
  const block = src.slice(open + "sections: {".length, end)
  const keys = []
  let d = 0
  let token = ""
  for (const ch of block) {
    if (ch === "{") { if (d === 0) { const m = token.match(/["']?([A-Za-z0-9_-]+)["']?\s*:\s*$/); if (m) keys.push(m[1]) } d++; token = "" }
    else if (ch === "}") { d--; token = "" }
    else if (d === 0) token += ch
  }
  return keys
}
const sections = configuredSections()
const sectionsOn = (dir) => {
  const p = join(dir, "embed", slug)
  return existsSync(p) ? readdirSync(p).filter((n) => existsSync(join(p, n, "index.html"))).sort() : []
}
const siteSections = sectionsOn(siteDir)
const standSections = sectionsOn(standaloneDir)
if (JSON.stringify(siteSections) !== JSON.stringify(standSections)) fail(`embed-secties verschillen: site ${siteSections} / standalone ${standSections}`)
for (const s of sections) {
  if (!siteSections.includes(s)) fail(`embed-sectie '${s}' ontbreekt in de site-build`)
  if (!standSections.includes(s)) fail(`embed-sectie '${s}' ontbreekt in de standalone build`)
}

// 4. en 5. basePath-lekken
const base = `/analyses/${slug}`
const standaloneText = walk(standaloneDir).filter((p) => TEXT.test(p))
for (const p of standaloneText) {
  const t = readFileSync(p, "utf8")
  if (t.includes(base)) fail(`standalone verwijst naar ${base}: ${relative(standaloneDir, p)}`)
  if (/["'(]\/maps\//.test(t)) fail(`standalone verwijst naar het gedeelde /maps/: ${relative(standaloneDir, p)}`)
}
if (!readFileSync(join(siteDir, "index.html"), "utf8").includes(`${base}/_next`)) {
  fail(`site-build verwijst niet naar ${base}/_next (assetPrefix/basePath klopt niet)`)
}

// 6. embed-HTML: eigen basePath
for (const s of siteSections) {
  const html = readFileSync(join(siteDir, "embed", slug, s, "index.html"), "utf8")
  if (!html.includes(`${base}/_next`)) fail(`site embed '${s}' mist ${base}/_next`)
}
for (const s of standSections) {
  const html = readFileSync(join(standaloneDir, "embed", slug, s, "index.html"), "utf8")
  if (html.includes(base)) fail(`standalone embed '${s}' bevat ${base}`)
  if (!html.includes('"/_next/') && !html.includes("/_next/")) fail(`standalone embed '${s}' verwijst niet naar /_next/`)
}

report()

function report() {
  if (errors.length) {
    console.error(`\ncheck-standalone-sync ${slug}: FOUT`)
    for (const e of errors) console.error(` - ${e}`)
    process.exit(1)
  }
  console.log(`\ncheck-standalone-sync ${slug}: ok`)
  console.log(`  data-bestanden identiek: ${siteData.length}`)
  console.log(`  embed-secties in beide: ${siteSections.join(", ") || "(geen)"}`)
}
