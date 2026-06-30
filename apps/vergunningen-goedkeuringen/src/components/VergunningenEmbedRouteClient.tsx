"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { VergunningenEmbed } from "@/components/VergunningenEmbed"
import { PeriodComparisonEmbed } from "@/components/PeriodComparisonEmbed"

const SLUG = "vergunningen-goedkeuringen"

const PERIOD_COMPARISON_SECTIONS = [
  "renovatie-vergelijking",
  "renovatie-vergelijking-aantallen",
  "renovatie-vergelijking-percentage",
  "nieuwbouw-vergelijking",
  "nieuwbouw-vergelijking-aantallen",
  "nieuwbouw-vergelijking-percentage",
] as const

type PeriodComparisonSection = (typeof PERIOD_COMPARISON_SECTIONS)[number]

const VERGUNNINGEN_SECTIONS = [
  "renovatie",
  "nieuwbouw-dwell",
  "nieuwbouw-apt",
  "nieuwbouw-house",
  "nieuwbouw",
] as const

type VergunningenSection = (typeof VERGUNNINGEN_SECTIONS)[number]

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function VergunningenEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  if ((PERIOD_COMPARISON_SECTIONS as readonly string[]).includes(section)) {
    return <PeriodComparisonEmbed section={section as PeriodComparisonSection} />
  }

  const embedSection: VergunningenSection = (VERGUNNINGEN_SECTIONS as readonly string[]).includes(section)
    ? (section as VergunningenSection)
    : "nieuwbouw-dwell"

  const view = prefixedParam(searchParams, "view")
  const viewType = view === "table" ? "table" : view === "map" ? "map" : "chart"

  const embedParams = useMemo(() => ({
    viewType: viewType as "chart" | "table" | "map",
    timeRange: prefixedParam(searchParams, "range"),
    geoLevel: prefixedParam(searchParams, "geoLevel"),
    region: prefixedParam(searchParams, "region"),
    chartType: prefixedParam(searchParams, "chartType"),
    showMovingAverage: prefixedParam(searchParams, "ma") === "1",
    showProvinceBoundaries: prefixedParam(searchParams, "boundaries") === "1",
  }), [searchParams, viewType])

  return (
    <VergunningenEmbed
      section={embedSection}
      {...embedParams}
    />
  )
}
