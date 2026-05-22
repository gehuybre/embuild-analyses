#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const ROOT = join(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((arg) => arg !== "--")
const slug = args[0]
const outputArg = args[1]

if (!slug) {
  console.error("Usage: node scripts/build-standalone-app.mjs <app-slug> [output-dir]")
  process.exit(1)
}

const appDir = join(ROOT, "apps", slug)
if (!existsSync(appDir)) {
  console.error(`Unknown app slug: ${slug}`)
  process.exit(1)
}

const defaultOutputDir = join(ROOT, "dist-standalone", slug)
const outputDir = outputArg ? resolve(ROOT, outputArg) : defaultOutputDir
const appOut = join(appDir, "out")
const tempRoot = mkdtempSync(join(tmpdir(), `fin-standalone-${slug}-`))
const backupOutDir = join(tempRoot, "out-backup")
const hadExistingOut = existsSync(appOut)

function run(command, commandArgs, extraEnv = {}) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`)
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

try {
  if (hadExistingOut) {
    cpSync(appOut, backupOutDir, { recursive: true })
  }

  run("pnpm", ["--filter", slug, "build"], {
    NEXT_PUBLIC_BASE_PATH: "",
  })

  if (!existsSync(appOut)) {
    console.error(`Missing build output for ${slug}: ${appOut}`)
    process.exit(1)
  }

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  cpSync(appOut, outputDir, { recursive: true })

  console.log(`\n✓ Standalone build for ${slug} copied to ${outputDir}`)
} finally {
  rmSync(appOut, { recursive: true, force: true })
  if (hadExistingOut && existsSync(backupOutDir)) {
    cpSync(backupOutDir, appOut, { recursive: true })
  }
  rmSync(tempRoot, { recursive: true, force: true })
}
