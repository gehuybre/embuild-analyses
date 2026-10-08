"use client"

import { useMemo } from "react"
import { FilterableChart, FilterableTable } from "@/components/ComparisonViews"
import { compareSelections, geoDimension, ComparisonPoint } from "@/lib/comparison"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { FilterItem, MigrationData, MigrationDim } from "@/lib/migration"
import {
  aggregateAnnualRows,
  expectedCells,
  filterEnterpriseRows,
  filterGeoSectorRows,
  filterNationalSectorRows,
  filterSurvivalRows,
  geoLabels,
  keepCompleteGroups,
  labelsFor,
  describeGeos,
  enterpriseGeoNotes,
  formatYearRanges,
  isArrondissement,
  ArrondissementFlowLookups,
  arrondissementFlowNotes,
  flowTimeRange,
  flowArrondissementOptions,
} from "@/lib/selection"
import { useLazyJson } from "@/lib/use-lazy-json"
import { EmbedFilters } from "@/components/EmbedFilters"
import { MigrationEmbed, MigrationVariant } from "@/components/MigrationSection"
import { BankruptcyEmbed, BankruptcyVariant } from "@/components/BankruptcyView"

type SectionType =
  | "starters"
  | "stoppers"
  | "survival"
  | "enterprises"
  | "enterprises-no-staff"
  | "migration"
  | "migration-balance"
  | "migration-matrix"
  | "bankruptcies"
  | "bankruptcies-workers"
  | "bankruptcies-rate"
  | "bankruptcies-by-age"
  | "bankruptcies-by-size"
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
  fr: number | null
  st: number | null
  p?: number // 1 = voorlopig, geschat uit de maandcijfers
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
  provinceYears?: number[]
  arrondissementYears?: number[]
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

type ChartPoint = ComparisonPoint

const PROVISIONAL_NOTE =
  "* Voorlopig: geschat uit de maandcijfers, gekalibreerd op het verschil tussen maand- en jaarreeks in de laatste drie jaren. Wordt vervangen zodra Statbel het jaarcijfer publiceert."

const MONTH_NAMES_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

function survivalKeyForHorizon(horizon: StopHorizon): SurvivalKey {
  return `s${horizon}` as SurvivalKey
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
  geos?: string[]
  sectors?: string[]
  workerClasses?: string[]
  timeRange?: TimeRange
  migrationRegions?: string[]
  counterparts?: string[]
  migrationDim?: MigrationDim
  categories?: string[]
  year?: number | null
}

