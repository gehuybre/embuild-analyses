import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join, posix, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { discoverAppPackages, ROOT } from "./app-registry.mjs"

export const SHARED_SRC = "packages/embuild-shared/src/"
const SHARED_IMPORT = "@embuild/shared/"
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
const RESOLVE_SUFFIXES = ["", ...SOURCE_EXTENSIONS, ".json", "/index.ts", "/index.tsx", "/index.js"]
const SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']|@import\s+["']([^"']+)["']/g

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--", "apps", SHARED_SRC], {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr.trim() || "git ls-files failed")
  return result.stdout.split("\0").filter(Boolean)
}

function isSource(file) {
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) || file.endsWith(".css")
}

function resolveSpecifier(fromFile, specifier, files) {
  let base
  if (specifier.startsWith(".")) base = posix.join(posix.dirname(fromFile), specifier)
  else if (specifier.startsWith(SHARED_IMPORT)) base = SHARED_SRC + specifier.slice(SHARED_IMPORT.length)
  else return null
  return RESOLVE_SUFFIXES.map((suffix) => base + suffix).find((candidate) => files.has(candidate)) ?? null
}

/**
 * Import graph of the shared package: which shared modules import a shared module,
 * and which apps import it directly. Built from the committed files at HEAD.
 */
export function buildSharedGraph() {
  const files = trackedFiles()
  const fileSet = new Set(files)
  const appDirs = discoverAppPackages()
    .map(({ slug, dir }) => ({ slug, dir: relative(ROOT, dir).replaceAll("\\", "/") + "/" }))
    .sort((a, b) => b.dir.length - a.dir.length)
  const sharedImporters = new Map()
  const appImporters = new Map()
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(value)
  }

  for (const file of files) {
    if (!isSource(file)) continue
    const inShared = file.startsWith(SHARED_SRC)
    const app = inShared ? null : appDirs.find(({ dir }) => file.startsWith(dir))
    if (!inShared && !app) continue
    const content = readFileSync(join(ROOT, file), "utf-8")
    for (const match of content.matchAll(SPECIFIER)) {
      const target = resolveSpecifier(file, match[1] ?? match[2] ?? match[3] ?? match[4], fileSet)
      if (!target?.startsWith(SHARED_SRC)) continue
      if (inShared) add(sharedImporters, target, file)
      else add(appImporters, target, app.slug)
    }
  }
  return { files: fileSet, sharedImporters, appImporters }
}

/**
 * Apps affected by changes to shared-package files. Returns `null` when the change
 * cannot be attributed precisely (package config, deleted or renamed files), which
 * means every app must rebuild.
 */
export function appsAffectedBySharedFiles(changedFiles, graph = buildSharedGraph()) {
  const queue = []
  for (const file of changedFiles) {
    if (!file.startsWith(SHARED_SRC) || !graph.files.has(file)) return null
    const imported = graph.appImporters.has(file) || graph.sharedImporters.has(file)
    // Data or styles might be read by build scripts instead of imported; stay conservative.
    if (!imported && !SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))) return null
    queue.push(file)
  }
  const visited = new Set(queue)
  const apps = new Set()
  while (queue.length) {
    const file = queue.pop()
    for (const slug of graph.appImporters.get(file) ?? []) apps.add(slug)
    for (const importer of graph.sharedImporters.get(file) ?? []) {
      if (visited.has(importer)) continue
      visited.add(importer)
      queue.push(importer)
    }
  }
  return apps
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const changed = process.argv.slice(2)
  const apps = appsAffectedBySharedFiles(changed)
  console.log(apps === null ? "All apps (not attributable)" : [...apps].sort().join("\n") || "No apps")
}
