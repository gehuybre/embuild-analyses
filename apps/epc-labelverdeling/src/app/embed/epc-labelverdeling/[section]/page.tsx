import { Suspense } from "react"
import { EpcLabelverdelingEmbedRouteClient } from "@/components/EpcLabelverdelingEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("epc-labelverdeling").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <EpcLabelverdelingEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
