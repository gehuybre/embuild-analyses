#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const embedConfigPath = path.join(ROOT, 'embuild-analyses', 'src', 'lib', 'embed-config.ts')
const registryPath = path.join(ROOT, 'embuild-analyses', 'src', 'lib', 'embed-data-registry.ts')

if (!fs.existsSync(embedConfigPath) || !fs.existsSync(registryPath)) {
  console.error('Embed config or registry not found')
  process.exit(2)
}

const embedConfig = fs.readFileSync(embedConfigPath, 'utf8')
const registry = fs.readFileSync(registryPath, 'utf8')

// Extract all slug -> sections from EMBED_CONFIGS
const slugSectionRegex = /slug:\s*"([a-z0-9\-]+)"[\s\S]*?sections:\s*\{([\s\S]*?)\}/gmi
let match
const embedConfigs = {}
while ((match = slugSectionRegex.exec(embedConfig)) !== null) {
  const slug = match[1]
  const sectionsBlock = match[2]
  const sectionKeyRegex = /(["'`]?)([a-z0-9\-]+)\1\s*:\s*\{([^}]*)\}/gmi
  const sections = {}
  let m2
  while ((m2 = sectionKeyRegex.exec(sectionsBlock)) !== null) {
    const section = m2[2]
    const body = m2[3]
    const typeMatch = /type:\s*["'](standard|custom)["']/i.exec(body)
    sections[section] = { type: typeMatch ? typeMatch[1] : 'standard' }
  }
  embedConfigs[slug] = sections
}

// Extract registry keys ("slug/section" keys)
const registryKeyRegex = /(["'`])([a-z0-9\-]+\/[a-z0-9\-]+)\1\s*:/gmi
const registryKeys = new Set()
while ((match = registryKeyRegex.exec(registry)) !== null) {
  registryKeys.add(match[2])
}

const errors = []
for (const [slug, sections] of Object.entries(embedConfigs)) {
  for (const [section, cfg] of Object.entries(sections)) {
    const key = `${slug}/${section}`
    if (cfg.type === 'standard') {
      if (!registryKeys.has(key)) {
        errors.push(`Missing embed data registry entry for standard embed: ${key}`)
      }
    }
  }
}

if (errors.length) {
  console.error('Embed consistency errors:')
  errors.forEach(e => console.error(' - ', e))
  process.exit(2)
}

console.log('Embed consistency: OK')
process.exit(0)
