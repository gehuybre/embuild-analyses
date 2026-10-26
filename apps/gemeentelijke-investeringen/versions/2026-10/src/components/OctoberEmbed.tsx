"use client"

import { useSearchParams } from "next/navigation"
import { COMPARISON_SECTIONS, SLUG, type Section } from "@/lib/sections"
import { OctoberComparison } from "./OctoberDashboard"
import { BreakdownSection } from "./BreakdownSection"
import { PlannedYearlySection } from "./PlannedYearlySection"
import { FLANDERS } from "./geo"

export function OctoberEmbed({ section }: { section: Section }) {
  const params = useSearchParams()
  const param = (name: string) => params.get(`${SLUG}.${name}`) ?? params.get(name) ?? undefined
  const viewType = param("view") === "table" ? "table" : "chart"
  const geo = param("geo") ?? FLANDERS
  const comparison = COMPARISON_SECTIONS.find((value) => value === section)
  if (comparison) return <OctoberComparison section={comparison} viewType={viewType} initialGeo={geo} />
  if (section === "investments-planned-2026-2031") {
    return (
      <PlannedYearlySection
        viewType={viewType}
        initialGeo={geo}
        initialDomain={param("domein") ?? ""}
        initialAccount={param("rekening") ?? ""}
      />
    )
  }
  return (
    <BreakdownSection
      kind={section === "investments-bv-breakdown" ? "bv" : "rek"}
      initialGeo={geo}
      initialMetric={param("metric") === "capita" ? "capita" : "total"}
      initialPeriod={Number(param("periode") ?? 2026)}
      initialSource={param("bron") === "actual" ? "actual" : "latest"}
    />
  )
}
