"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "@embuild/shared/lib/geo-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { FilterItem, MigrationData, MigrationDim } from "@/lib/migration"
import { EmbedFilters } from "@/components/EmbedFilters"
import { MigrationEmbed, MigrationVariant } from "@/components/MigrationSection"

type SectionType =
  | "starters"
  | "stoppers"
  | "survival"
  | "enterprises"
  | "enterprises-no-staff"
  | "migration"
  | "migration-balance"
  | "migration-matrix"
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
  g: string // gewestcode of provinciecode
}

type AnnualFlowRow = {
  y: number
  g: string
  n1: string
  fr: number
  st: number
}

type MonthlySummary = {
  yearlyMaxYear: number
  enterpriseCounts?: {
    latestYear: number
    availableYears?: number[]
  }
}

type EnterpriseWorkerClassRow = {
  y: number
  g: string
  n1: string
  w: string
  vat: number
}

type EnterpriseLookups = {
  latestYear: number
  years: number[]
  workerClasses: Array<{ code: string; nl: string }>
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

const BRUSSELS_PROVINCE_CODE = "21000"

// Brussel is zowel gewest als "provincie"; in de data bestaat het enkel als gewest.
function resolveGeoCode(region: RegionCode, province: ProvinceCode | null): string {
  return province && String(province) !== BRUSSELS_PROVINCE_CODE ? String(province) : region
}

function formatYearRanges(years: number[]) {
  if (years.length === 0) return ""
  const sorted = [...years].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let previous = sorted[0]

  for (let index = 1; index < sorted.length; index += 1) {
    const year = sorted[index]
    if (year === previous + 1) {
      previous = year
      continue
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`)
    start = year
    previous = year
  }

  ranges.push(start === previous ? String(start) : `${start}-${previous}`)
  return ranges.join(", ")
}

function survivalKeyForHorizon(horizon: StopHorizon): SurvivalKey {
  return `s${horizon}` as SurvivalKey
}

function filterMonthlyRows(rows: MonthlyFlowRow[], sector: string | null) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.n1 === code)
}

function filterRegionalMonthlyRows(rows: RegionalMonthlyFlowRow[], sector: string | null, region: string) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.g === region && row.n1 === code)
}

function filterAnnualRows(rows: AnnualFlowRow[], sector: string | null, region: string) {
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

function filterEnterpriseRows(rows: EnterpriseWorkerClassRow[], sector: string | null, region: string, workerClass: string | null) {
  const code = sector ?? "ALL"
  return rows.filter((row) => row.g === region && row.n1 === code && (!workerClass || row.w === workerClass))
}

function aggregateEnterpriseCountsByYear(rows: EnterpriseWorkerClassRow[]): ChartPoint[] {
  const grouped = new Map<number, number>()

  for (const row of rows) {
    grouped.set(row.y, (grouped.get(row.y) ?? 0) + row.vat)
  }

  return Array.from(grouped.entries())
    .map(([year, value]) => ({
      sortValue: year,
      periodCells: [year],
      value,
      label: String(year),
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateEnterpriseNoEmployeeShareByYear(rows: EnterpriseWorkerClassRow[]): ChartPoint[] {
  const grouped = new Map<number, { total: number; noEmployees: number }>()

  for (const row of rows) {
    const current = grouped.get(row.y) ?? { total: 0, noEmployees: 0 }
    current.total += row.vat
    if (row.w === "00") current.noEmployees += row.vat
    grouped.set(row.y, current)
  }

  return Array.from(grouped.entries())
    .map(([year, values]) => ({
      sortValue: year,
      periodCells: [year],
      value: values.total > 0 ? Math.round((values.noEmployees / values.total) * 1000) / 10 : 0,
      label: String(year),
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function formatPct(value: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(value) + "%"
}

function formatMonthlyRegionLabel(regionCode: RegionCode) {
  return MONTHLY_REGION_OPTIONS.find((option) => option.code === regionCode)?.label ?? "België"
}

function formatGeoLabel(region: RegionCode, province: ProvinceCode | null) {
  if (province && String(province) !== BRUSSELS_PROVINCE_CODE) {
    return PROVINCES.find((item) => String(item.code) === String(province))?.name ?? "Provincie"
  }
  return formatMonthlyRegionLabel(region)
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
  workerClass?: string | null
  timeRange?: TimeRange
  counterpart?: string | null
  migrationDim?: MigrationDim
  category?: string | null
  year?: number | null
}

export function StartersStoppersEmbed({
  section,
  viewType,
  horizon = 1,
  region = null,
  province = null,
  sector = null,
  workerClass = null,
  timeRange = "yearly",
  counterpart = null,
  migrationDim = "tot",
  category = null,
  year = null,
}: StartersStoppersEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    monthlyRaw: MonthlyFlowRow[]
    monthlyRegionalRaw: RegionalMonthlyFlowRow[]
    monthlyProvincialRaw: RegionalMonthlyFlowRow[]
    yearlyProvincialRaw: AnnualFlowRow[]
    enterpriseProvincialRaw: EnterpriseWorkerClassRow[]
    yearlyRaw: AnnualFlowRow[]
    monthlySummary: MonthlySummary
    enterpriseRaw: EnterpriseWorkerClassRow[]
    enterpriseLookups: EnterpriseLookups
    survivalRaw: VatSurvivalRow[]
    migration: MigrationData
    monthlyLookups: { sectors: Array<{ code: string; nl: string }> }
    survivalLookups: { nace_lvl1?: Array<{ code: string; nl?: string | null; en?: string | null }> }
  }>({
    monthlyRaw: "/data/vat_monthly_flows.json",
    monthlyRegionalRaw: "/data/vat_monthly_flows_regions.json",
    monthlyProvincialRaw: "/data/vat_monthly_flows_provinces.json",
    yearlyProvincialRaw: "/data/vat_yearly_flows_provinces.json",
    enterpriseProvincialRaw: "/data/vat_enterprises_worker_class_provinces.json",
    yearlyRaw: "/data/vat_yearly_flows.json",
    monthlySummary: "/data/summary.json",
    enterpriseRaw: "/data/vat_enterprises_worker_class.json",
    enterpriseLookups: "/data/vat_enterprises_lookups.json",
    survivalRaw: "/data/vat_survivals.json",
    migration: "/data/vat_migration.json",
    monthlyLookups: "/data/vat_monthly_lookups.json",
    survivalLookups: "/data/lookups.json",
  })

  const monthlyRows = useMemo(() => bundle?.monthlyRaw ?? [], [bundle])
  // Provinciecodes botsen niet met gewestcodes, dus gewest- en provinciale rijen kunnen samen gefilterd worden op `g`.
  const monthlyRegionalRows = useMemo(
    () => [...(bundle?.monthlyRegionalRaw ?? []), ...(bundle?.monthlyProvincialRaw ?? [])],
    [bundle]
  )
  const yearlyRows = useMemo(() => [...(bundle?.yearlyRaw ?? []), ...(bundle?.yearlyProvincialRaw ?? [])], [bundle])
  const enterpriseRows = useMemo(
    () => [...(bundle?.enterpriseRaw ?? []), ...(bundle?.enterpriseProvincialRaw ?? [])],
    [bundle]
  )
  const survivalRows = useMemo(() => bundle?.survivalRaw ?? [], [bundle])
  const selectedRegion = region ?? "1000"
  const selectedGeo = resolveGeoCode(selectedRegion, province)
  const enterpriseAvailableYears = bundle?.monthlySummary?.enterpriseCounts?.availableYears ?? bundle?.enterpriseLookups?.years ?? []
  const workerClassLabels = useMemo(() => new Map((bundle?.enterpriseLookups?.workerClasses ?? []).map((row) => [row.code, row.nl])), [bundle])

  const data = useMemo(() => {
    if (section === "starters") {
      if (timeRange === "yearly") {
        return aggregateAnnualMetric(filterAnnualRows(yearlyRows, sector, selectedGeo), "fr")
      }
      return aggregateMonthlyMetric(
        selectedGeo === "1000"
          ? filterMonthlyRows(monthlyRows, sector)
          : filterRegionalMonthlyRows(monthlyRegionalRows, sector, selectedGeo),
        "fr",
        timeRange
      )
    }
    if (section === "stoppers") {
      if (timeRange === "yearly") {
        return aggregateAnnualMetric(filterAnnualRows(yearlyRows, sector, selectedGeo), "st")
      }
      return aggregateMonthlyMetric(
        selectedGeo === "1000"
          ? filterMonthlyRows(monthlyRows, sector)
          : filterRegionalMonthlyRows(monthlyRegionalRows, sector, selectedGeo),
        "st",
        timeRange
      )
    }
    if (section === "enterprises") {
      return aggregateEnterpriseCountsByYear(filterEnterpriseRows(enterpriseRows, sector, selectedGeo, workerClass))
    }
    if (section === "enterprises-no-staff") {
      return aggregateEnterpriseNoEmployeeShareByYear(filterEnterpriseRows(enterpriseRows, sector, selectedGeo, null))
    }
    return aggregateSurvivalRateByYear(
      filterSurvivalRowsByGeo(filterSurvivalRowsBySector(survivalRows, sector), region, province),
      horizon
    )
  }, [enterpriseRows, horizon, monthlyRegionalRows, monthlyRows, province, region, sector, section, selectedGeo, survivalRows, timeRange, workerClass, yearlyRows])

  const title = useMemo(() => {
    if (section === "starters") {
      return selectedRegion !== "1000" ? `Aantal starters - ${formatGeoLabel(selectedRegion, province)}` : "Aantal starters"
    }
    if (section === "stoppers") {
      return selectedRegion !== "1000" ? `Aantal stoppers - ${formatGeoLabel(selectedRegion, province)}` : "Aantal stoppers"
    }
    if (section === "enterprises-no-staff") {
      const base = "Aandeel ondernemingen zonder personeel"
      return selectedRegion !== "1000" ? `${base} - ${formatGeoLabel(selectedRegion, province)}` : base
    }
    if (section === "enterprises") {
      const yearSuffix = enterpriseAvailableYears.length > 0 ? ` (${formatYearRanges(enterpriseAvailableYears)})` : ""
      const workerClassSuffix = workerClass ? ` - ${workerClassLabels.get(workerClass) ?? workerClass}` : ""
      const baseTitle = `Aantal ondernemingen${yearSuffix}${workerClassSuffix}`
      return selectedRegion !== "1000" ? `${baseTitle} - ${formatGeoLabel(selectedRegion, province)}` : baseTitle
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
  }, [enterpriseAvailableYears, horizon, province, region, section, selectedRegion, workerClass, workerClassLabels])

  const filterItems = useMemo<FilterItem[]>(() => {
    const location = province || (region && region !== "1000") ? formatGeoLabel(selectedRegion, province) : "België"
    const sectorCode = sector ?? null
    const sectorName = sectorCode
      ? section === "survival"
        ? bundle?.survivalLookups?.nace_lvl1?.find((row) => String(row.code) === sectorCode)?.nl
        : bundle?.monthlyLookups?.sectors?.find((row) => row.code === sectorCode)?.nl
      : null
    const sectorValue = sectorCode ? (sectorName ? `${sectorCode} — ${sectorName}` : sectorCode) : "Alle sectoren"

    const items: FilterItem[] = [
      { label: "Locatie", value: location },
      { label: "Sector", value: sectorValue },
    ]
    if (section === "starters" || section === "stoppers") {
      items.push({ label: "Periode", value: timeRange === "yearly" ? "Per jaar" : timeRange === "quarterly" ? "Per kwartaal" : "Per maand" })
    }
    if (section === "enterprises") {
      items.push({ label: "Werknemersklasse", value: workerClass ? workerClassLabels.get(workerClass) ?? workerClass : "Alle grootteklassen" })
    }
    if (section === "survival") {
      items.push({ label: "Horizon", value: `na ${horizon} jaar` })
    }
    return items
  }, [bundle, horizon, province, region, sector, section, selectedRegion, timeRange, workerClass, workerClassLabels])

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

  if (section === "migration" || section === "migration-balance" || section === "migration-matrix") {
    const variant: MigrationVariant = section === "migration-balance" ? "balance" : section === "migration-matrix" ? "matrix" : "flows"
    return (
      <MigrationEmbed
        data={bundle.migration}
        viewType={viewType}
        variant={variant}
        region={region ?? "2000"}
        counterpart={counterpart}
        dim={migrationDim}
        category={category}
        year={year}
      />
    )
  }

  const isShare = section === "enterprises-no-staff"
  const label = section === "survival" ? "Overlevingskans" : isShare ? "Aandeel zonder personeel (%)" : section === "enterprises" ? "Aantal ondernemingen" : "Aantal"
  const periodHeader = section === "survival" ? "Jaar" : timeRange === "yearly" || section === "enterprises" || isShare ? "Jaar" : "Periode"

  return (
    <div className="p-4">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <EmbedFilters items={filterItems} />

      {viewType === "chart" && (
        <FilterableChart
          data={data}
          chartType={section === "enterprises" || isShare ? "line" : undefined}
          showMovingAverage={section === "enterprises" || isShare ? false : undefined}
          yAxisLabelAbove={isShare ? "Aandeel zonder personeel" : section === "enterprises" ? "Aantal ondernemingen" : undefined}
          yAxisFormatter={isShare ? formatPct : undefined}
          tooltipUsesYAxisFormatter={isShare ? true : undefined}
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
