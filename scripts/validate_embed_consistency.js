#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const EMBED_CONFIG_PATH = path.join(ROOT, "packages", "embuild-shared", "src", "lib", "embed-config.ts")

function parseArgs(argv) {
  const options = {
    built: false,
    slug: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--built") {
      options.built = true
      continue
    }
    if (arg === "--slug") {
      options.slug = argv[i + 1] ?? null
      i += 1
      continue
    }
    console.error(`Unknown argument: ${arg}`)
    process.exit(2)
  }

  return options
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
}

function findMatchingBrace(text, startIndex) {
  let depth = 0
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i]
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function extractTopLevelKeys(block) {
  const keys = []
  let depth = 0

  for (let i = 0; i < block.length; i += 1) {
    const char = block[i]

    if (char === "{") {
      depth += 1
      continue
    }
    if (char === "}") {
      depth -= 1
      continue
    }
    if (depth !== 0) continue

    const remainder = block.slice(i)
    const quoted = remainder.match(/^["'`]([A-Za-z0-9_-]+)["'`]\s*:/)
    if (quoted) {
      keys.push(quoted[1])
      i += quoted[0].length - 1
      continue
    }

    const bare = remainder.match(/^([A-Za-z0-9_-]+)\s*:/)
    if (bare) {
      keys.push(bare[1])
      i += bare[0].length - 1
    }
  }

  return keys
}

function parseEmbedConfig() {
  if (!fs.existsSync(EMBED_CONFIG_PATH)) {
    throw new Error(`Embed config not found: ${EMBED_CONFIG_PATH}`)
  }

  const raw = fs.readFileSync(EMBED_CONFIG_PATH, "utf8")
  const text = stripComments(raw)
  const configs = []
  const slugRegex = /slug\s*:\s*["']([a-z0-9-]+)["']/g

  let match
  while ((match = slugRegex.exec(text)) !== null) {
    const slug = match[1]
    const sectionsMatch = /sections\s*:\s*\{/.exec(text.slice(match.index))
    if (!sectionsMatch) {
      continue
    }

    const sectionsStart = match.index + sectionsMatch.index + sectionsMatch[0].length - 1
    const sectionsEnd = findMatchingBrace(text, sectionsStart)
    if (sectionsEnd === -1) {
      throw new Error(`Unclosed sections block for slug: ${slug}`)
    }

    const sectionsBlock = text.slice(sectionsStart + 1, sectionsEnd)
    configs.push({
      slug,
      sections: extractTopLevelKeys(sectionsBlock),
    })

    slugRegex.lastIndex = sectionsEnd
  }

  return configs
}

function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) ?? null
}

function getRouteCandidates(slug, section) {
  const appDir = path.join(ROOT, "apps", slug)
  return [
    path.join(appDir, "src", "app", "embed", slug, section, "page.tsx"),
    path.join(appDir, "src", "app", "embed", slug, section, "page.mdx"),
    path.join(appDir, "src", "app", "embed", slug, "[section]", "page.tsx"),
    path.join(appDir, "src", "app", "embed", slug, "[section]", "page.mdx"),
    path.join(appDir, "src", "app", "embed", "[slug]", "[section]", "page.tsx"),
    path.join(appDir, "src", "app", "embed", "[slug]", "[section]", "page.mdx"),
  ]
}

function getBuiltCandidates(slug, section) {
  return [
    path.join(ROOT, "apps", slug, "out", "embed", slug, section, "index.html"),
    path.join(ROOT, "dist", "analyses", slug, "embed", slug, section, "index.html"),
  ]
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const configs = parseEmbedConfig()
  const relevantConfigs = options.slug
    ? configs.filter((config) => config.slug === options.slug)
    : configs

  if (options.slug && relevantConfigs.length === 0) {
    console.error(`Unknown embed slug: ${options.slug}`)
    process.exit(2)
  }

  const errors = []
  const ok = []

  for (const config of relevantConfigs) {
    const appDir = path.join(ROOT, "apps", config.slug)
    if (!fs.existsSync(appDir)) {
      errors.push(`Missing app directory for slug '${config.slug}': ${path.relative(ROOT, appDir)}`)
      continue
    }

    for (const section of config.sections) {
      const routePath = firstExisting(getRouteCandidates(config.slug, section))
      if (!routePath) {
        errors.push(
          `Missing embed route for ${config.slug}/${section} (expected under apps/${config.slug}/src/app/embed/...)`
        )
        continue
      }

      if (options.built) {
        const builtPath = firstExisting(getBuiltCandidates(config.slug, section))
        if (!builtPath) {
          errors.push(
            `Missing built embed output for ${config.slug}/${section} (expected under apps/${config.slug}/out or dist/analyses/${config.slug})`
          )
          continue
        }
        ok.push(`${config.slug}/${section} -> ${path.relative(ROOT, builtPath)}`)
        continue
      }

      ok.push(`${config.slug}/${section} -> ${path.relative(ROOT, routePath)}`)
    }
  }

  if (errors.length > 0) {
    console.error("Embed consistency errors:")
    for (const error of errors) {
      console.error(` - ${error}`)
    }
    console.error(`\nChecked ${ok.length + errors.length} embed route(s); ${errors.length} problem(s) found.`)
    process.exit(1)
  }

  console.log(`Embed consistency: OK (${ok.length} route(s) checked${options.built ? ", built output verified" : ""})`)
}

main()
