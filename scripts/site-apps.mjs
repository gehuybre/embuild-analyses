import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const APPS_DIR = join(import.meta.dirname, "..", "apps")

/**
 * Apps met `"publishToSite": false` in hun package.json staan niet op de gedeelde Cloudflare-site
 * (geen build in de site-workflow, niet in het portaal, niet in dist/). Hun standalone versie kan
 * wel apart gepubliceerd worden.
 */
export function isPublishedToSite(slug) {
  const pkgPath = join(APPS_DIR, slug, "package.json")
  if (!existsSync(pkgPath)) return true
  return JSON.parse(readFileSync(pkgPath, "utf-8")).publishToSite !== false
}
