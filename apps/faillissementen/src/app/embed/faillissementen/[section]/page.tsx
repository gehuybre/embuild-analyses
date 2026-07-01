import { Suspense } from "react"
import { FaillissementenEmbedRouteClient } from "@/components/FaillissementenEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("faillissementen").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <FaillissementenEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