export function StartersStoppersEmbed({
  section,
  viewType,
  horizon = 1,
  geos = [],
  sectors = [],
  workerClasses = [],
  timeRange: requestedTimeRange = "yearly",
  migrationRegions = [],
  counterparts = [],
  migrationDim = "tot",
  categories = [],
  year = null,
}: StartersStoppersEmbedProps) {
  const isFlowSection = section === "starters" || section === "stoppers"
  const timeRange = isFlowSection ? flowTimeRange(requestedTimeRange, geos) : requestedTimeRange
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
    arrondissementFlowLookups: ArrondissementFlowLookups
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
    arrondissementFlowLookups: "/data/vat_yearly_flows_arrondissements_lookups.json",
  })

  const monthlyRows = useMemo(() => bundle?.monthlyRaw ?? [], [bundle])
  // Provinciecodes botsen niet met gewestcodes, dus gewest- en provinciale rijen kunnen samen gefilterd worden op `g`.
  const monthlyRegionalRows = useMemo(
    () => [...(bundle?.monthlyRegionalRaw ?? []), ...(bundle?.monthlyProvincialRaw ?? [])],
    [bundle]
  )
  const arrondissementFlows = useLazyJson<AnnualFlowRow[]>(
    "/data/vat_yearly_flows_arrondissements.json", isFlowSection && geos.some(isArrondissement)
  )
  const yearlyRows = useMemo(() => [
    ...(bundle?.yearlyRaw ?? []), ...(bundle?.yearlyProvincialRaw ?? []), ...(arrondissementFlows.data ?? []),
  ], [bundle, arrondissementFlows.data])
  const isEnterpriseSection = section === "enterprises" || section === "enterprises-no-staff"
  const arrondissementData = useLazyJson<EnterpriseWorkerClassRow[]>(
    "/data/vat_enterprises_worker_class_arrondissements.json",
    isEnterpriseSection && geos.some(isArrondissement)
  )
  const enterpriseRows = useMemo(
    () => [...(bundle?.enterpriseRaw ?? []), ...(bundle?.enterpriseProvincialRaw ?? []), ...(arrondissementData.data ?? [])],
    [arrondissementData.data, bundle]
  )
  const survivalRows = useMemo(() => bundle?.survivalRaw ?? [], [bundle])
  const enterpriseAvailableYears = bundle?.monthlySummary?.enterpriseCounts?.availableYears ?? bundle?.enterpriseLookups?.years ?? []
  const workerClassLabels = useMemo(() => new Map((bundle?.enterpriseLookups?.workerClasses ?? []).map((row) => [row.code, row.nl])), [bundle])

  const data = useMemo(() => {
    const sectorOptions = section === "survival"
      ? (bundle?.survivalLookups?.nace_lvl1 ?? []).map((row) => ({ code: row.code, label: `${row.code} — ${row.nl ?? row.en ?? ""}` }))
      : (bundle?.monthlyLookups?.sectors ?? []).map((row) => ({ code: row.code, label: `${row.code} — ${row.nl}` }))
    const dimensions = [geoDimension(geos, isFlowSection ? flowArrondissementOptions(bundle?.arrondissementFlowLookups) : []), { selected: sectors, options: sectorOptions }]
    if (section === "enterprises") dimensions.push({
      selected: workerClasses,
      options: (bundle?.enterpriseLookups?.workerClasses ?? []).map((row) => ({ code: row.code, label: row.nl })),
    })
    return compareSelections(dimensions, ([geos, sectors, selectedClasses = []]) => {
    if (section === "starters" || section === "stoppers") {
      const metric = section === "starters" ? "fr" : "st"
      if (timeRange === "yearly") return aggregateAnnualRows(yearlyRows, metric, geos, sectors)
      const rows =
        geos.length === 0
          ? filterNationalSectorRows(monthlyRows, sectors)
          : filterGeoSectorRows(monthlyRegionalRows, geos, sectors)
      const complete = keepCompleteGroups(
        rows,
        (row) => row.period,
        (row) => `${(row as Partial<RegionalMonthlyFlowRow>).g ?? "1000"}|${row.n1}`,
        expectedCells(geos, sectors)
      )
      return aggregateMonthlyMetric(complete, metric, timeRange)
    }
    if (section === "enterprises") {
      return aggregateEnterpriseCountsByYear(filterEnterpriseRows(enterpriseRows, geos, sectors, selectedClasses))
    }
    if (section === "enterprises-no-staff") {
      return aggregateEnterpriseNoEmployeeShareByYear(filterEnterpriseRows(enterpriseRows, geos, sectors, []))
    }
    return aggregateSurvivalRateByYear(filterSurvivalRows(survivalRows, geos, sectors), horizon)
    })
  }, [bundle, enterpriseRows, geos, horizon, isFlowSection, monthlyRegionalRows, monthlyRows, sectors, section, survivalRows, timeRange, workerClasses, yearlyRows])

  const geoSuffix = geos.length > 0 ? ` - ${describeGeos(geos, isFlowSection ? flowArrondissementOptions(bundle?.arrondissementFlowLookups) : [])}` : ""
  const title = useMemo(() => {
    if (section === "starters") return `Aantal starters${geoSuffix}`
    if (section === "stoppers") return `Aantal stoppers${geoSuffix}`
    if (section === "enterprises-no-staff") return `Aandeel ondernemingen zonder personeel${geoSuffix}`
    if (section === "enterprises") {
      const yearSuffix = enterpriseAvailableYears.length > 0 ? ` (${formatYearRanges(enterpriseAvailableYears)})` : ""
      return `Aantal ondernemingen${yearSuffix}${geoSuffix}`
    }
    return `Overlevingskans na ${horizon} jaar${geoSuffix}`
  }, [enterpriseAvailableYears, geoSuffix, horizon, section])

  const filterItems = useMemo<FilterItem[]>(() => {
    const sectorOptions =
      section === "survival"
        ? (bundle?.survivalLookups?.nace_lvl1 ?? []).map((row) => ({ code: String(row.code), label: `${row.code} — ${row.nl ?? row.en ?? ""}`.trim() }))
        : (bundle?.monthlyLookups?.sectors ?? []).map((row) => ({ code: row.code, label: `${row.code} — ${row.nl}` }))

    const items: FilterItem[] = [
      { label: "Locatie", value: geoLabels(geos, isFlowSection ? flowArrondissementOptions(bundle?.arrondissementFlowLookups) : []).join(", ") },
      { label: "Sector", value: sectors.length > 0 ? labelsFor(sectors, sectorOptions).join(", ") : "Alle sectoren" },
    ]
    if (section === "starters" || section === "stoppers") {
      items.push({ label: "Periode", value: timeRange === "yearly" ? "Per jaar" : timeRange === "quarterly" ? "Per kwartaal" : "Per maand" })
    }
    if (section === "enterprises") {
      items.push({
        label: "Werknemersklasse",
        value: workerClasses.length > 0 ? workerClasses.map((code) => workerClassLabels.get(code) ?? code).join(", ") : "Alle grootteklassen",
      })
    }
    if (section === "survival") {
      items.push({ label: "Horizon", value: `na ${horizon} jaar` })
    }
    return items
  }, [bundle, geos, horizon, isFlowSection, sectors, section, timeRange, workerClassLabels, workerClasses])

  const geoNotes = useMemo(() => {
    if (isFlowSection) {
      const notes = arrondissementFlowNotes(geos, bundle?.arrondissementFlowLookups)
      if (arrondissementFlows.loading) notes.unshift("Arrondissementscijfers worden geladen...")
      if (arrondissementFlows.error) notes.unshift(arrondissementFlows.error)
      return notes
    }
    if (!isEnterpriseSection) return []
    const notes = enterpriseGeoNotes(geos, enterpriseAvailableYears, [
      ...(bundle?.enterpriseLookups?.provinceYears ?? []).filter(
        (year) => !geos.some(isArrondissement) || (bundle?.enterpriseLookups?.arrondissementYears ?? []).includes(year)
      ),
    ])
    if (arrondissementData.loading) notes.unshift("Arrondissementsgegevens worden geladen...")
    if (arrondissementData.error) notes.unshift(arrondissementData.error)
    return notes
  }, [arrondissementData.error, arrondissementData.loading, arrondissementFlows.error, arrondissementFlows.loading, bundle, enterpriseAvailableYears, geos, isEnterpriseSection, isFlowSection])

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

  const bankruptcyVariants: Partial<Record<SectionType, BankruptcyVariant>> = {
    bankruptcies: "count",
    "bankruptcies-workers": "workers",
    "bankruptcies-rate": "rate",
    "bankruptcies-by-age": "age",
    "bankruptcies-by-size": "size",
  }
  const bankruptcyVariant = bankruptcyVariants[section]
  if (bankruptcyVariant) {
    return (
      <BankruptcyEmbed
        variant={bankruptcyVariant}
        viewType={viewType}
        geos={geos}
        sectors={sectors}
        timeRange={timeRange}
        enterpriseRows={enterpriseRows}
        sectorOptions={(bundle.monthlyLookups?.sectors ?? []).map((row) => ({ code: row.code, label: `${row.code} — ${row.nl}` }))}
      />
    )
  }

  if (section === "migration" || section === "migration-balance" || section === "migration-matrix") {
    const variant: MigrationVariant = section === "migration-balance" ? "balance" : section === "migration-matrix" ? "matrix" : "flows"
    return (
      <MigrationEmbed
        data={bundle.migration}
        viewType={viewType}
        variant={variant}
        regions={migrationRegions}
        counterparts={counterparts}
        dim={migrationDim}
        categories={categories}
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
          valueFormatter={isShare || section === "survival" ? formatPct : undefined}
        />
      )}

      {data.some((point) => point.provisional) ? <p className="mt-3 text-xs text-muted-foreground">{PROVISIONAL_NOTE}</p> : null}
      {geoNotes.map((note) => (
        <p key={note} className="mt-3 text-xs text-muted-foreground">
          {note}
        </p>
      ))}

      <div className="mt-4 text-center text-xs text-muted-foreground">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}
