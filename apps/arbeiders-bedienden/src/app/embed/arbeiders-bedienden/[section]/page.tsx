import { Suspense } from "react"
import { ArbeidersBediendenEmbedRouteClient } from "@/components/ArbeidersBediendenEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("arbeiders-bedienden").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <ArbeidersBediendenEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
