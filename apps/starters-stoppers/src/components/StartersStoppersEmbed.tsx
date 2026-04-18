"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "@embuild/shared/lib/geo-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type SectionType = "starters" | "stoppers" | "survival"
type ViewType = "chart" | "table"
type TimeRange = "yearly" | "quarterly" | "monthly"
type StopHorizon = 1 | 2 | 3 | 4 | 5
type SurvivalKey = "s1" | "s2" | "s3" | "s4" | "s5"

type MonthlyFlowRow = {
  y: number
  q: number
  mo: number
  period: string
  n1: string
  fr: number
  st: number
}

type RegionalMonthlyFlowRow = MonthlyFlowRow & {
  g: RegionCode
}

type AnnualFlowRow = {
  y: number
  g: RegionCode
  n1: string
  fr: number
  st: number
}

type MonthlySummary = {
  yearlyMaxYear: number
}

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

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  label: string
}

const MONTH_NAMES_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const MONTHLY_REGION_OPTIONS: Array<{ code: RegionCode; label: string }> = [
  { code: "1000", label: "België" },
  { code: "2000", label: "Vlaanderen" },
  { code: "3000", label: "Wallonië" },
  { code: "4000", label: "Brussel" },
]

function survivalKeyForHorizon(horizon: StopHorizon): SurvivalKey {
  return `s${horizon}` as SurvivalKey
}

function filterMonthlyRows(rows: MonthlyFlowRow[], sector: string | null) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.n1 === code)
}

function filterRegionalMonthlyRows(rows: RegionalMonthlyFlowRow[], sector: string | null, region: RegionCode) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.g === region && row.n1 === code)
}

function filterAnnualRows(rows: AnnualFlowRow[], sector: string | null, region: RegionCode) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.g === region && row.n1 === code)
}

