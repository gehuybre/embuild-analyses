"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { HorizontalBarChart } from "@embuild/shared/components/shared/HorizontalBarChart"
import { getAnalysisDefaults } from "@embuild/shared/lib/analysis-defaults"
import {
  validateTimeRange,
  validateSectorCode,
  validateYear,
} from "@embuild/shared/lib/filter-validation"
import { REGIONS, PROVINCES, getProvincesForRegion, type RegionCode } from "@embuild/shared/lib/geo-utils"

import { useFaillissementenData } from "./use-faillissementen-data"

type MonthlyRow = {
  y: number
  m: number
  n: number
  w: number
}

type MonthlyProvinceRow = {
  y: number
  m: number
  p: string
  n: number
  w: number
}

type MonthlySectorRow = {
  y: number
  m: number
  s: string
  n: number
  w: number
}

type MonthlySectorProvinceRow = {
  y: number
  m: number
  s: string
  p: string
  n: number
  w: number
}

type YearlyRow = {
  y: number
  n: number
  w: number
}

type YearlySectorProvinceRow = {
  y: number
  s: string
  p: string
  n: number
  w: number
}

type DurationRow = {
  y: number
  d: string
  ds: string
  do: number
  n: number
  w: number
}

type DurationProvinceRow = {
  y: number
  d: string
  ds: string
  do: number
  p: string
  n: number
  w: number
}

type DurationSectorRow = {
  y: number
  d: string
  ds: string
  do: number
  s: string
  n: number
  w: number
}

type WorkersRow = {
  y: number
  c: string
  n: number
  w: number
}

type WorkersProvinceRow = {
  y: number
  c: string
  p: string
  n: number
  w: number
}

type WorkersSectorRow = {
  y: number
  c: string
  s: string
  n: number
  w: number
}

let monthlyConstruction: MonthlyRow[] = []
let monthlyTotals: MonthlyRow[] = []
let monthlyBySector: MonthlySectorRow[] = []
let monthlyBySectorProvince: MonthlySectorProvinceRow[] = []
let monthlyProvinces: MonthlyProvinceRow[] = []
let monthlyProvincesConstruction: MonthlyProvinceRow[] = []
let yearlyConstruction: YearlyRow[] = []
let yearlyTotals: YearlyRow[] = []
let yearlyBySector: YearlySectorRow[] = []
let yearlyBySectorProvince: YearlySectorProvinceRow[] = []
let yearlyByDuration: DurationRow[] = []
let yearlyByDurationConstruction: DurationRow[] = []
let yearlyByDurationProvince: DurationProvinceRow[] = []
let yearlyByDurationProvinceConstruction: DurationProvinceRow[] = []
let yearlyByDurationSector: DurationSectorRow[] = []
let yearlyByWorkers: WorkersRow[] = []
let yearlyByWorkersConstruction: WorkersRow[] = []
let yearlyByWorkersProvince: WorkersProvinceRow[] = []
let yearlyByWorkersProvinceConstruction: WorkersProvinceRow[] = []
let yearlyByWorkersSector: WorkersSectorRow[] = []
let lookups: any = null
let metadata: { min_year: number; max_year: number } | null = null
let VALID_SECTOR_CODES: string[] = []

type YearlySectorRow = {
  y: number
  s: string
  n: number
  w: number
}

type Sector = {
  code: string
  nl: string
}

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

type SectionType = "evolutie" | "leeftijd" | "bedrijfsgrootte" | "sectoren"
type ViewType = "chart" | "table"
type GeoLevel = "all" | "province" | "region"

// Constants for business categorization
const YOUNG_COMPANY_MAX_AGE = 4 // Years (< 5 years old)
const SMALL_COMPANY_WORKER_CLASS_INDEX = 0 // First worker class (0-4 employees)
const CONSTRUCTION_SECTOR_CODE = "F" // NACE sector code for construction

const MONTH_NAMES = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
]

const WORKER_CLASS_ORDER = [
  "0 - 4 werknemers",
  "5 - 9 werknemers",
  "10 - 19 werknemers",
  "20 - 49 werknemers",
  "50 - 99 werknemers",
  "100 - 199 werknemers",
  "200 - 249 werknemers",
  "250 - 499 werknemers",
  "500 - 999 werknemers",
  "1000 werknemers en meer",
  "1000 en meer werknemers",
]

