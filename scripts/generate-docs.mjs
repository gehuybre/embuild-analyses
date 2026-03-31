#!/usr/bin/env node

/**
 * generate-docs.mjs
 *
 * Scans the codebase and injects auto-generated sections into markdown files.
 * Sections are delimited by <!-- AUTO:name --> and <!-- /AUTO:name --> markers.
 * Content outside markers is preserved.
 *
 * Usage:
 *   node scripts/generate-docs.mjs          # update in-place
 *   node scripts/generate-docs.mjs --check  # exit 1 if any file would change
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs"
import { join, basename, extname, relative } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const SHARED_DIR = join(ROOT, "packages", "embuild-shared", "src")
const SCRIPTS_DIR = join(ROOT, "scripts")
const CHECK_MODE = process.argv.includes("--check")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractField(source, fieldName) {
  const m = source.match(new RegExp(`${fieldName}:\\s*"([^"]*)"`, "s"))
  return m ? m[1] : undefined
}

function extractTags(source) {
  const m = source.match(/tags:\s*\[([^\]]*)\]/)
  if (!m) return []
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}

function firstComment(filePath) {
  const src = readFileSync(filePath, "utf-8")
  const ext = extname(filePath)

  // Strip shebang lines
  const body = src.replace(/^#!.*\n/gm, "").replace(/^\s*\n/, "")

  // Python docstring or # comment
  if (ext === ".py") {
    const doc = body.match(/^(?:\s*\n)*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
    if (doc) {
      const text = (doc[1] ?? doc[2]).trim()
      return text.split("\n")[0].trim()
    }
    const hash = body.match(/^(?:\s*\n)*#\s*(.+)/)
    if (hash) return hash[1].trim()
  }

  // JS/TS/MJS: look for the meaningful line in a JSDoc block (skip filename lines)
  if ([".js", ".ts", ".mjs"].includes(ext)) {
    const block = body.match(/\/\*\*?\s*\n([\s\S]*?)\*\//)
    if (block) {
      const lines = block[1].split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean)
      // Skip lines that look like filenames (e.g. "generate-docs.mjs")
      const meaningful = lines.find((l) => !l.match(/^[\w.-]+\.(mjs|js|ts|py|sh)$/) && l.length > 5)
      if (meaningful) return meaningful
    }
    const line = body.match(/^(?:\s*\n)*\/\/\s*(.+)/)
    if (line) return line[1].trim()
  }

  // Shell # comment (after shebang stripped)
  if (ext === ".sh") {
    const hash = body.match(/^(?:\s*\n)*#\s*(.+)/)
    if (hash) return hash[1].trim()
  }

  return ""
}

function listFiles(dir, exts) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => exts.includes(extname(f)) && statSync(join(dir, f)).isFile())
    .sort()
}

// ---------------------------------------------------------------------------
// Section generators
// ---------------------------------------------------------------------------

function generateAppsTable() {
  const rows = []
  for (const slug of readdirSync(APPS_DIR).sort()) {
    const appDir = join(APPS_DIR, slug)
    if (!statSync(appDir).isDirectory()) continue

    const pkgPath = join(appDir, "package.json")
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))

    // Title: from page.tsx metadata or layout.tsx Metadata or package name
    let title = slug
    const pagePath = join(appDir, "src", "app", "page.tsx")
    if (existsSync(pagePath)) {
      const src = readFileSync(pagePath, "utf-8")
      title = extractField(src, "title") ?? title
    }

    // Port from dev script
    const devScript = pkg.scripts?.dev ?? ""
    const portMatch = devScript.match(/--port\s+(\d+)/)
    const port = portMatch ? portMatch[1] : "—"

    // Features
    const features = []
    if (pkg.dependencies?.["@next/mdx"] || pkg.devDependencies?.["@next/mdx"]) features.push("MDX")
    // Check for map usage
    const srcDir = join(appDir, "src")
    if (existsSync(srcDir)) {
      try {
        const allTsx = findFilesRecursive(srcDir, ".tsx")
        for (const f of allTsx) {
          const content = readFileSync(f, "utf-8")
          if (content.includes("MunicipalityMap") || content.includes("ArrondissementMap") || content.includes("MapSection")) {
            features.push("Maps")
            break
          }
        }
      } catch { /* ignore */ }
    }

    rows.push(`| ${slug} | ${title} | ${port} | ${features.join(", ") || "—"} |`)
  }

  return [
    "| Slug | Title | Dev Port | Features |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n")
}

