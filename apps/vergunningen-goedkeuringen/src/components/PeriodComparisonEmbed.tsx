"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { DumbbellChart } from "@embuild/shared/components/shared/DumbbellChart"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { GeoFilterInline } from "@embuild/shared/components/shared/GeoFilterInline"
import { PeriodComparisonSection, type PeriodComparisonRow } from "@embuild/shared/components/shared/PeriodComparisonSection"
import { aggregateMunicipalityToArrondissement } from "@embuild/shared/lib/map-utils"
import { ARRONDISSEMENTS, PROVINCES, type RegionCode } from "@embuild/shared/lib/geo-utils"
import { normalizeNisCode } from "@embuild/shared/lib/nis-fusion-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type DataRow = {
  y: number
  q?: number
  m: number | string
  ren: number
  dwell: number
  apt: number
  house: number
}

type PeriodComparisonSectionKey =
  | "renovatie-vergelijking"
  | "renovatie-vergelijking-aantallen"
  | "renovatie-vergelijking-percentage"
  | "nieuwbouw-vergelijking"
  | "nieuwbouw-vergelijking-aantallen"
  | "nieuwbouw-vergelijking-percentage"

// Period 1 is fixed: starts at 2019-01 and lasts 35 months
// Period 2 is dynamic: latest 35 months of available data
const PERIOD1_START_YEAR = 2019
const PERIOD1_START_QUARTER = 1
const PERIOD_MONTHS = 35

const COMPARISON_CONFIG: Record<
  PeriodComparisonSectionKey,
  { title: string; metric: "ren" | "dwell"; view: "full" | "counts" | "percentage" }
> = {
  "renovatie-vergelijking": {
    title: "Renovatie - vergelijking 2019-2021 vs 2022-2025",
    metric: "ren",
    view: "full",
  },
  "renovatie-vergelijking-aantallen": {
    title: "Renovatie - vergelijking 2019-2021 vs 2022-2025 (aantallen)",
    metric: "ren",
    view: "counts",
  },
  "renovatie-vergelijking-percentage": {
    title: "Renovatie - vergelijking 2019-2021 vs 2022-2025 (% verandering)",
    metric: "ren",
    view: "percentage",
  },
  "nieuwbouw-vergelijking": {
    title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025",
    metric: "dwell",
    view: "full",
  },
  "nieuwbouw-vergelijking-aantallen": {
    title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025 (aantallen)",
    metric: "dwell",
    view: "counts",
  },
  "nieuwbouw-vergelijking-percentage": {
    title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025 (% verandering)",
    metric: "dwell",
    view: "percentage",
  },
}

/**
 * Convert year and quarter to a comparable month number (0-based)
 * E.g., 2019 Q1 = 0, 2019 Q2 = 3, 2020 Q1 = 12, etc.
 */
function yearQuarterToMonths(year: number, quarter: number = 1): number {
  return (year - PERIOD1_START_YEAR) * 12 + (quarter - 1) * 3
}

/**
 * Convert month number back to year and quarter
 */
function monthsToYearQuarter(months: number): { year: number; quarter: number } {
  const year = PERIOD1_START_YEAR + Math.floor(months / 12)
  const quarter = Math.floor((months % 12) / 3) + 1
  return { year, quarter: Math.min(quarter, 4) }
}

/**
 * Format period as "YYYY Q# - YYYY Q#"
 */
function formatPeriod(startMonths: number, endMonths: number): string {
  const start = monthsToYearQuarter(startMonths)
  const end = monthsToYearQuarter(endMonths)
  return `${start.year} Q${start.quarter} - ${end.year} Q${end.quarter}`
}

/**
 * Find the maximum month (as year-quarter) in the dataset
 */
function findMaxDataMonth(data: DataRow[]): { year: number; quarter: number } {
  let maxYear = 0
  let maxQuarter = 0

  for (const row of data) {
    if (row.y > maxYear || (row.y === maxYear && (row.q || 0) > maxQuarter)) {
      maxYear = row.y
      maxQuarter = row.q || 1
    }
  }

  return { year: maxYear, quarter: maxQuarter }
}

