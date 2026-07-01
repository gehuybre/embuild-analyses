import { Suspense } from "react"
import { HuishoudensgroeiEmbedRouteClient } from "@/components/HuishoudensgroeiEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("huishoudensgroei").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <HuishoudensgroeiEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
