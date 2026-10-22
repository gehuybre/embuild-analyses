#!/usr/bin/env node

import { appendFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { appsForChangedPath, discoverAppPackages, ROOT } from "./app-registry.mjs"
import { isPublishedToSite } from "./site-apps.mjs"
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
    const hasNext = index + 1 < argv.length
    if (!hasNext || next.startsWith("--")) {
      args[key] = "true"
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function discoverApps() {
  return discoverAppPackages()
    .map(({ slug }) => slug)
    .filter(isPublishedToSite)
    .sort()
}

function discoverStandaloneApps() {
  return discoverAppPackages()
    .map(({ slug }) => slug)
    .filter((slug) => slug !== "portal")
    .sort()
}

function parseRequestedApps(rawValue, allApps) {
  if (!rawValue) return []

  const trimmed = rawValue.trim()
  if (!trimmed) return []

  let requested = []

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      throw new Error("--apps JSON input must be an array")
    }
    requested = parsed
  } else {
    requested = trimmed
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  }

  const uniqueRequested = [...new Set(requested)]
  const invalid = uniqueRequested.filter((slug) => !allApps.includes(slug))

  if (invalid.length) {
    throw new Error(`Unknown app slug(s): ${invalid.join(", ")}`)
  }

  return uniqueRequested
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
  const allStandaloneApps = discoverStandaloneApps()
  const requestedApps = parseRequestedApps(args.apps, allApps)
  const changedApps = new Set()
  const changedStandaloneApps = new Set()
  let changedFiles = []
  let reason = ""

  const markAllApps = () => {
    for (const slug of allApps) {
      changedApps.add(slug)
    }
    for (const slug of allStandaloneApps) {
      changedStandaloneApps.add(slug)
    }
  }

  if (requestedApps.length) {
    reason = `Explicit app selection requested: ${requestedApps.join(", ")}.`
    for (const slug of requestedApps) {
      changedApps.add(slug)
      if (allStandaloneApps.includes(slug)) changedStandaloneApps.add(slug)
    }
  } else if (eventName === "workflow_dispatch") {
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
        for (const slug of appsForChangedPath(file)) {
          if (allApps.includes(slug)) changedApps.add(slug)
          if (allStandaloneApps.includes(slug)) changedStandaloneApps.add(slug)
        }
        continue
      }

      if (file === "scripts/generate-portal-data.mjs" || file === "scripts/analysis-versions.json") {
        if (allApps.includes("portal")) changedApps.add("portal")
        continue
      }

      if (file === "scripts/update_vergunningen_goedkeuringen_content.py") {
        if (allApps.includes("vergunningen-goedkeuringen")) {
          changedApps.add("vergunningen-goedkeuringen")
        }
        if (allStandaloneApps.includes("vergunningen-goedkeuringen")) {
          changedStandaloneApps.add("vergunningen-goedkeuringen")
        }
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
  const changedStandaloneAppsList = [...changedStandaloneApps].sort()
  const allAppsJson = JSON.stringify(allApps)
  const allStandaloneAppsJson = JSON.stringify(allStandaloneApps)
  const changedAppsJson = JSON.stringify(changedAppsList)
  const changedStandaloneAppsJson = JSON.stringify(changedStandaloneAppsList)

  console.log(reason)
  console.log(`All apps (${allApps.length}): ${allApps.join(", ")}`)
  console.log(`Standalone-eligible apps (${allStandaloneApps.length}): ${allStandaloneApps.join(", ")}`)
  console.log(
    changedAppsList.length
      ? `Apps to build (${changedAppsList.length}): ${changedAppsList.join(", ")}`
      : "Apps to build: none"
  )
  console.log(
    changedStandaloneAppsList.length
      ? `Standalone apps to build (${changedStandaloneAppsList.length}): ${changedStandaloneAppsList.join(", ")}`
      : "Standalone apps to build: none"
  )

  if (changedFiles.length) {
    console.log("Changed files:")
    for (const file of changedFiles) {
      console.log(`- ${file}`)
    }
  }

  writeOutput(outputPath, "all_apps", allAppsJson)
  writeOutput(outputPath, "all_standalone_apps", allStandaloneAppsJson)
  writeOutput(outputPath, "changed_apps", changedAppsJson)
  writeOutput(outputPath, "changed_standalone_apps", changedStandaloneAppsJson)
  writeOutput(outputPath, "changed_count", String(changedAppsList.length))
  writeOutput(outputPath, "changed_standalone_count", String(changedStandaloneAppsList.length))
  writeOutput(outputPath, "reason", reason)
}

main()
