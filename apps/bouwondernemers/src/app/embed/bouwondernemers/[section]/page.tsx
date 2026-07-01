import { Suspense } from "react"
import { BouwondernemersEmbedRouteClient } from "@/components/BouwondernemersEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("bouwondernemers").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <BouwondernemersEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
