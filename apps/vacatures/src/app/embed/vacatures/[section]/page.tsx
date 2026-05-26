import { Suspense } from "react"
import { VacaturesEmbedRouteClient } from "@/components/VacaturesEmbedRouteClient"

const SECTIONS = ["evolutie", "top-beroepen"] as const

type Section = (typeof SECTIONS)[number]

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }))
}

function parseSection(value: string): Section {
  return SECTIONS.includes(value as Section) ? (value as Section) : "evolutie"
}

export default function Page({
  params,
}: {
  params: { section: string }
}) {
  return (
    <Suspense fallback={null}>
      <VacaturesEmbedRouteClient section={parseSection(params.section)} />
    </Suspense>
  )
}
