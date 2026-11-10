import path from "node:path"
import { readFile } from "node:fs/promises"
import { Suspense } from "react"
import { getValidSections } from "@embuild/shared/lib/embed-config"
import { FinIndicatorenEmbedRouteClient } from "@/components/FinIndicatorenEmbedRouteClient"

export function generateStaticParams() {
  return getValidSections("fin-indicatoren").map((section) => ({ section }))
}

async function loadJson(name: string) {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "public", "data", name), "utf-8"))
  } catch {
    return null
  }
}

export default async function Page({ params }: { params: { section: string } }) {
  const file =
    params.section === "eurostat" ? "eurostat-sbs.json" : params.section === "marktwerking" ? "marktwerking.json" : "article.json"
  const data = await loadJson(file)
  return (
    <Suspense fallback={null}>
      <FinIndicatorenEmbedRouteClient section={params.section} data={data} />
    </Suspense>
  )
}
