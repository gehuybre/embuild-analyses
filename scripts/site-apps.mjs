import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveApp } from "./app-registry.mjs"

/**
 * Apps met `"publishToSite": false` in hun package.json staan niet op de gedeelde Cloudflare-site
 * (geen build in de site-workflow, niet in het portaal, niet in dist/). Hun standalone versie kan
 * wel apart gepubliceerd worden.
 */
export function isPublishedToSite(slug) {
  const app = resolveApp(slug)
  if (!app) return false
  const pkgPath = join(app.dir, "package.json")
  return JSON.parse(readFileSync(pkgPath, "utf-8")).publishToSite !== false
}