function aggregateMonthlyMetric(rows: MonthlyFlowRow[], metric: "fr" | "st", timeRange: TimeRange): ChartPoint[] {
  const grouped = new Map<string, ChartPoint>()

  for (const row of rows) {
    let key: string
    let label: string
    let sortValue: number

    if (timeRange === "yearly") {
      key = String(row.y)
      label = String(row.y)
      sortValue = row.y
    } else if (timeRange === "quarterly") {
      key = `${row.y}-K${row.q}`
      label = `K${row.q} ${row.y}`
      sortValue = row.y * 10 + row.q
    } else {
      key = row.period
      label = `${MONTH_NAMES_SHORT[row.mo - 1]} ${row.y}`
      sortValue = row.y * 100 + row.mo
    }

    const existing = grouped.get(key)
    if (existing) {
      existing.value += row[metric]
      continue
    }

    grouped.set(key, {
      sortValue,
      periodCells: [label],
      value: row[metric],
      label,
    })
  }

  return Array.from(grouped.values()).sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateAnnualMetric(rows: AnnualFlowRow[], metric: "fr" | "st"): ChartPoint[] {
  return rows
    .map((row) => ({
      sortValue: row.y,
      periodCells: [row.y],
      value: row[metric],
      label: String(row.y),
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function formatMonthlyRegionLabel(regionCode: RegionCode) {
  return MONTHLY_REGION_OPTIONS.find((option) => option.code === regionCode)?.label ?? "België"
}

function filterSurvivalRowsByGeo(rows: VatSurvivalRow[], region: RegionCode | null, province: ProvinceCode | null) {
  if (province) {
    return rows.filter((row) => row.p && String(row.p) === String(province))
  }
  if (region && region !== "1000") {
    return rows.filter((row) => row.r && String(row.r) === String(region))
  }
  return rows
}

function filterSurvivalRowsBySector(rows: VatSurvivalRow[], sector: string | null) {
  if (!sector) return rows
  return rows.filter((row) => row.n1 === sector)
}

function aggregateSurvivalRateByYear(rows: VatSurvivalRow[], horizon: StopHorizon): ChartPoint[] {
  const key = survivalKeyForHorizon(horizon)
  const grouped = new Map<number, { fr: number; surv: number }>()

  for (const row of rows) {
    const survived = (row as Record<string, unknown>)[key] as number | null
    if (typeof row.y !== "number" || typeof row.fr !== "number" || typeof survived !== "number") continue
    const current = grouped.get(row.y) ?? { fr: 0, surv: 0 }
    current.fr += row.fr
    current.surv += survived
    grouped.set(row.y, current)
  }

  return Array.from(grouped.entries())
    .map(([year, values]) => ({
      sortValue: year,
      periodCells: [year],
      value: values.fr > 0 ? Math.round((values.surv / values.fr) * 1000) / 10 : 0,
      label: String(year),
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

interface StartersStoppersEmbedProps {
  section: SectionType
  viewType: ViewType
  horizon?: StopHorizon
  region?: RegionCode | null
  province?: ProvinceCode | null
  sector?: string | null
  timeRange?: TimeRange
}

export function StartersStoppersEmbed({
  section,
  viewType,
  horizon = 1,
  region = null,
  province = null,
  sector = null,
  timeRange = "yearly",
}: StartersStoppersEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    monthlyRaw: MonthlyFlowRow[]
    monthlyRegionalRaw: RegionalMonthlyFlowRow[]
    yearlyRaw: AnnualFlowRow[]
    monthlySummary: MonthlySummary
    survivalRaw: VatSurvivalRow[]
  }>({
    monthlyRaw: "/data/vat_monthly_flows.json",
    monthlyRegionalRaw: "/data/vat_monthly_flows_regions.json",
    yearlyRaw: "/data/vat_yearly_flows.json",
    monthlySummary: "/data/summary.json",
    survivalRaw: "/data/vat_survivals.json",
  })

  const monthlyRows = useMemo(() => bundle?.monthlyRaw ?? [], [bundle])
  const monthlyRegionalRows = useMemo(() => bundle?.monthlyRegionalRaw ?? [], [bundle])
  const yearlyRows = useMemo(() => bundle?.yearlyRaw ?? [], [bundle])
  const survivalRows = useMemo(() => bundle?.survivalRaw ?? [], [bundle])
  const selectedRegion = region ?? "1000"

  const data = useMemo(() => {
    if (section === "starters") {
      if (timeRange === "yearly") {
        return aggregateAnnualMetric(filterAnnualRows(yearlyRows, sector, selectedRegion), "fr")
      }
      return aggregateMonthlyMetric(
        selectedRegion === "1000"
          ? filterMonthlyRows(monthlyRows, sector)
          : filterRegionalMonthlyRows(monthlyRegionalRows, sector, selectedRegion),
        "fr",
        timeRange
      )
    }
    if (section === "stoppers") {
      if (timeRange === "yearly") {
        return aggregateAnnualMetric(filterAnnualRows(yearlyRows, sector, selectedRegion), "st")
      }
      return aggregateMonthlyMetric(
        selectedRegion === "1000"
          ? filterMonthlyRows(monthlyRows, sector)
          : filterRegionalMonthlyRows(monthlyRegionalRows, sector, selectedRegion),
        "st",
        timeRange
      )
    }
    return aggregateSurvivalRateByYear(
      filterSurvivalRowsByGeo(filterSurvivalRowsBySector(survivalRows, sector), region, province),
      horizon
    )
  }, [horizon, monthlyRegionalRows, monthlyRows, province, region, sector, section, selectedRegion, survivalRows, timeRange, yearlyRows])

  const title = useMemo(() => {
    if (section === "starters") {
      return selectedRegion !== "1000" ? `Aantal starters - ${formatMonthlyRegionLabel(selectedRegion)}` : "Aantal starters"
    }
    if (section === "stoppers") {
      return selectedRegion !== "1000" ? `Aantal stoppers - ${formatMonthlyRegionLabel(selectedRegion)}` : "Aantal stoppers"
    }

    const locationParts: string[] = []
    if (province) {
      const provinceMatch = PROVINCES.find((item) => String(item.code) === String(province))
      if (provinceMatch) locationParts.push(provinceMatch.name)
    } else if (region && region !== "1000") {
      const regionMatch = REGIONS.find((item) => item.code === region)
      if (regionMatch) locationParts.push(regionMatch.name)
    }

    const baseTitle = `Overlevingskans na ${horizon} jaar`
    return locationParts.length > 0 ? `${baseTitle} - ${locationParts.join(", ")}` : baseTitle
  }, [horizon, province, region, section, selectedRegion])

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
  const periodHeader = section === "survival" ? "Jaar" : timeRange === "yearly" ? "Jaar" : "Periode"

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>

      {viewType === "chart" && (
        <FilterableChart
          data={data}
          getLabel={(point) => (point as ChartPoint).label}
          getValue={(point) => (point as ChartPoint).value}
          getSortValue={(point) => (point as ChartPoint).sortValue}
        />
      )}

      {viewType === "table" && (
        <FilterableTable
          data={data}
          label={label}
          periodHeaders={[periodHeader]}
        />
      )}

      <div className="mt-4 text-center text-xs text-muted-foreground">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}
