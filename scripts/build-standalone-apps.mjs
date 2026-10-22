#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { resolveApp, ROOT } from "./app-registry.mjs"

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const appsJsonIndex = args.indexOf("--apps-json")
const requested = appsJsonIndex >= 0 ? JSON.parse(args[appsJsonIndex + 1] ?? "[]") : []

if (!Array.isArray(requested) || requested.some((slug) => typeof slug !== "string")) {
  console.error("--apps-json must be a JSON array of app slugs")
  process.exit(1)
}

const slugs = [...new Set(requested)].filter((slug) => slug !== "portal")
mkdirSync(join(ROOT, "dist-standalone"), { recursive: true })
for (const slug of slugs) {
  if (!resolveApp(slug)) {
    console.error(`Unknown app slug: ${slug}`)
    process.exit(1)
  }
}

for (const slug of slugs) {
  const result = spawnSync(
    "node",
    ["scripts/build-standalone-app.mjs", slug],
    { cwd: ROOT, stdio: "inherit" },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Built ${slugs.length} standalone app(s).`)
