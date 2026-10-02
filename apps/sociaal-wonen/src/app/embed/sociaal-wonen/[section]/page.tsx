import { Suspense } from "react"
import { getValidSections } from "@embuild/shared/lib/embed-config"
import { SociaalWonenEmbedRouteClient } from "@/components/SociaalWonenEmbedRouteClient"
import type { Tab } from "@/lib/types"

const SECTIONS: Tab[] = ["kaart", "tabel", "projecten"]

export function generateStaticParams() {
  // enkel secties die ook in EMBED_CONFIGS staan, zodat de validator en de routes gelijk blijven
  const valid = new Set(getValidSections("sociaal-wonen"))
  return SECTIONS.filter((s) => valid.has(s)).map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  // onbekende secties kunnen met output: "export" niet voorkomen (dynamicParams=false), dus enkel geldige waarden
  const section = (SECTIONS.includes(params.section as Tab) ? params.section : "kaart") as Tab
  return (
    <Suspense fallback={null}>
      <SociaalWonenEmbedRouteClient section={section} />
    </Suspense>
  )
}
