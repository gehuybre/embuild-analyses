import { Suspense } from "react"
import { VergunningenEmbedRouteClient } from "@/components/VergunningenEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("vergunningen-goedkeuringen").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <VergunningenEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
