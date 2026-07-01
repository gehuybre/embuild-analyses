import { Suspense } from "react"
import { VergunningenAanvragenEmbedRouteClient } from "@/components/VergunningenAanvragenEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("vergunningen-aanvragen").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <VergunningenAanvragenEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
