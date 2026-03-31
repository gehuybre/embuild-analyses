"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { REGIONS } from "@embuild/shared/lib/geo-utils"
import { SECTOR_SHORT_LABELS } from "@embuild/shared/lib/sector-short-labels"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type DataRow = {
  y: number | null
  r: string | null
  s?: string | null
  g?: string | null
  a?: string | null
  v: number | null
}

type LookupItem = {
  code: string | number
  nl?: string
  en?: string
}

type Lookups = {
  nace?: LookupItem[]
  gender?: LookupItem[]
  age_range?: LookupItem[]
}

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

type LineSeriesPoint = {
  year: number
  [key: string]: number
}

type TableRow = {
  sortValue: string | number
  periodCells: Array<string | number>
  [key: string]: number | string | Array<string | number>
}

type SectionType = "overview" | "by-sector" | "by-gender" | "by-region" | "by-age"
type ViewType = "chart" | "table"

const TOP_SECTOR_COUNT = 10
const OTHER_SECTOR_CODE = "OTHER"
const OTHER_SECTOR_LABEL_NL = "Overige"

let byAllData: DataRow[] = []
let lookups: Lookups | null = null
let topSectorSetCache: Set<string> | null = null
let topSectorCacheSize = 0

function getTopSectorSet(): Set<string> {
  if (!byAllData.length) return new Set()
  if (topSectorSetCache && topSectorCacheSize === byAllData.length) {
    return topSectorSetCache
  }

  const totals = new Map<string, number>()
  for (const row of byAllData) {
    if (!row.s || typeof row.v !== "number") continue
    const code = String(row.s)
    totals.set(code, (totals.get(code) ?? 0) + row.v)
  }
  const topSectorCodes = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SECTOR_COUNT)
    .map(([code]) => code)

  topSectorCacheSize = byAllData.length
  topSectorSetCache = new Set(topSectorCodes)
  return topSectorSetCache
}

function stripSectorPrefix(code: string, label: string) {
  const trimmed = label.trim()
  if (!trimmed) return trimmed
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const prefixPattern = new RegExp(`^${escapedCode}\\s*[-–—:]?\\s+`, "i")
  return trimmed.replace(prefixPattern, "")
}

function mapSectorCode(code?: string | null): string | null {
  if (!code) return null
  const normalized = String(code)
  const topSectorSet = getTopSectorSet()
  if (topSectorSet.size === 0) return normalized
  return topSectorSet.has(normalized) ? normalized : OTHER_SECTOR_CODE
}

function buildSectorLabelMap(): Map<string, string> {
  const sectorMap = new Map<string, string>()
  const topSectorSet = getTopSectorSet()
  if (lookups && (lookups as Lookups).nace) {
    for (const item of (lookups as Lookups).nace!) {
      const code = String(item.code)
      if (topSectorSet.size > 0 && !topSectorSet.has(code)) continue
      const rawLabel = item.nl || item.en || code
      const overrideLabel = SECTOR_SHORT_LABELS[code]
      const label = overrideLabel ?? stripSectorPrefix(code, rawLabel) ?? code
      sectorMap.set(code, label)
    }
  }
  if (topSectorSet.size > 0) {
    sectorMap.set(OTHER_SECTOR_CODE, OTHER_SECTOR_LABEL_NL)
  }
  return sectorMap
}

interface BouwondernemersEmbedProps {
  section: SectionType
  viewType: ViewType
  displayMode?: "absolute" | "index"
}

