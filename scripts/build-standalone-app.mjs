#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { isAbsolute, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"
import { resolveApp, ROOT } from "./app-registry.mjs"

const args = process.argv.slice(2).filter((arg) => arg !== "--")
const slug = args[0]
const outputArg = args[1]

if (!slug) {
  console.error("Usage: node scripts/build-standalone-app.mjs <app-slug> [output-dir]")
  process.exit(1)
}

const app = resolveApp(slug)
if (!app) {
  console.error(`Unknown app slug: ${slug}`)
  process.exit(1)
}

const appDir = app.dir
const standaloneRoot = resolve(ROOT, "dist-standalone")
const defaultOutputDir = join(standaloneRoot, slug)
const outputDir = outputArg ? resolve(ROOT, outputArg) : defaultOutputDir
const outputRelativePath = relative(standaloneRoot, outputDir)
if (
  outputRelativePath === "." ||
  outputRelativePath.startsWith("..") ||
  isAbsolute(outputRelativePath)
) {
  console.error("Standalone output must be inside dist-standalone/")
  process.exit(1)
}
const appOut = join(appDir, "out")
const tempRoot = mkdtempSync(join(tmpdir(), `fin-standalone-${slug}-`))
const backupOutDir = join(tempRoot, "out-backup")
const hadExistingOut = existsSync(appOut)
let existingOutBackedUp = false

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
    throw new Error(`${command} ${commandArgs.join(" ")} exited with code ${result.status ?? 1}`)
  }
}

try {
  if (hadExistingOut) {
    cpSync(appOut, backupOutDir, { recursive: true })
    existingOutBackedUp = true
  }

  run("pnpm", ["--filter", slug, "build"], {
    NEXT_PUBLIC_BASE_PATH: "",
  })

  if (!existsSync(appOut)) throw new Error(`Missing build output for ${slug}: ${appOut}`)

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  cpSync(appOut, outputDir, { recursive: true })
  writeFileSync(
    join(outputDir, "README.md"),
    [
      `# Standalone ${slug}`,
      "",
      `Voorgestelde Cloudflare Pages-projectnaam: \`${slug}\`.`,
      `Na publicatie is de standalone-link: https://${slug}.pages.dev/`,
      "",
      `Bouwen vanuit de repository-root: \`pnpm build:standalone -- ${slug}\`.`,
      "Deze map is een build-output; wijzig de bron in de app-versie, niet hier.",
      "",
    ].join("\n"),
    "utf-8",
  )

  console.log(`\n✓ Standalone build for ${slug} copied to ${outputDir}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (!hadExistingOut || existingOutBackedUp) {
    rmSync(appOut, { recursive: true, force: true })
  }
  if (existingOutBackedUp && existsSync(backupOutDir)) {
    cpSync(backupOutDir, appOut, { recursive: true })
  }
  rmSync(tempRoot, { recursive: true, force: true })
}
