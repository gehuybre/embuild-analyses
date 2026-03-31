"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "@embuild/shared/lib/geo-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type VatSurvivalRow = {
  y: number | null
  r: string | null
  p: string | null
  n1: string | null
  fr: number | null
  s1: number | null
  s2: number | null
  s3: number | null
  s4: number | null
  s5: number | null
}

type YearPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  label?: string
}

type StopHorizon = 1 | 2 | 3 | 4 | 5
type SurvivalKey = "s1" | "s2" | "s3" | "s4" | "s5"
type SectionType = "starters" | "stoppers" | "survival"
type ViewType = "chart" | "table"

function survivalKeyForHorizon(h: StopHorizon): SurvivalKey {
  return `s${h}` as SurvivalKey
}

function filterRowsByGeo(
  rows: VatSurvivalRow[],
  region: RegionCode | null,
  province: ProvinceCode | null
): VatSurvivalRow[] {
  if (province) {
    return rows.filter((r) => r.p && String(r.p) === String(province))
  }
  if (region && region !== "1000") {
    return rows.filter((r) => r.r && String(r.r) === String(region))
  }
  return rows
}

function filterRowsBySector(rows: VatSurvivalRow[], nace1: string | null): VatSurvivalRow[] {
  if (!nace1) return rows
  return rows.filter((r) => r.n1 === nace1)
}

function aggregateStartersByYear(rows: VatSurvivalRow[]): YearPoint[] {
  const agg = new Map<number, number>()
  for (const r of rows) {
    if (typeof r.y !== "number" || typeof r.fr !== "number") continue
    agg.set(r.y, (agg.get(r.y) ?? 0) + r.fr)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({ sortValue: y, periodCells: [y], value: v, label: String(y) }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateStoppersByYear(rows: VatSurvivalRow[], horizon: StopHorizon): YearPoint[] {
  const key = survivalKeyForHorizon(horizon)
  const agg = new Map<number, { fr: number; surv: number }>()
  for (const r of rows) {
    const surv = (r as Record<string, unknown>)[key] as number | null
    if (typeof r.y !== "number" || typeof r.fr !== "number" || typeof surv !== "number") continue
    const prev = agg.get(r.y) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(r.y, prev)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({ sortValue: y, periodCells: [y], value: Math.max(0, v.fr - v.surv), label: String(y) }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateSurvivalRateByYear(rows: VatSurvivalRow[], horizon: StopHorizon): YearPoint[] {
  const key = survivalKeyForHorizon(horizon)
  const agg = new Map<number, { fr: number; surv: number }>()
  for (const r of rows) {
    const surv = (r as Record<string, unknown>)[key] as number | null
    if (typeof r.y !== "number" || typeof r.fr !== "number" || typeof surv !== "number") continue
    const prev = agg.get(r.y) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(r.y, prev)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({
      sortValue: y,
      periodCells: [y],
      value: v.fr > 0 ? Math.round(((v.surv / v.fr) * 100) * 10) / 10 : 0,
      label: String(y),
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(n) + "%"
}

interface StartersStoppersEmbedProps {
  section: SectionType
  viewType: ViewType
  horizon?: StopHorizon
  region?: RegionCode | null
  province?: ProvinceCode | null
  sector?: string | null
}

export function StartersStoppersEmbed({
  section,
  viewType,
  horizon = 1,
  region = null,
  province = null,
  sector = null,
}: StartersStoppersEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    raw: VatSurvivalRow[]
  }>({
    raw: "/data/vat_survivals.json",
  })

  const allRows = useMemo(() => (bundle?.raw ?? []) as VatSurvivalRow[], [bundle])

  const filteredRows = useMemo(() => {
    const bySector = filterRowsBySector(allRows, sector)
    return filterRowsByGeo(bySector, region, province)
  }, [allRows, sector, region, province])

  // Compute the appropriate data series based on section
  const yearSeries = useMemo(() => {
    switch (section) {
      case "starters":
        return aggregateStartersByYear(filteredRows)
      case "stoppers":
        return aggregateStoppersByYear(filteredRows, horizon)
      case "survival":
        return aggregateSurvivalRateByYear(filteredRows, horizon)
    }
  }, [section, filteredRows, horizon])


  // Build title
  const title = useMemo(() => {
    const sectionTitle = section === "starters"
      ? "Aantal starters"
      : section === "stoppers"
        ? `Aantal stoppers (na ${horizon} jaar)`
        : `Overlevingskans na ${horizon} jaar`

    const locationParts: string[] = []
    if (province) {
      const prov = PROVINCES.find((p) => String(p.code) === String(province))
      if (prov) locationParts.push(prov.name)
    } else if (region && region !== "1000") {
      const reg = REGIONS.find((r) => String(r.code) === String(region))
      if (reg) locationParts.push(reg.name)
    }

    if (locationParts.length > 0) {
      return `${sectionTitle} - ${locationParts.join(", ")}`
    }
    return sectionTitle
  }, [section, horizon, province, region])

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  const label = section === "survival" ? "Overlevingskans" : "Aantal"
  const formatValue = section === "survival" ? formatPct : formatInt

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {viewType === "chart" && (
        <FilterableChart
          data={yearSeries}
          getLabel={(d) => String((d as YearPoint).sortValue)}
          getValue={(d) => (d as YearPoint).value}
          getSortValue={(d) => (d as YearPoint).sortValue}
        />
      )}

      {viewType === "table" && (
        <FilterableTable data={yearSeries} label={label} periodHeaders={["Jaar"]} />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}