export function BouwondernemersEmbed({
  section,
  viewType,
  displayMode = "absolute",
}: BouwondernemersEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    byAll: DataRow[]
    lookups: Lookups
  }>({
    byAll: "/data/by_all.json",
    lookups: "/data/lookups.json",
  })

  if (bundle && byAllData !== bundle.byAll) {
    byAllData = bundle.byAll
    lookups = bundle.lookups
    topSectorSetCache = null
    topSectorCacheSize = 0
  }

  const { chartData, tableData, series, title, periodHeaders } = useMemo((): {
    chartData: ChartPoint[] | LineSeriesPoint[]
    tableData: TableRow[]
    series?: Array<{ key: string; label: string }>
    title: string
    periodHeaders: string[]
  } => {
    const allRows = byAllData as DataRow[]

    switch (section) {
      case "overview": {
        // Aggregate by year
        const agg = new Map<number, number>()
        for (const r of allRows) {
          if (typeof r.y !== "number" || typeof r.v !== "number") continue
          agg.set(r.y, (agg.get(r.y) ?? 0) + r.v)
        }

        const sorted = Array.from(agg.entries()).sort((a, b) => a[0] - b[0])
        const baseValue = sorted.length > 0 && displayMode === "index" ? sorted[0][1] : 1

        const data = sorted.map(([y, v]) => {
          let value = v
          if (displayMode === "index") {
            value = baseValue > 0 ? (v / baseValue) * 100 : 0
          }
          return {
            sortValue: y,
            periodCells: [y],
            value,
          }
        })

        return {
          chartData: data,
          tableData: data,
          series: undefined,
          title: "Overzicht bouwondernemers",
          periodHeaders: ["Jaar"],
        }
      }

      case "by-sector": {
        // Group by year and sector
        const agg = new Map<string, number>()
        for (const r of allRows) {
          if (typeof r.y !== "number" || typeof r.v !== "number" || !r.s) continue
          const mappedSector = mapSectorCode(r.s)
          if (!mappedSector) continue
          const key = `${r.y}-${mappedSector}`
          agg.set(key, (agg.get(key) ?? 0) + r.v)
        }

        const sectorLabels = buildSectorLabelMap()
        const seriesKeys = new Set<string>()
        const dataByYear = new Map<number, Record<string, number>>()

        for (const [key, value] of agg.entries()) {
          const [yearStr, sector] = key.split("-")
          const year = Number(yearStr)
          if (!dataByYear.has(year)) {
            dataByYear.set(year, {})
          }
          seriesKeys.add(sector)
          dataByYear.get(year)![sector] = value
        }

        let lineChartData: LineSeriesPoint[] = Array.from(dataByYear.entries())
          .map(([year, sectors]) => ({ year, ...sectors }))
          .sort((a, b) => a.year - b.year)

        if (displayMode === "index" && lineChartData.length > 0) {
          const baseYear = lineChartData[0]
          lineChartData = lineChartData.map((yearData) => {
            const indexed: LineSeriesPoint = { year: yearData.year }
            for (const sector of seriesKeys) {
              const baseValue = baseYear[sector] ?? 0
              const currentValue = yearData[sector] ?? 0
              indexed[sector] = baseValue > 0 ? (currentValue / baseValue) * 100 : 0
            }
            return indexed
          })
        }

        const years = Array.from(dataByYear.keys()).sort((a, b) => a - b)
        const sectors = Array.from(sectorLabels.keys()).sort()
        const tableRows: TableRow[] = sectors.map((sector) => {
          const row: TableRow = {
            sortValue: sector,
            periodCells: [sectorLabels.get(sector) || sector],
          }
          for (const year of years) {
            row[`y${year}`] = dataByYear.get(year)?.[sector] ?? 0
          }
          return row
        })

        const seriesDef = Array.from(seriesKeys)
          .map((sector) => ({
            key: sector,
            label: sectorLabels.get(sector) || sector,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "nl"))

        return {
          chartData: lineChartData,
          tableData: tableRows,
          series: seriesDef,
          title: "Bouwondernemers per sector",
          periodHeaders: ["Sector"],
        }
      }

      case "by-gender": {
        const agg = new Map<string, number>()
        for (const r of allRows) {
          if (typeof r.y !== "number" || typeof r.v !== "number" || !r.g) continue
          const key = `${r.y}-${r.g}`
          agg.set(key, (agg.get(key) ?? 0) + r.v)
        }

        const genderLabels = new Map<string, string>()
        if (lookups && (lookups as Lookups).gender) {
          for (const item of (lookups as Lookups).gender!) {
            const code = String(item.code)
            genderLabels.set(code, item.nl || item.en || code)
          }
        }

        const seriesKeys = new Set<string>()
        const dataByYear = new Map<number, Record<string, number>>()

        for (const [key, value] of agg.entries()) {
          const [yearStr, gender] = key.split("-")
          const year = Number(yearStr)
          if (!dataByYear.has(year)) {
            dataByYear.set(year, {})
          }
          seriesKeys.add(gender)
          dataByYear.get(year)![gender] = value
        }

        let lineChartData: LineSeriesPoint[] = Array.from(dataByYear.entries())
          .map(([year, genders]) => ({ year, ...genders }))
          .sort((a, b) => a.year - b.year)

        if (displayMode === "index" && lineChartData.length > 0) {
          const baseYear = lineChartData[0]
          lineChartData = lineChartData.map((yearData) => {
            const indexed: LineSeriesPoint = { year: yearData.year }
            for (const gender of seriesKeys) {
              const baseValue = baseYear[gender] ?? 0
              const currentValue = yearData[gender] ?? 0
              indexed[gender] = baseValue > 0 ? (currentValue / baseValue) * 100 : 0
            }
            return indexed
          })
        }

        const years = Array.from(dataByYear.keys()).sort((a, b) => a - b)
        const genderCodes = Array.from(genderLabels.keys()).sort()
        const tableRows: TableRow[] = genderCodes.map((code) => {
          const label = genderLabels.get(code) || code
          const row: TableRow = {
            sortValue: code,
            periodCells: [label],
          }
          for (const year of years) {
            row[`y${year}`] = dataByYear.get(year)?.[code] ?? 0
          }
          return row
        })

        const seriesDef = Array.from(seriesKeys)
          .map((code) => ({
            key: code,
            label: genderLabels.get(code) || code,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "nl"))

        return {
          chartData: lineChartData,
          tableData: tableRows,
          series: seriesDef,
          title: "Bouwondernemers per geslacht",
          periodHeaders: ["Geslacht"],
        }
      }

      case "by-region": {
        const agg = new Map<string, number>()
        for (const r of allRows) {
          if (typeof r.y !== "number" || typeof r.v !== "number" || !r.r) continue
          const key = `${r.y}-${r.r}`
          agg.set(key, (agg.get(key) ?? 0) + r.v)
        }

        const regionLabels = new Map<string, string>()
        for (const region of REGIONS) {
          if (region.code !== "1000") {
            regionLabels.set(String(region.code), region.name)
          }
        }

        const seriesKeys = new Set<string>()
        const dataByYear = new Map<number, Record<string, number>>()

        for (const [key, value] of agg.entries()) {
          const [yearStr, regionCode] = key.split("-")
          const year = Number(yearStr)
          if (!dataByYear.has(year)) {
            dataByYear.set(year, {})
          }
          seriesKeys.add(regionCode)
          dataByYear.get(year)![regionCode] = value
        }

        let lineChartData: LineSeriesPoint[] = Array.from(dataByYear.entries())
          .map(([year, regions]) => ({ year, ...regions }))
          .sort((a, b) => a.year - b.year)

        if (displayMode === "index" && lineChartData.length > 0) {
          const baseYear = lineChartData[0]
          lineChartData = lineChartData.map((yearData) => {
            const indexed: LineSeriesPoint = { year: yearData.year }
            for (const regionCode of seriesKeys) {
              const baseValue = baseYear[regionCode] ?? 0
              const currentValue = yearData[regionCode] ?? 0
              indexed[regionCode] = baseValue > 0 ? (currentValue / baseValue) * 100 : 0
            }
            return indexed
          })
        }

        const years = Array.from(dataByYear.keys()).sort((a, b) => a - b)
        const regionCodes = Array.from(regionLabels.keys()).sort()
        const tableRows: TableRow[] = regionCodes.map((code) => {
          const label = regionLabels.get(code) || code
          const row: TableRow = {
            sortValue: code,
            periodCells: [label],
          }
          for (const year of years) {
            row[`y${year}`] = dataByYear.get(year)?.[code] ?? 0
          }
          return row
        })

        const seriesDef = Array.from(seriesKeys)
          .map((code) => ({
            key: code,
            label: regionLabels.get(code) || code,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "nl"))

        return {
          chartData: lineChartData,
          tableData: tableRows,
          series: seriesDef,
          title: "Bouwondernemers per regio",
          periodHeaders: ["Regio"],
        }
      }

      case "by-age": {
        const agg = new Map<string, number>()
        for (const r of allRows) {
          if (typeof r.y !== "number" || typeof r.v !== "number" || !r.a) continue
          const key = `${r.y}-${r.a}`
          agg.set(key, (agg.get(key) ?? 0) + r.v)
        }

        const ageLabels = new Map<string, string>()
        const ageOrder = new Map<string, number>()
        if (lookups && (lookups as Lookups).age_range) {
          for (const [index, item] of (lookups as Lookups).age_range!.entries()) {
            const code = String(item.code)
            ageLabels.set(code, item.nl || item.en || code)
            ageOrder.set(code, index)
          }
        }

        const seriesKeys = new Set<string>()
        const dataByYear = new Map<number, Record<string, number>>()

        for (const [key, value] of agg.entries()) {
          const [yearStr, age] = key.split("-")
          const year = Number(yearStr)
          if (!dataByYear.has(year)) {
            dataByYear.set(year, {})
          }
          seriesKeys.add(age)
          dataByYear.get(year)![age] = value
        }

        let lineChartData: LineSeriesPoint[] = Array.from(dataByYear.entries())
          .map(([year, ages]) => ({ year, ...ages }))
          .sort((a, b) => a.year - b.year)

        if (displayMode === "index" && lineChartData.length > 0) {
          const baseYear = lineChartData[0]
          lineChartData = lineChartData.map((yearData) => {
            const indexed: LineSeriesPoint = { year: yearData.year }
            for (const age of seriesKeys) {
              const baseValue = baseYear[age] ?? 0
              const currentValue = yearData[age] ?? 0
              indexed[age] = baseValue > 0 ? (currentValue / baseValue) * 100 : 0
            }
            return indexed
          })
        }

        const years = Array.from(dataByYear.keys()).sort((a, b) => a - b)
        const ageCodes = Array.from(ageLabels.keys()).sort()
        const tableRows: TableRow[] = ageCodes.map((code) => {
          const label = ageLabels.get(code) || code
          const row: TableRow = {
            sortValue: code,
            periodCells: [label],
          }
          for (const year of years) {
            row[`y${year}`] = dataByYear.get(year)?.[code] ?? 0
          }
          return row
        })

        const getAgeSortValue = (code: string, label?: string) => {
          const ordered = ageOrder.get(code)
          if (ordered !== undefined) return ordered
          const match = String(label ?? code).match(/\d+/)
          return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
        }

        const seriesDef = Array.from(seriesKeys)
          .map((code) => ({
            key: code,
            label: ageLabels.get(code) || code,
          }))
          .sort((a, b) => getAgeSortValue(a.key, a.label) - getAgeSortValue(b.key, b.label))

        return {
          chartData: lineChartData,
          tableData: tableRows,
          series: seriesDef,
          title: "Bouwondernemers per leeftijd",
          periodHeaders: ["Leeftijd"],
        }
      }
    }
  }, [section, displayMode, bundle?.byAll, bundle?.lookups])

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

  const valueLabel = displayMode === "absolute" ? "Aantal ondernemers" : "Index (basis 100)"

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {viewType === "chart" && (
        <FilterableChart
          data={chartData as any}
          getLabel={(d: any) => {
            if ("year" in d) return String(d.year)
            return String(d.periodCells[0])
          }}
          getValue={(d: any) => {
            if ("value" in d) return d.value
            return 0
          }}
          getSortValue={(d: any) => {
            if ("year" in d) return d.year
            return d.sortValue
          }}
          yAxisLabelAbove={valueLabel}
          series={series}
          showMovingAverage={!series}
        />
      )}

      {viewType === "table" && (
        <FilterableTable data={tableData} label={valueLabel} periodHeaders={periodHeaders} />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Statbel - Ondernemers Datalab</span>
      </div>
    </div>
  )
}
