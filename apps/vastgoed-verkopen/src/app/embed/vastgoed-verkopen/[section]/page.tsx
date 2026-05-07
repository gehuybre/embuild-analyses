import { Suspense } from "react"
import { VastgoedEmbedRouteClient } from "@/components/VastgoedEmbedRouteClient"

const SECTIONS = ["transacties", "prijzen", "transacties-kwartaal", "prijzen-kwartaal"] as const

type Section = (typeof SECTIONS)[number]

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }))
}

function parseSection(value: string): Section {
  return SECTIONS.includes(value as Section) ? (value as Section) : "transacties"
}

export default function Page({
  params,
}: {
  params: { section: string }
}) {
  return (
    <Suspense fallback={null}>
      <VastgoedEmbedRouteClient section={parseSection(params.section)} />
    </Suspense>
  )
}