function getMonthlyData(sector: string, provinceCode: string | null, months: number = 24): ChartPoint[] {
  let data: MonthlyRow[]

  if (provinceCode && sector !== "ALL") {
    // Filter by BOTH sector AND province
    const combinedData = (monthlyBySectorProvince as MonthlySectorProvinceRow[])
      .filter((r) => r.p === provinceCode && r.s === sector)
    data = combinedData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
  } else if (provinceCode) {
    // Filter by province only (all sectors)
    const provData = (monthlyProvinces as MonthlyProvinceRow[])
      .filter((r) => r.p === provinceCode)
    data = provData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
  } else if (sector === "ALL") {
    // All sectors, all regions
    data = monthlyTotals as MonthlyRow[]
  } else {
    // Specific sector, all regions
    const sectorData = (monthlyBySector as MonthlySectorRow[])
      .filter((r) => r.s === sector)
    data = sectorData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
  }

  return data
    .map((r) => ({
      sortValue: r.y * 100 + r.m,
      periodCells: [`${MONTH_NAMES[r.m - 1]} ${r.y}`],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
    .slice(-months)
}

function getMonthlyDataForProvinces(sector: string, provinceCodes: string[] | null, months: number = 24, isBrussels: boolean = false): ChartPoint[] {
  // Brussels: calculate as total - provinces
  if (isBrussels) {
    const totals = sector === "ALL"
      ? (monthlyTotals as MonthlyRow[])
      : (monthlyBySector as MonthlySectorRow[]).filter((r) => r.s === sector).map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))

    const provinces = sector === "ALL"
      ? (monthlyProvinces as MonthlyProvinceRow[])
      : (monthlyBySectorProvince as MonthlySectorProvinceRow[]).filter((r) => r.s === sector)

    // Calculate Brussels = Total - Sum of all provinces
    const brusselsMap = new Map<string, MonthlyRow>()
    totals.forEach((total) => {
      const key = `${total.y}-${total.m}`
      brusselsMap.set(key, { y: total.y, m: total.m, n: total.n, w: total.w })
    })

    provinces.forEach((prov) => {
      const key = `${prov.y}-${prov.m}`
      const brussels = brusselsMap.get(key)
      if (brussels) {
        brussels.n -= prov.n
        brussels.w -= prov.w
      }
    })

    return Array.from(brusselsMap.values())
      .map((r) => ({
        sortValue: r.y * 100 + r.m,
        periodCells: [`${MONTH_NAMES[r.m - 1]} ${r.y}`],
        value: r.n,
      }))
      .sort((a, b) => a.sortValue - b.sortValue)
      .slice(-months)
  }

  if (!provinceCodes || provinceCodes.length === 0) {
    return getMonthlyData(sector, null, months)
  }

  const aggregateByPeriod = (rows: Array<{ y: number; m: number; n: number; w: number }>) => {
    const byPeriod = new Map<string, MonthlyRow>()
    for (const row of rows) {
      const key = `${row.y}-${row.m}`
      const existing = byPeriod.get(key)
      if (existing) {
        existing.n += row.n
        existing.w += row.w
      } else {
        byPeriod.set(key, { ...row })
      }
    }
    return Array.from(byPeriod.values())
  }

  let data: MonthlyRow[]

  if (sector !== "ALL") {
    const filtered = (monthlyBySectorProvince as MonthlySectorProvinceRow[])
      .filter((r) => provinceCodes.includes(r.p) && r.s === sector)
      .map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
    data = aggregateByPeriod(filtered)
  } else {
    const filtered = (monthlyProvinces as MonthlyProvinceRow[])
      .filter((r) => provinceCodes.includes(r.p))
      .map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
    data = aggregateByPeriod(filtered)
  }

  return data
    .map((r) => ({
      sortValue: r.y * 100 + r.m,
      periodCells: [`${MONTH_NAMES[r.m - 1]} ${r.y}`],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
    .slice(-months)
}

function getYearlyData(sector: string, provinceCode: string | null): ChartPoint[] {
  let data: YearlyRow[]

  if (provinceCode && sector !== "ALL") {
    // Filter by BOTH sector AND province
    const combinedData = (yearlyBySectorProvince as YearlySectorProvinceRow[])
      .filter((r) => r.p === provinceCode && r.s === sector)
    data = combinedData.map((r) => ({ y: r.y, n: r.n, w: r.w }))
  } else if (provinceCode) {
    // Filter by province only (all sectors) - aggregate monthly data
    const monthlyData = (monthlyProvinces as MonthlyProvinceRow[])
      .filter((r) => r.p === provinceCode)
    const byYear = new Map<number, { n: number; w: number }>()
    for (const r of monthlyData) {
      const existing = byYear.get(r.y) ?? { n: 0, w: 0 }
      byYear.set(r.y, { n: existing.n + r.n, w: existing.w + r.w })
    }
    data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
  } else if (sector === "ALL") {
    // All sectors, all regions
    data = yearlyTotals as YearlyRow[]
  } else {
    // Specific sector, all regions
    const sectorData = (yearlyBySector as YearlySectorRow[])
      .filter((r) => r.s === sector)
    data = sectorData.map((r) => ({ y: r.y, n: r.n, w: r.w }))
  }

  return data
    .map((r) => ({
      sortValue: r.y,
      periodCells: [r.y],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getYearlyDataForProvinces(sector: string, provinceCodes: string[] | null, isBrussels: boolean = false): ChartPoint[] {
  // Brussels: calculate as total - provinces
  if (isBrussels) {
    const totals = sector === "ALL"
      ? (monthlyTotals as MonthlyRow[])
      : (monthlyBySector as MonthlySectorRow[]).filter((r) => r.s === sector)

    const provinces = sector === "ALL"
      ? (monthlyProvinces as MonthlyProvinceRow[])
      : (monthlyBySectorProvince as MonthlySectorProvinceRow[]).filter((r) => r.s === sector)

    // Aggregate totals by year
    const totalsByYear = new Map<number, { n: number; w: number }>()
    totals.forEach((total) => {
      const existing = totalsByYear.get(total.y) ?? { n: 0, w: 0 }
      totalsByYear.set(total.y, { n: existing.n + total.n, w: existing.w + total.w })
    })

    // Aggregate provinces by year
    const provincesByYear = new Map<number, { n: number; w: number }>()
    provinces.forEach((prov) => {
      const existing = provincesByYear.get(prov.y) ?? { n: 0, w: 0 }
      provincesByYear.set(prov.y, { n: existing.n + prov.n, w: existing.w + prov.w })
    })

    // Calculate Brussels = Total - Provinces
    const data = Array.from(totalsByYear.entries()).map(([y, total]) => {
      const prov = provincesByYear.get(y) ?? { n: 0, w: 0 }
      return { y, n: total.n - prov.n, w: total.w - prov.w }
    })

    return data
      .map((r) => ({
        sortValue: r.y,
        periodCells: [r.y],
        value: r.n,
      }))
      .sort((a, b) => a.sortValue - b.sortValue)
  }

  if (!provinceCodes || provinceCodes.length === 0) {
    return getYearlyData(sector, null)
  }

  let data: YearlyRow[]

  if (sector !== "ALL") {
    const filtered = (yearlyBySectorProvince as YearlySectorProvinceRow[])
      .filter((r) => provinceCodes.includes(r.p) && r.s === sector)
    const byYear = new Map<number, { n: number; w: number }>()
    for (const row of filtered) {
      const existing = byYear.get(row.y) ?? { n: 0, w: 0 }
      byYear.set(row.y, { n: existing.n + row.n, w: existing.w + row.w })
    }
    data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
  } else {
    const filtered = (monthlyProvinces as MonthlyProvinceRow[])
      .filter((r) => provinceCodes.includes(r.p))
    const byYear = new Map<number, { n: number; w: number }>()
    for (const row of filtered) {
      const existing = byYear.get(row.y) ?? { n: 0, w: 0 }
      byYear.set(row.y, { n: existing.n + row.n, w: existing.w + row.w })
    }
    data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
  }

  return data
    .map((r) => ({
      sortValue: r.y,
      periodCells: [r.y],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getDurationData(sector: string, year: number, provinceCode: string | null): Array<{ label: string; value: number; sortValue: number }> {
  let data: DurationRow[]

  if (provinceCode && sector === "F") {
    // Province filter for construction sector
    const provData = (yearlyByDurationProvinceConstruction as DurationProvinceRow[])
      .filter((r) => r.y === year && r.p === provinceCode)
    data = provData.map((r) => ({
      y: r.y,
      d: r.d,
      ds: r.ds,
      do: r.do,
      n: r.n,
      w: r.w,
    }))
  } else if (provinceCode && sector === "ALL") {
    // Province filter for all sectors
    const provData = (yearlyByDurationProvince as DurationProvinceRow[])
      .filter((r) => r.y === year && r.p === provinceCode)
    data = provData.map((r) => ({
      y: r.y,
      d: r.d,
      ds: r.ds,
      do: r.do,
      n: r.n,
      w: r.w,
    }))
  } else if (provinceCode) {
    // Province filter with specific sector - not available, use national sector data
    const sectorData = (yearlyByDurationSector as DurationSectorRow[])
      .filter((r) => r.y === year && r.s === sector)
    data = sectorData.map((r) => ({
      y: r.y,
      d: r.d,
      ds: r.ds,
      do: r.do,
      n: r.n,
      w: r.w,
    }))
  } else if (sector === "F") {
    // Construction sector, no province filter
    data = (yearlyByDurationConstruction as DurationRow[])
      .filter((r) => r.y === year)
  } else if (sector === "ALL") {
    // All sectors, no province filter
    data = (yearlyByDuration as DurationRow[])
      .filter((r) => r.y === year)
  } else {
    // Specific sector, no province filter
    const sectorData = (yearlyByDurationSector as DurationSectorRow[])
      .filter((r) => r.y === year && r.s === sector)
    data = sectorData.map((r) => ({
      y: r.y,
      d: r.d,
      ds: r.ds,
      do: r.do,
      n: r.n,
      w: r.w,
    }))
  }

  return data
    .map((r) => ({
      label: r.ds,
      value: r.n,
      sortValue: r.do,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getDurationDataForProvinces(sector: string, year: number, provinceCodes: string[] | null, isBrussels: boolean = false): Array<{ label: string; value: number; sortValue: number }> {
  // Brussels: calculate as total - provinces
  if (isBrussels) {
    if (sector !== "F" && sector !== "ALL") {
      // Non-construction, non-ALL sectors don't have Brussels data
      return getDurationData(sector, year, null)
    }

    const totals = sector === "F"
      ? (yearlyByDurationConstruction as DurationRow[]).filter((r) => r.y === year)
      : (yearlyByDuration as DurationRow[]).filter((r) => r.y === year)

    const provinces = sector === "F"
      ? (yearlyByDurationProvinceConstruction as DurationProvinceRow[]).filter((r) => r.y === year)
      : (yearlyByDurationProvince as DurationProvinceRow[]).filter((r) => r.y === year)

    // Aggregate provinces by duration
    const provincesByDuration = new Map<string, { n: number; w: number }>()
    provinces.forEach((r) => {
      const existing = provincesByDuration.get(r.d) ?? { n: 0, w: 0 }
      provincesByDuration.set(r.d, { n: existing.n + r.n, w: existing.w + r.w })
    })

    // Calculate Brussels = Total - Provinces
    return totals
      .map((total) => ({
        label: total.ds,
        value: total.n - (provincesByDuration.get(total.d)?.n ?? 0),
        sortValue: total.do,
      }))
      .sort((a, b) => a.sortValue - b.sortValue)
  }

  if (!provinceCodes || provinceCodes.length === 0) {
    return getDurationData(sector, year, null)
  }

  if (sector !== "F" && sector !== "ALL") {
    return getDurationData(sector, year, null)
  }

  const rows = sector === "F"
    ? (yearlyByDurationProvinceConstruction as DurationProvinceRow[])
        .filter((r) => r.y === year && provinceCodes.includes(r.p))
    : (yearlyByDurationProvince as DurationProvinceRow[])
        .filter((r) => r.y === year && provinceCodes.includes(r.p))

  const byDuration = new Map<string, DurationRow>()
  for (const row of rows) {
    const key = row.d
    const existing = byDuration.get(key)
    if (existing) {
      existing.n += row.n
      existing.w += row.w
    } else {
      byDuration.set(key, {
        y: row.y,
        d: row.d,
        ds: row.ds,
        do: row.do,
        n: row.n,
        w: row.w,
      })
    }
  }

  return Array.from(byDuration.values())
    .map((r) => ({
      label: r.ds,
      value: r.n,
      sortValue: r.do,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getWorkersData(sector: string, year: number, provinceCode: string | null): Array<{ label: string; value: number; sortValue: number }> {
  let data: WorkersRow[]

  if (provinceCode && sector === "F") {
    // Province filter for construction sector
    const provData = (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[])
      .filter((r) => r.y === year && r.p === provinceCode)
    const byClass = new Map<string, { n: number; w: number }>()
    for (const r of provData) {
      const existing = byClass.get(r.c) ?? { n: 0, w: 0 }
      byClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
    }
    data = Array.from(byClass.entries()).map(([c, v]) => ({
      y: year,
      c,
      n: v.n,
      w: v.w,
    }))
  } else if (provinceCode && sector === "ALL") {
    // Province filter for all sectors
    const provData = (yearlyByWorkersProvince as WorkersProvinceRow[])
      .filter((r) => r.y === year && r.p === provinceCode)
    const byClass = new Map<string, { n: number; w: number }>()
    for (const r of provData) {
      const existing = byClass.get(r.c) ?? { n: 0, w: 0 }
      byClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
    }
    data = Array.from(byClass.entries()).map(([c, v]) => ({
      y: year,
      c,
      n: v.n,
      w: v.w,
    }))
  } else if (provinceCode) {
    // Province filter with specific sector - not available, use national sector data
    data = (yearlyByWorkersSector as WorkersSectorRow[])
      .filter((r) => r.y === year && r.s === sector)
      .map((r) => ({
        y: r.y,
        c: r.c,
        n: r.n,
        w: r.w,
      }))
  } else if (sector === "F") {
    // Construction sector, no province filter
    data = (yearlyByWorkersConstruction as WorkersRow[])
      .filter((r) => r.y === year)
  } else if (sector === "ALL") {
    // All sectors, no province filter
    data = (yearlyByWorkers as WorkersRow[])
      .filter((r) => r.y === year)
  } else {
    // Specific sector, no province filter
    data = (yearlyByWorkersSector as WorkersSectorRow[])
      .filter((r) => r.y === year && r.s === sector)
      .map((r) => ({
        y: r.y,
        c: r.c,
        n: r.n,
        w: r.w,
      }))
  }

  return data
    .map((r) => {
      const idx = WORKER_CLASS_ORDER.indexOf(r.c)
      return {
        label: r.c,
        value: r.n,
        sortValue: idx === -1 ? 999 : idx,
      }
    })
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getWorkersDataForProvinces(sector: string, year: number, provinceCodes: string[] | null, isBrussels: boolean = false): Array<{ label: string; value: number; sortValue: number }> {
  // Brussels: calculate as total - provinces
  if (isBrussels) {
    if (sector !== "F" && sector !== "ALL") {
      // Non-construction, non-ALL sectors don't have Brussels data
      return getWorkersData(sector, year, null)
    }

    const totals = sector === "F"
      ? (yearlyByWorkersConstruction as WorkersRow[]).filter((r) => r.y === year)
      : (yearlyByWorkers as WorkersRow[]).filter((r) => r.y === year)

    const provinces = sector === "F"
      ? (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[]).filter((r) => r.y === year)
      : (yearlyByWorkersProvince as WorkersProvinceRow[]).filter((r) => r.y === year)

    // Aggregate provinces by worker class
    const provincesByClass = new Map<string, { n: number; w: number }>()
    provinces.forEach((r) => {
      const existing = provincesByClass.get(r.c) ?? { n: 0, w: 0 }
      provincesByClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
    })

    // Calculate Brussels = Total - Provinces
    return totals
      .map((total) => {
        const idx = WORKER_CLASS_ORDER.indexOf(total.c)
        return {
          label: total.c,
          value: total.n - (provincesByClass.get(total.c)?.n ?? 0),
          sortValue: idx === -1 ? 999 : idx,
        }
      })
      .sort((a, b) => a.sortValue - b.sortValue)
  }

  if (!provinceCodes || provinceCodes.length === 0) {
    return getWorkersData(sector, year, null)
  }

  if (sector !== "F" && sector !== "ALL") {
    return getWorkersData(sector, year, null)
  }

  const rows = sector === "F"
    ? (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[])
        .filter((r) => r.y === year && provinceCodes.includes(r.p))
    : (yearlyByWorkersProvince as WorkersProvinceRow[])
        .filter((r) => r.y === year && provinceCodes.includes(r.p))

  const byClass = new Map<string, WorkersRow>()
  for (const row of rows) {
    const existing = byClass.get(row.c)
    if (existing) {
      existing.n += row.n
      existing.w += row.w
    } else {
      byClass.set(row.c, {
        y: row.y,
        c: row.c,
        n: row.n,
        w: row.w,
      })
    }
  }

  return Array.from(byClass.values())
    .map((r) => {
      const idx = WORKER_CLASS_ORDER.indexOf(r.c)
      return {
        label: r.c,
        value: r.n,
        sortValue: idx === -1 ? 999 : idx,
      }
    })
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getSectorData(
  year: number,
  provinceCode: string | null
): Array<{ label: string; value: number; sector: string }> {
  const sectors = (lookups?.sectors ?? []) as Sector[]
  const data = provinceCode
    ? (yearlyBySectorProvince as YearlySectorProvinceRow[])
        .filter((r) => r.y === year && r.p === provinceCode)
        .map((r) => ({ s: r.s, n: r.n }))
    : (yearlyBySector as YearlySectorRow[])
        .filter((r) => r.y === year)

  const sortedData = data
    .map((r) => ({
      sector: r.s,
      label: sectors.find((s) => s.code === r.s)?.nl ?? r.s,
      value: r.n,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // Ensure we have valid data for maxValue calculation
  return sortedData.length > 0 ? sortedData : []
}

function getSectorDataForProvinces(
  year: number,
  provinceCodes: string[] | null,
  isBrussels: boolean = false
): Array<{ label: string; value: number; sector: string }> {
  // Brussels: calculate as total - provinces
  if (isBrussels) {
    const sectors = (lookups?.sectors ?? []) as Sector[]
    const totals = (yearlyBySector as YearlySectorRow[]).filter((r) => r.y === year)
    const provinces = (yearlyBySectorProvince as YearlySectorProvinceRow[]).filter((r) => r.y === year)

    // Aggregate provinces by sector
    const provincesBySector = new Map<string, number>()
    provinces.forEach((r) => {
      provincesBySector.set(r.s, (provincesBySector.get(r.s) ?? 0) + r.n)
    })

    // Calculate Brussels = Total - Provinces
    const sortedData = totals
      .map((total) => ({
        sector: total.s,
        label: sectors.find((s) => s.code === total.s)?.nl ?? total.s,
        value: total.n - (provincesBySector.get(total.s) ?? 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    return sortedData.length > 0 ? sortedData : []
  }

  if (!provinceCodes || provinceCodes.length === 0) {
    return getSectorData(year, null)
  }

  const sectors = (lookups?.sectors ?? []) as Sector[]
  const rows = (yearlyBySectorProvince as YearlySectorProvinceRow[])
    .filter((r) => r.y === year && provinceCodes.includes(r.p))

  const bySector = new Map<string, number>()
  for (const row of rows) {
    bySector.set(row.s, (bySector.get(row.s) ?? 0) + row.n)
  }

  const sortedData = Array.from(bySector.entries())
    .map(([sector, value]) => ({
      sector,
      label: sectors.find((s) => s.code === sector)?.nl ?? sector,
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  return sortedData.length > 0 ? sortedData : []
}

interface FaillissementenEmbedProps {
  section: SectionType
  viewType: ViewType
  sector?: string | null
  year?: number | null
  timeRange?: string | null
  provinceCode?: string | null
}

// Get defaults from central registry
const DEFAULTS = getAnalysisDefaults('faillissementen')

// Type-safe default for timeRange (only yearly or monthly for faillissementen)
const DEFAULT_TIME_RANGE: "yearly" | "monthly" =
  DEFAULTS.timeRange === 'yearly' || DEFAULTS.timeRange === 'monthly'
    ? DEFAULTS.timeRange
    : 'yearly'

export function FaillissementenEmbed({
  section,
  viewType,
  sector: sectorProp = DEFAULTS.selectedSector as string,  // From registry
  year: yearProp = null,
  timeRange: timeRangeProp = DEFAULT_TIME_RANGE,           // From registry (type-safe!)
  provinceCode: provinceCodeProp = null,
}: FaillissementenEmbedProps) {
  const { data: bundle, loading, error } = useFaillissementenData()

  if (bundle) {
    monthlyConstruction = bundle.monthlyConstruction as MonthlyRow[]
    monthlyTotals = bundle.monthlyTotals as MonthlyRow[]
    monthlyBySector = bundle.monthlyBySector as MonthlySectorRow[]
    monthlyBySectorProvince = bundle.monthlyBySectorProvince as MonthlySectorProvinceRow[]
    monthlyProvinces = bundle.monthlyProvinces as MonthlyProvinceRow[]
    monthlyProvincesConstruction = bundle.monthlyProvincesConstruction as MonthlyProvinceRow[]
    yearlyConstruction = bundle.yearlyConstruction as YearlyRow[]
    yearlyTotals = bundle.yearlyTotals as YearlyRow[]
    yearlyBySector = bundle.yearlyBySector as YearlySectorRow[]
    yearlyBySectorProvince = bundle.yearlyBySectorProvince as YearlySectorProvinceRow[]
    yearlyByDuration = bundle.yearlyByDuration as DurationRow[]
    yearlyByDurationConstruction = bundle.yearlyByDurationConstruction as DurationRow[]
    yearlyByDurationProvince = bundle.yearlyByDurationProvince as DurationProvinceRow[]
    yearlyByDurationProvinceConstruction = bundle.yearlyByDurationProvinceConstruction as DurationProvinceRow[]
    yearlyByDurationSector = bundle.yearlyByDurationSector as DurationSectorRow[]
    yearlyByWorkers = bundle.yearlyByWorkers as WorkersRow[]
    yearlyByWorkersConstruction = bundle.yearlyByWorkersConstruction as WorkersRow[]
    yearlyByWorkersProvince = bundle.yearlyByWorkersProvince as WorkersProvinceRow[]
    yearlyByWorkersProvinceConstruction = bundle.yearlyByWorkersProvinceConstruction as WorkersProvinceRow[]
    yearlyByWorkersSector = bundle.yearlyByWorkersSector as WorkersSectorRow[]
    lookups = bundle.lookups
    metadata = bundle.metadata as { min_year: number; max_year: number }

    VALID_SECTOR_CODES = Array.from(
      new Set([
        "ALL",
        ...((lookups?.sectors ?? []) as Sector[]).map((s) => s.code),
      ])
    )
  }

  const meta =
    (bundle?.metadata as { min_year: number; max_year: number }) ??
    metadata ??
    { min_year: 0, max_year: 0 }

  // Validate all inputs before using them
  const geoValidation = useMemo(() => {
    if (provinceCodeProp === null || provinceCodeProp === undefined || provinceCodeProp === "") {
      return {
        valid: true,
        value: { level: "all" as GeoLevel, regionCode: null as RegionCode | null, provinceCodes: null as string[] | null, isBrussels: false },
      }
    }

    const region = REGIONS.find((r) => r.code === provinceCodeProp)
    if (region) {
      if (region.code === "1000") {
        return {
          valid: true,
          value: { level: "all" as GeoLevel, regionCode: region.code, provinceCodes: null, isBrussels: false },
        }
      }

      // Special case: Brussels (4000) - doesn't have province data, needs to be calculated as total - provinces
      if (region.code === "4000") {
        return {
          valid: true,
          value: { level: "region" as GeoLevel, regionCode: region.code, provinceCodes: null, isBrussels: true },
        }
      }

      // Flanders (2000) or Wallonia (3000) - aggregate their provinces
      return {
        valid: true,
        value: { level: "region" as GeoLevel, regionCode: region.code, provinceCodes: getProvincesForRegion(region.code), isBrussels: false },
      }
    }

    const province = PROVINCES.find((p) => p.code === provinceCodeProp)
    if (province) {
      return {
        valid: true,
        value: { level: "province" as GeoLevel, regionCode: province.regionCode, provinceCodes: [province.code], isBrussels: false },
      }
    }

    const validProvinces = PROVINCES.map((p) => `${p.name} (${p.code})`).join(', ')
    const validRegions = REGIONS.map((r) => `${r.name} (${r.code})`).join(', ')
    return {
      valid: false,
      value: null,
      error: `Ongeldige provincie of regio code: ${provinceCodeProp}. Geldige provincies: ${validProvinces}. Geldige regio's: ${validRegions}.`,
    }
  }, [provinceCodeProp])

  const timeRangeValidation = useMemo(
    () => validateTimeRange(timeRangeProp),
    [timeRangeProp]
  )

  const sectorValidation = useMemo(
    () => validateSectorCode(sectorProp ?? null, VALID_SECTOR_CODES, true),
    [sectorProp, bundle]
  )

  const yearValidation = useMemo(
    () => validateYear(yearProp ?? meta.max_year, meta.min_year, meta.max_year, true),
    [yearProp, meta.min_year, meta.max_year]
  )

  // Use validated values
  const isQuarterly = timeRangeValidation.valid && timeRangeValidation.value === "quarterly"
  const sector = sectorValidation.valid
    ? (sectorValidation.value ?? "ALL")
    : (DEFAULTS.selectedSector as string)
  const geoLevel = geoValidation.valid && geoValidation.value ? geoValidation.value.level : "all"
  const regionCode = geoValidation.valid && geoValidation.value ? geoValidation.value.regionCode : null
  const provinceCodes = geoValidation.valid && geoValidation.value ? geoValidation.value.provinceCodes : null
  const isBrussels = geoValidation.valid && geoValidation.value ? geoValidation.value.isBrussels : false
  const timeRange = isQuarterly
    ? DEFAULT_TIME_RANGE
    : (timeRangeValidation.valid ? (timeRangeValidation.value ?? DEFAULT_TIME_RANGE) : DEFAULT_TIME_RANGE)
  const year = yearValidation.valid ? (yearValidation.value ?? meta.max_year) : meta.max_year
  const data = useMemo(() => {
    switch (section) {
      case "evolutie":
        return timeRange === "monthly"
          ? getMonthlyDataForProvinces(sector, provinceCodes, 36, isBrussels)
          : getYearlyDataForProvinces(sector, provinceCodes, isBrussels)
      case "leeftijd":
        return getDurationDataForProvinces(sector, year, provinceCodes, isBrussels).map((d) => ({
          sortValue: d.sortValue,
          periodCells: [d.label],
          value: d.value,
        }))
      case "bedrijfsgrootte":
        return getWorkersDataForProvinces(sector, year, provinceCodes, isBrussels).map((d) => ({
          sortValue: d.sortValue,
          periodCells: [d.label],
          value: d.value,
        }))
      case "sectoren":
        return getSectorDataForProvinces(year, provinceCodes, isBrussels).map((d, i) => ({
          sortValue: i,
          periodCells: [d.label],
          value: d.value,
        }))
    }
  }, [section, sector, year, timeRange, provinceCodes, isBrussels, bundle])

  const title = useMemo(() => {
    const sectors = (lookups?.sectors ?? []) as Sector[]
    const provinces = (lookups?.provinces ?? []) as Array<{ code: string; name: string }>

    const sectorLabel = sector === "ALL"
      ? "alle sectoren"
      : sectors.find(s => s.code === sector)?.nl.toLowerCase() ?? "bouwsector"

    const provinceLabel = geoLevel === "province" && provinceCodes?.[0]
      ? ` - ${provinces.find(p => p.code === provinceCodes[0])?.name ?? "Provincie"}`
      : geoLevel === "region"
        ? ` - ${REGIONS.find(r => r.code === regionCode)?.name ?? "Regio"}`
        : ""

    switch (section) {
      case "evolutie":
        return sector === "ALL"
          ? `Evolutie faillissementen${provinceLabel} - ${timeRange === "monthly" ? "maandelijks" : "jaarlijks"}`
          : `Evolutie ${sectorLabel}${provinceLabel} - ${timeRange === "monthly" ? "maandelijks" : "jaarlijks"}`
      case "leeftijd":
        return `Bedrijfsleeftijd gefailleerde bedrijven - ${sectorLabel}${provinceLabel}`
      case "bedrijfsgrootte":
        return `Bedrijfsgrootte gefailleerde bedrijven - ${sectorLabel}${provinceLabel}`
      case "sectoren":
        return `Top 10 sectoren met meeste faillissementen${provinceLabel}`
    }
  }, [section, sector, timeRange, geoLevel, regionCode, provinceCodes, bundle])

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

  // Show error if validation fails
  if (!geoValidation.valid) {
    return (
      <div className="p-8 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-700 font-semibold mb-2">Fout in regio/provincie filter</p>
        <p className="text-red-600 text-sm">{geoValidation.error}</p>
      </div>
    )
  }

  if (!timeRangeValidation.valid) {
    return (
      <div className="p-8 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-700 font-semibold mb-2">Fout in tijdsperiode filter</p>
        <p className="text-red-600 text-sm">{timeRangeValidation.error}</p>
      </div>
    )
  }

  if (isQuarterly) {
    return (
      <div className="p-8 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-700 font-semibold mb-2">Fout in tijdsperiode filter</p>
        <p className="text-red-600 text-sm">Kwartaalgegevens zijn niet beschikbaar voor deze analyse.</p>
      </div>
    )
  }

  if (!sectorValidation.valid) {
    return (
      <div className="p-8 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-700 font-semibold mb-2">Fout in sector filter</p>
        <p className="text-red-600 text-sm">{sectorValidation.error}</p>
      </div>
    )
  }

  if (!yearValidation.valid) {
    return (
      <div className="p-8 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-700 font-semibold mb-2">Fout in jaar filter</p>
        <p className="text-red-600 text-sm">{yearValidation.error}</p>
      </div>
    )
  }

  const periodHeaders = section === "evolutie" && timeRange === "monthly" ? ["Maand"] : ["Categorie"]

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {viewType === "chart" && section === "evolutie" && (
        <FilterableChart
          data={data}
          getLabel={(d) => String((d as ChartPoint).periodCells[0])}
          getValue={(d) => (d as ChartPoint).value}
          getSortValue={(d) => (d as ChartPoint).sortValue}
        />
      )}

      {viewType === "chart" && section === "sectoren" && (() => {
        const sectorData = getSectorDataForProvinces(year, provinceCodes)
        const maxValue = Math.max(sectorData[0]?.value ?? 0, 1)

        return (
          <HorizontalBarChart
            items={sectorData.map((item, i) => ({
              label: item.label,
              value: item.value,
              highlight: item.sector === CONSTRUCTION_SECTOR_CODE,
              ranking: i + 1,
            }))}
            maxValue={maxValue}
            showRanking={true}
          />
        )
      })()}

      {viewType === "chart" && section === "leeftijd" && (() => {
        const durationData = getDurationDataForProvinces(sector, year, provinceCodes)

        return (
          <HorizontalBarChart
            items={durationData.map((item) => ({
              label: item.label,
              value: item.value,
              highlight: item.sortValue <= YOUNG_COMPANY_MAX_AGE,
            }))}
            maxValue={1} // Will be ignored when showPercentages is true
            showPercentages={true}
            highlightClassName="text-destructive bg-destructive/5"
            highlightBarClassName="bg-destructive"
          />
        )
      })()}

      {viewType === "chart" && section === "bedrijfsgrootte" && (() => {
        const workersData = getWorkersDataForProvinces(sector, year, provinceCodes)

        return (
          <HorizontalBarChart
            items={workersData.map((item) => ({
              label: item.label,
              value: item.value,
              highlight: item.sortValue === SMALL_COMPANY_WORKER_CLASS_INDEX,
            }))}
            maxValue={1} // Will be ignored when showPercentages is true
            showPercentages={true}
          />
        )
      })()}

      {viewType === "table" && (
        <FilterableTable data={data} label="Faillissementen" periodHeaders={periodHeaders} />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}
