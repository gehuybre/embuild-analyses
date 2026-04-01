#!/usr/bin/env node

import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith("--")) continue
    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      args[key] = "true"
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function run(command, args, dryRun) {
  console.log(`$ ${command} ${args.join(" ")}`)
  if (dryRun) return

  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function main() {
  const args = parseArgs(process.argv)
  const apps = JSON.parse(args["apps-json"] || "[]")
  const missingOutOnly = args["missing-out-only"] === "true"
  const dryRun = args["dry-run"] === "true"

  if (!Array.isArray(apps)) {
    console.error("--apps-json must be a JSON array of app slugs")
    process.exit(1)
  }

  const queue = apps.filter((slug) => {
    if (!missingOutOnly) return true
    return !existsSync(join(ROOT, "apps", slug, "out"))
  })

  if (!queue.length) {
    console.log(missingOutOnly ? "All requested app outputs already exist." : "No apps requested.")
    return
  }

  for (const slug of queue) {
    run("pnpm", ["--filter", slug, "build"], dryRun)
  }
}

main()
