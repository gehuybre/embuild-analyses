import { Suspense } from "react"
import { BetaalbaarArrEmbedRouteClient } from "@/components/BetaalbaarArrEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("betaalbaar-arr").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <BetaalbaarArrEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