function findFilesRecursive(dir, ext) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.name === "node_modules") continue
    if (entry.isDirectory()) results.push(...findFilesRecursive(full, ext))
    else if (entry.name.endsWith(ext)) results.push(full)
  }
  return results
}

function generateSharedComponents() {
  const sections = []

  const uiDir = join(SHARED_DIR, "components", "ui")
  if (existsSync(uiDir)) {
    const files = listFiles(uiDir, [".tsx"])
    sections.push("**UI primitives** (`components/ui/`): " + files.map((f) => `\`${basename(f, ".tsx")}\``).join(", "))
  }

  const sharedDir = join(SHARED_DIR, "components", "shared")
  if (existsSync(sharedDir)) {
    const files = listFiles(sharedDir, [".tsx"])
    sections.push("**Analysis components** (`components/shared/`): " + files.map((f) => `\`${basename(f, ".tsx")}\``).join(", "))
  }

  const libDir = join(SHARED_DIR, "lib")
  if (existsSync(libDir)) {
    const files = listFiles(libDir, [".ts"])
    sections.push("**Lib modules** (`lib/`): " + files.map((f) => `\`${basename(f, ".ts")}\``).join(", "))
  }

  return sections.join("\n\n")
}

function generateScriptsCatalog() {
  const exts = [".py", ".js", ".ts", ".mjs", ".sh"]
  const rows = []

  // Root scripts
  for (const f of listFiles(SCRIPTS_DIR, exts)) {
    const purpose = firstComment(join(SCRIPTS_DIR, f))
    rows.push(`| \`${f}\` | ${purpose} |`)
  }

  // Agent scripts
  const agentDir = join(SCRIPTS_DIR, "agent")
  if (existsSync(agentDir)) {
    for (const f of listFiles(agentDir, exts)) {
      const purpose = firstComment(join(agentDir, f))
      rows.push(`| \`agent/${f}\` | ${purpose} |`)
    }
  }

  return [
    "| Script | Purpose |",
    "| --- | --- |",
    ...rows,
  ].join("\n")
}

function generateStaleScripts() {
  const exts = [".py", ".js", ".ts", ".mjs", ".sh"]
  const stale = []

  const check = (dir, prefix = "") => {
    for (const f of listFiles(dir, exts)) {
      if (f === "generate-docs.mjs") continue // skip self
      const content = readFileSync(join(dir, f), "utf-8")
      if (content.includes("embuild-analyses")) {
        stale.push(`\`${prefix}${f}\``)
      }
    }
  }

  check(SCRIPTS_DIR)
  check(join(SCRIPTS_DIR, "agent"), "agent/")

  if (stale.length === 0) return "_All scripts are up to date._"

  return [
    `> **${stale.length} scripts** still reference the deleted \`embuild-analyses/\` path and need updating:`,
    "",
    ...stale.map((s) => `> - ${s}`),
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Section registry
// ---------------------------------------------------------------------------

const GENERATORS = {
  "apps-table": generateAppsTable,
  "shared-components": generateSharedComponents,
  "scripts-catalog": generateScriptsCatalog,
  "stale-scripts": generateStaleScripts,
}

// ---------------------------------------------------------------------------
// Injector
// ---------------------------------------------------------------------------

function injectSections(filePath) {
  const original = readFileSync(filePath, "utf-8")
  let content = original

  for (const [name, generator] of Object.entries(GENERATORS)) {
    const startTag = `<!-- AUTO:${name} -->`
    const endTag = `<!-- /AUTO:${name} -->`
    const startIdx = content.indexOf(startTag)
    const endIdx = content.indexOf(endTag)
    if (startIdx === -1 || endIdx === -1) continue

    const before = content.slice(0, startIdx + startTag.length)
    const after = content.slice(endIdx)
    const generated = generator()
    content = before + "\n" + generated + "\n" + after
  }

  if (content !== original) {
    if (CHECK_MODE) {
      console.log(`⚠ ${relative(ROOT, filePath)} is out of date`)
      return true
    }
    writeFileSync(filePath, content)
    console.log(`✓ Updated ${relative(ROOT, filePath)}`)
  }
  return false
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TARGET_FILES = [
  join(ROOT, "README.md"),
  join(ROOT, "docs", "ARCHITECTURE.md"),
]

let stale = false
for (const f of TARGET_FILES) {
  if (existsSync(f)) {
    if (injectSections(f)) stale = true
  }
}

if (CHECK_MODE) {
  if (stale) {
    console.error("\nDocs are out of date. Run: node scripts/generate-docs.mjs")
    process.exit(1)
  } else {
    console.log("✓ Docs are up to date")
  }
} else {
  console.log("Done.")
}
