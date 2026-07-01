import { Suspense } from "react"
import { SilcEnergieEmbedRouteClient } from "@/components/SilcEnergieEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("silc-energie-2023").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <SilcEnergieEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
