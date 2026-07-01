import { Suspense } from "react"
import { StartersStoppersEmbedRouteClient } from "@/components/StartersStoppersEmbedRouteClient"
import { getValidSections } from "@embuild/shared/lib/embed-config"

export function generateStaticParams() {
  return getValidSections("starters-stoppers").map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  return (
    <Suspense fallback={null}>
      <StartersStoppersEmbedRouteClient section={params.section} />
    </Suspense>
  )
}
