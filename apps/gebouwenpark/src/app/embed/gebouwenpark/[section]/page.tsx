import { Suspense } from "react"
import { GebouwenparkEmbedRouteClient } from "@/components/GebouwenparkEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("gebouwenpark").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <GebouwenparkEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
