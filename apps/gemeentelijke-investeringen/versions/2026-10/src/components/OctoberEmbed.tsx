"use client"

import { useSearchParams } from "next/navigation"
import { COMPARISON_SECTIONS, SLUG, type Section } from "@/lib/sections"
import { OctoberComparison } from "./OctoberDashboard"
import { BreakdownSection } from "./BreakdownSection"
import { PlannedYearlySection } from "./PlannedYearlySection"
import { ShareSection, YearlyShareSection } from "./ShareSection"
import { DomainInvestmentsSection, IndexedInvestmentsSection } from "./DomainSections"
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
  if (section === "investments-share-yearly") return <YearlyShareSection viewType={viewType} initialGeo={geo} />
  if (section === "investments-share-total") return <ShareSection viewType={viewType} initialGeo={geo} />
  const view = param("view") === "table" ? "table" : param("view") === "map" ? "map" : "chart"
  const metric = param("metric") === "capita" ? "capita" : "total"
  if (section === "investments-bv") return <DomainInvestmentsSection viewType={view} initialGeo={geo} initialMetric={metric} initialDomain={param("domein") ?? ""} />
  if (section === "investments-bv-indexed") return <IndexedInvestmentsSection viewType={view} initialGeo={geo} initialMetric={metric} />
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
