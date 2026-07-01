import { Suspense } from "react"
import { EnergiekaartPremiesEmbedRouteClient } from "@/components/EnergiekaartPremiesEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("energiekaart-premies").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <EnergiekaartPremiesEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
