#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((arg) => arg !== "--")
const slug = args[0]

if (!slug) {
  console.error("Usage: node scripts/build-single-app-preview.mjs <app-slug>")
  process.exit(1)
}

const appDir = join(ROOT, "apps", slug)
if (!existsSync(appDir)) {
  console.error(`Unknown app slug: ${slug}`)
  process.exit(1)
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run("pnpm", ["--filter", slug, "build"])
run("node", ["scripts/merge-outputs.mjs"])