function normalizeQuarterlyData(data: DataRow[]): DataRow[] {
  const aggregatedQuarter = new Map<string, DataRow>()

  for (const row of data) {
    const normalizedCode = normalizeNisCode(row.m) || String(row.m).padStart(5, "0")
    const key = `${row.y}-${row.q}|${normalizedCode}`
    const existing = aggregatedQuarter.get(key)

    if (!existing) {
      aggregatedQuarter.set(key, {
        y: row.y,
        q: row.q,
        m: Number(normalizedCode),
        ren: Number(row.ren) || 0,
        dwell: Number(row.dwell) || 0,
        apt: Number(row.apt) || 0,
        house: Number(row.house) || 0,
      })
      continue
    }

    existing.ren += Number(row.ren) || 0
    existing.dwell += Number(row.dwell) || 0
    existing.apt += Number(row.apt) || 0
    existing.house += Number(row.house) || 0
  }

  return Array.from(aggregatedQuarter.values())
}

interface PeriodComparisonParams {
  data: DataRow[]
  metric: "ren" | "dwell" | "apt" | "house"
  maxDataMonth?: { year: number; quarter: number }
}

interface PeriodComparisonResult {
  rows: PeriodComparisonRow[]
  period1Label: string
  period2Label: string
}

function calculatePeriodComparison({
  data,
  metric,
  maxDataMonth,
}: PeriodComparisonParams): PeriodComparisonResult {
  // Calculate max month if not provided
  const max = maxDataMonth || findMaxDataMonth(data)

  // Period 1: Fixed 35 months starting from 2019 Q1
  const period1StartMonths = 0 // 2019 Q1
  const period1EndMonths = PERIOD_MONTHS - 1 // 35 months = months 0-34

  // Period 2: Dynamic 35 months ending at the latest data month
  const maxDataMonths = yearQuarterToMonths(max.year, max.quarter)
  const period2EndMonths = maxDataMonths
  const period2StartMonths = maxDataMonths - PERIOD_MONTHS + 1

  // Helper to check if a data row is in a month range
  const isInRange = (row: DataRow, startMonths: number, endMonths: number) => {
    const rowMonths = yearQuarterToMonths(row.y, row.q || 1)
    return rowMonths >= startMonths && rowMonths <= endMonths
  }

  const period1Data = data.filter((d) => isInRange(d, period1StartMonths, period1EndMonths))
  const period2Data = data.filter((d) => isInRange(d, period2StartMonths, period2EndMonths))

  const period1Agg = aggregateMunicipalityToArrondissement(
    period1Data,
    (d) => d.m,
    (d) => Number(d[metric]) || 0
  )

  const period2Agg = aggregateMunicipalityToArrondissement(
    period2Data,
    (d) => d.m,
    (d) => Number(d[metric]) || 0
  )

  const period1Map = new Map(period1Agg.map((a) => [a.arrondissementCode, a.value]))
  const period2Map = new Map(period2Agg.map((a) => [a.arrondissementCode, a.value]))

  const allArrCodes = ARRONDISSEMENTS.map((arr) => arr.code)
  const comparisonRows: PeriodComparisonRow[] = []

  for (const arrCode of allArrCodes) {
    const p1 = period1Map.get(arrCode) || 0
    const p2 = period2Map.get(arrCode) || 0

    if (p1 === 0 && p2 === 0) continue

    const verschil = p2 - p1
    const percentageChange = p1 === 0 ? (p2 > 0 ? Infinity : 0) : (verschil / p1) * 100
    const arrondissement = ARRONDISSEMENTS.find((arr) => arr.code === arrCode)

    comparisonRows.push({
      arrondissementCode: arrCode,
      arrondissementName: arrondissement?.name || arrCode,
      period1: p1,
      period2: p2,
      verschil,
      percentageChange: Number.isFinite(percentageChange) ? percentageChange : 0,
    })
  }

  const sortedRows = comparisonRows.sort((a, b) =>
    a.arrondissementName.localeCompare(b.arrondissementName, "nl-BE")
  )

  return {
    rows: sortedRows,
    period1Label: formatPeriod(period1StartMonths, period1EndMonths),
    period2Label: formatPeriod(period2StartMonths, period2EndMonths),
  }
}

interface PeriodComparisonEmbedProps {
  section: PeriodComparisonSectionKey
}

