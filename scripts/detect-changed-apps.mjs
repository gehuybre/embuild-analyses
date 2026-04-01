#!/usr/bin/env node

import { appendFileSync, existsSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const APPS_DIR = join(ROOT, "apps")
const ZERO_SHA = "0000000000000000000000000000000000000000"
const ROOT_WIDE_PATHS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
])

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

function discoverApps() {
  return readdirSync(APPS_DIR)
    .filter((slug) => existsSync(join(APPS_DIR, slug, "package.json")))
    .sort()
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf-8",
  })

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`)
  }

  return result.stdout.trim()
}

function commitExists(sha) {
  if (!sha || sha === ZERO_SHA) return false
  const result = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
    cwd: ROOT,
    stdio: "ignore",
  })
  return result.status === 0
}

function writeOutput(path, key, value) {
  if (!path) return
  appendFileSync(path, `${key}<<__EOF__\n${value}\n__EOF__\n`, "utf-8")
}

function main() {
  const args = parseArgs(process.argv)
  const base = args.base?.trim()
  const head = args.head?.trim() || "HEAD"
  const eventName = args["event-name"]?.trim() || ""
  const outputPath = args.output?.trim()
  const allApps = discoverApps()
  const changedApps = new Set()
  let changedFiles = []
  let reason = ""

  const markAllApps = () => {
    for (const slug of allApps) {
      changedApps.add(slug)
    }
  }

  const addSlug = (slug) => {
    if (allApps.includes(slug)) {
      changedApps.add(slug)
    }
  }

  if (eventName === "workflow_dispatch") {
    reason = "Manual dispatch rebuilds all apps."
    markAllApps()
  } else if (!base || base === ZERO_SHA || !commitExists(base) || !commitExists(head)) {
    reason = "Diff base is unavailable, so all apps will rebuild."
    markAllApps()
  } else {
    changedFiles = runGit(["diff", "--name-only", base, head])
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)

    for (const file of changedFiles) {
      if (ROOT_WIDE_PATHS.has(file) || file.startsWith("packages/")) {
        markAllApps()
        continue
      }

      if (file.startsWith("apps/")) {
        const [, slug] = file.split("/", 3)
        addSlug(slug)
        continue
      }

      if (file === "scripts/generate-portal-data.mjs") {
        addSlug("portal")
        continue
      }

      if (file === "scripts/update_vergunningen_goedkeuringen_content.py") {
        addSlug("vergunningen-goedkeuringen")
        continue
      }

      if (file === "scripts/merge-outputs.mjs" || file.startsWith(".github/workflows/")) {
        continue
      }

      if (file.startsWith("scripts/")) {
        markAllApps()
      }
    }

    reason = changedFiles.length
      ? `Detected ${changedFiles.length} changed file(s) between ${base} and ${head}.`
      : `No file changes detected between ${base} and ${head}.`
  }

  const changedAppsList = [...changedApps].sort()
  const allAppsJson = JSON.stringify(allApps)
  const changedAppsJson = JSON.stringify(changedAppsList)

  console.log(reason)
  console.log(`All apps (${allApps.length}): ${allApps.join(", ")}`)
  console.log(
    changedAppsList.length
      ? `Apps to build (${changedAppsList.length}): ${changedAppsList.join(", ")}`
      : "Apps to build: none"
  )

  if (changedFiles.length) {
    console.log("Changed files:")
    for (const file of changedFiles) {
      console.log(`- ${file}`)
    }
  }

  writeOutput(outputPath, "all_apps", allAppsJson)
  writeOutput(outputPath, "changed_apps", changedAppsJson)
  writeOutput(outputPath, "changed_count", String(changedAppsList.length))
  writeOutput(outputPath, "reason", reason)
}

main()
