// Faillissementen (Statbel TF_BANKRUPTCIES), in dezelfde geografische structuur als de rest van de app.
// Rijen ontbreken wanneer er geen faillissementen waren: een ontbrekende rij betekent dus nul, geen data-gat.

import { BELGIUM, filterGeoSectorRows } from "@/lib/selection"

export type BankruptcyRow = { y: number; m: number; g: string; n1: string; n: number; w: number }
export type BreakdownRow = { d: "dur" | "cls"; k: number; y: number; g: string; n1: string; n: number; w: number }
export type BankruptcyLookups = {
  latestYear: number
  latestMonth: number
  latestPeriod: string
  minYear: number
  durations: Array<{ code: number; nl: string }>
  classes: Array<{ code: number; nl: string }>
  sourceUrl: string
}
export type TimeRange = "yearly" | "quarterly" | "monthly"
export type BankruptcyMetric = "n" | "w"
export type BreakdownDim = "dur" | "cls"

export type BankruptcyPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  label: string
}

const MONTH_NAMES_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

export const DURATION_SHORT_LABELS: Record<number, string> = {
  0: "< 1 jaar",
  1: "1-2 jaar",
  2: "2-3 jaar",
  3: "3-4 jaar",
  4: "4-5 jaar",
  5: "5-10 jaar",
  6: "10-15 jaar",
  7: "15-20 jaar",
  8: "≥ 20 jaar",
}

/** Een periode telt enkel mee als ze volledig is (het lopende jaar of kwartaal wordt niet vergeleken met volledige). */
function isCompletePeriod(year: number, month: number, timeRange: TimeRange, lookups: BankruptcyLookups): boolean {
  if (timeRange === "monthly") return true
  const lastMonth = year < lookups.latestYear ? 12 : lookups.latestMonth
  if (timeRange === "yearly") return year < lookups.latestYear || lookups.latestMonth === 12
  return Math.ceil(month / 3) * 3 <= lastMonth
}

export function aggregateBankruptcies(
  rows: BankruptcyRow[],
  metric: BankruptcyMetric,
  timeRange: TimeRange,
  geos: string[],
  sectors: string[],
  lookups: BankruptcyLookups
): BankruptcyPoint[] {
  const grouped = new Map<string, BankruptcyPoint>()

  // Begin met alle perioden (met nul), zodat maanden zonder faillissementen niet verdwijnen.
  for (let year = lookups.minYear; year <= lookups.latestYear; year += 1) {
    const lastMonth = year === lookups.latestYear ? lookups.latestMonth : 12
    for (let month = 1; month <= lastMonth; month += 1) {
      if (!isCompletePeriod(year, month, timeRange, lookups)) continue
      const quarter = Math.ceil(month / 3)
      const [key, label, sortValue] =
        timeRange === "yearly"
          ? [String(year), String(year), year]
          : timeRange === "quarterly"
            ? [`${year}-K${quarter}`, `K${quarter} ${year}`, year * 10 + quarter]
            : [`${year}-${month}`, `${MONTH_NAMES_SHORT[month - 1]} ${year}`, year * 100 + month]
      if (!grouped.has(key)) grouped.set(key, { sortValue: sortValue as number, periodCells: [label as string], value: 0, label: label as string })
    }
  }

  for (const row of filterGeoSectorRows(rows, geos, sectors)) {
    if (!isCompletePeriod(row.y, row.m, timeRange, lookups)) continue
    const quarter = Math.ceil(row.m / 3)
    const key = timeRange === "yearly" ? String(row.y) : timeRange === "quarterly" ? `${row.y}-K${quarter}` : `${row.y}-${row.m}`
    const point = grouped.get(key)
    if (point) point.value += row[metric]
  }
  return Array.from(grouped.values()).sort((a, b) => a.sortValue - b.sortValue)
}

/** Faillissementen per 1.000 btw-plichtige ondernemingen, enkel voor jaren met beide reeksen. */
export function bankruptcyRatePerThousand(bankruptcies: BankruptcyPoint[], enterprises: Array<{ sortValue: number; value: number }>): BankruptcyPoint[] {
  const stock = new Map(enterprises.map((point) => [point.sortValue, point.value]))
  return bankruptcies
    .filter((point) => (stock.get(point.sortValue) ?? 0) > 0)
    .map((point) => ({
      ...point,
      value: Math.round((point.value / (stock.get(point.sortValue) as number)) * 10000) / 10,
    }))
}

export type BreakdownPoint = {
  sortValue: number
  label: string
  periodCells: Array<string | number>
  value: number // totaal over alle categorieën
  [categoryKey: string]: string | number | Array<string | number>
}

export function breakdownKey(code: number) {
  return `c${code}`
}

/** Jaarcijfers per categorie (leeftijd of werknemersklasse) voor de gekozen locaties en sectoren. Het lopende jaar valt weg. */
export function aggregateBreakdown(
  rows: BreakdownRow[],
  dim: BreakdownDim,
  metric: BankruptcyMetric,
  geos: string[],
  sectors: string[],
  lookups: BankruptcyLookups
): BreakdownPoint[] {
  const categories = (dim === "dur" ? lookups.durations : lookups.classes).map((item) => item.code)
  const lastYear = lookups.latestMonth === 12 ? lookups.latestYear : lookups.latestYear - 1
  const byYear = new Map<number, BreakdownPoint>()
  for (let year = lookups.minYear; year <= lastYear; year += 1) {
    const point: BreakdownPoint = { sortValue: year, label: String(year), periodCells: [year], value: 0 }
    for (const code of categories) point[breakdownKey(code)] = 0
    byYear.set(year, point)
  }

  for (const row of filterGeoSectorRows(rows.filter((item) => item.d === dim), geos, sectors)) {
    const point = byYear.get(row.y)
    if (!point) continue
    point[breakdownKey(row.k)] = (point[breakdownKey(row.k)] as number) + row[metric]
    point.value += row[metric]
  }
  return Array.from(byYear.values()).sort((a, b) => a.sortValue - b.sortValue)
}

export const BELGIUM_CODE = BELGIUM

/** De grafiek toont maximaal vijf reeksen (kleurenpalet); tabel en export bevatten alle categorieën. */
export const BREAKDOWN_GROUPS: Record<BreakdownDim, Array<{ key: string; label: string; codes: number[] }>> = {
  dur: [
    { key: "g0", label: "< 1 jaar", codes: [0] },
    { key: "g1", label: "1-2 jaar", codes: [1] },
    { key: "g2", label: "2-5 jaar", codes: [2, 3, 4] },
    { key: "g3", label: "5-10 jaar", codes: [5] },
    { key: "g4", label: "10 jaar of meer", codes: [6, 7, 8] },
  ],
  cls: [
    { key: "g0", label: "0 - 4 werknemers", codes: [1] },
    { key: "g1", label: "5 - 9 werknemers", codes: [2] },
    { key: "g2", label: "10 - 19 werknemers", codes: [3] },
    { key: "g3", label: "20 - 49 werknemers", codes: [4] },
    { key: "g4", label: "50 werknemers of meer", codes: [5, 6, 7, 8, 9, 10] },
  ],
}

export function groupBreakdown(points: BreakdownPoint[], dim: BreakdownDim) {
  return points.map((point) => {
    const grouped: Record<string, number | string | Array<string | number>> = { sortValue: point.sortValue, label: point.label }
    for (const group of BREAKDOWN_GROUPS[dim]) {
      grouped[group.key] = group.codes.reduce((sum, code) => sum + ((point[breakdownKey(code)] as number) ?? 0), 0)
    }
    return grouped
  })
}