export function PeriodComparisonEmbed({ section }: PeriodComparisonEmbedProps) {
  const config = COMPARISON_CONFIG[section]

  const { data: bundle, loading, error } = useJsonBundle<{
    quarterly: DataRow[]
  }>({
    quarterly: "/data/data_quarterly.json",
  })

  const quarterlyRows = bundle?.quarterly as DataRow[] | undefined
  const normalizedQuarterly = useMemo(
    () => normalizeQuarterlyData(quarterlyRows ?? []),
    [quarterlyRows]
  )

  const [selectedRegion, setSelectedRegion] = useState<RegionCode>("2000")

  const comparisonResult = useMemo(
    () =>
      calculatePeriodComparison({
        data: normalizedQuarterly,
        metric: config.metric,
      }),
    [normalizedQuarterly, config.metric]
  )

  const comparisonData = comparisonResult.rows
  const period1Label = comparisonResult.period1Label
  const period2Label = comparisonResult.period2Label

  const filteredData = useMemo(() => {
    if (selectedRegion === "1000") return comparisonData
    const provinceByArrondissement = new Map(ARRONDISSEMENTS.map((arr) => [arr.code, arr.provinceCode]))
    const regionByProvince = new Map(PROVINCES.map((prov) => [prov.code, prov.regionCode]))
    return comparisonData.filter((row) => {
      const provinceCode = provinceByArrondissement.get(row.arrondissementCode)
      if (!provinceCode) return false
      return regionByProvince.get(provinceCode) === selectedRegion
    })
  }, [comparisonData, selectedRegion])

  const countsChartData = useMemo(() => {
    return filteredData
      .map((row) => ({
        name: row.arrondissementName.replace("Arrondissement ", ""),
        period1: row.period1,
        period2: row.period2,
      }))
      .sort((a, b) => {
        const diff = a.period1 - b.period1
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, "nl-BE")
      })
  }, [filteredData])

  const percentageChartData = useMemo(() => {
    return filteredData
      .map((row) => ({
        name: row.arrondissementName.replace("Arrondissement ", ""),
        percentageChange: Number.isFinite(row.percentageChange) ? row.percentageChange : 0,
      }))
      .sort((a, b) => {
        const diff = b.percentageChange - a.percentageChange
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, "nl-BE")
      })
  }, [filteredData])

  const exportData = useMemo(() => {
    return filteredData.map((row) => ({
      label: row.arrondissementName,
      value: config.view === "percentage" ? row.percentageChange : row.period2,
      period1: row.period1,
      period2: row.period2,
      verschil: row.verschil,
      percentageChange: row.percentageChange,
    }))
  }, [filteredData, config.view])

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

  if (config.view !== "full") {
    const chartTitle =
      config.view === "counts"
        ? "Periodevergelijking per arrondissement"
        : "Percentage verandering per arrondissement"
    const valueLabel = config.view === "counts" ? "Aantal" : "% Verandering"

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold">{config.title}</h3>
          <div className="flex items-center gap-2">
            <GeoFilterInline
              selectedRegion={selectedRegion}
              selectedProvince={null}
              onSelectRegion={setSelectedRegion}
              onSelectProvince={() => {}}
              showRegions={true}
              showProvinces={false}
            />
            <ExportButtons
              data={exportData}
              title={config.title}
              slug="vergunningen-goedkeuringen"
              sectionId={section}
              viewType="chart"
              periodHeaders={["Arrondissement"]}
              valueLabel={valueLabel}
              dataSource="Statbel - Bouwvergunningen"
              dataSourceUrl="https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{chartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {config.view === "counts" ? (
              <DumbbellChart
                data={countsChartData}
                period1Label={period1Label}
                period2Label={period2Label}
                xAxisLabelAbove="Aantal"
              />
            ) : (
              <FilterableChart
                data={percentageChartData}
                getLabel={(d) => d.name}
                getValue={(d) => d.percentageChange}
                chartType="bar"
                layout="horizontal"
                yAxisLabelAbove="% Verandering"
                showMovingAverage={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // For "full" view, we need to strip the "-vergelijking" suffix
  // so the PeriodComparisonSection can append "-aantallen" and "-percentage"
  // Example: "renovatie-vergelijking" becomes "renovatie"
  // which then generates "renovatie-vergelijking-aantallen" and "renovatie-vergelijking-percentage"
  const baseSectionId = section.replace("-vergelijking", "")

  return (
    <PeriodComparisonSection
      title={config.title}
      data={comparisonData}
      metric={config.metric}
      slug="vergunningen-goedkeuringen"
      sectionId={`${baseSectionId}-vergelijking`}
      period1Label={period1Label}
      period2Label={period2Label}
      mapColorScheme="orangeDecile"
      mapColorScaleMode="negative"
      mapNeutralFill="#ffffff"
    />
  )
}
