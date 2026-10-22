import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

export const ROOT = join(import.meta.dirname, "..")
export const APPS_DIR = join(ROOT, "apps")

export function discoverAppPackages() {
  const apps = []
  for (const family of readdirSync(APPS_DIR).sort()) {
    const familyDir = join(APPS_DIR, family)
    const familyPackage = join(familyDir, "package.json")
    if (existsSync(familyPackage)) {
      const pkg = JSON.parse(readFileSync(familyPackage, "utf-8"))
      apps.push({ slug: pkg.name, dir: familyDir, family, version: "current" })
    }

    const versionsDir = join(familyDir, "versions")
    if (!existsSync(versionsDir)) continue
    for (const version of readdirSync(versionsDir).sort()) {
      const dir = join(versionsDir, version)
      const packagePath = join(dir, "package.json")
      if (!existsSync(packagePath)) continue
      const pkg = JSON.parse(readFileSync(packagePath, "utf-8"))
      apps.push({ slug: pkg.name, dir, family, version })
    }
  }
  return apps
}

export function resolveApp(slug) {
  const app = discoverAppPackages().find((candidate) => candidate.slug === slug)
  return app ?? null
}

export function appsForChangedPath(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/")
  const apps = discoverAppPackages()
  const matches = apps.filter(({ dir }) => {
    const appPath = relative(ROOT, dir).replaceAll("\\", "/")
    return normalizedPath === appPath || normalizedPath.startsWith(`${appPath}/`)
  })
  if (matches.length) return matches.map(({ slug }) => slug)

  const match = normalizedPath.match(/^apps\/([^/]+)(?:\/|$)/)
  if (!match) return []
  const family = match[1]
  return apps.filter((app) => app.family === family).map(({ slug }) => slug)
}
