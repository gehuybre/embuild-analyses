import { Suspense } from "react"
import { NbbRenteEmbedRouteClient } from "@/components/NbbRenteEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("nbb-rente").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <NbbRenteEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
