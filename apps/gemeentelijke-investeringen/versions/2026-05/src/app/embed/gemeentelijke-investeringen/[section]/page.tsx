import { Suspense } from "react"
import { GemeentelijkeInvesteringenEmbedRouteClient } from "@/components/GemeentelijkeInvesteringenEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("gemeentelijke-investeringen").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <GemeentelijkeInvesteringenEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
