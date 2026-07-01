import { Suspense } from "react"
import { InschrijvingenOnderwijsEmbedRouteClient } from "@/components/InschrijvingenOnderwijsEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("inschrijvingen-onderwijs").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <InschrijvingenOnderwijsEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
