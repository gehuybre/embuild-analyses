import { GIPDashboard } from "@/components/GIPDashboard"

const SECTIONS = ["overview", "map", "projects", "reconciliation", "large"] as const

type GipTab = (typeof SECTIONS)[number]

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }))
}

function parseSection(value: string): GipTab {
  return SECTIONS.includes(value as GipTab) ? (value as GipTab) : "overview"
}

export default function Page({
  params,
}: {
  params: { section: string }
}) {
  return <GIPDashboard embeddedSection={parseSection(params.section)} />
}
