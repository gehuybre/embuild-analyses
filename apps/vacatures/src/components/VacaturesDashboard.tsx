"use client"

import * as React from "react"
import { AlertCircle, BriefcaseBusiness, CalendarClock, Database, Download, TrendingDown, TrendingUp } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@embuild/shared/components/ui/alert"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import {
  type BeroepsgroepRow,
  type GroupRow,
  type HierarchyOption,
  type HierarchySeriesRow,
  type MonthlyTotalRow,
  type OccupationRow,
  type TotalRow,
  useVacaturesData,
} from "./use-vacatures-data"

export type VacaturesSection = "evolutie" | "top-beroepen"
export type VacaturesView = "chart" | "table"
export type EvolutionPeriodView = "month" | "year"
export type EvolutionMetric = "received" | "open"

type ChartPoint = {
  label: string
  value: number
  formattedValue?: string
  periodCells: Array<string | number>
  sortValue?: number
}

type PeriodTotalRow = {
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  vacatures: number
}

type BreakdownType = "beroep" | "beroepsgroep" | "hoofdberoepsgroep"

const SLUG = "vacatures"
const SOURCE = "VDAB - Arvastat"
const SOURCE_URL = "https://arvastat.vdab.be/"
const ALL_FILTER_VALUE = "__all__"

function resolveInitialPeriodView(
  initialPeriodView: EvolutionPeriodView,
  _initialMetric: EvolutionMetric,
  _initialGroup: string | undefined,
  _initialProfession: string | undefined,
  _initialDetail: string | undefined
): EvolutionPeriodView {
  return initialPeriodView
}

function formatInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(value)
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toLocaleString("nl-BE", { maximumFractionDigits: 1 })}%`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function trendIcon(value: number | null | undefined) {
  if (typeof value !== "number") return <CalendarClock className="size-4 text-muted-foreground" />
  return value >= 0 ? (
    <TrendingUp className="size-4 text-emerald-600" />
  ) : (
    <TrendingDown className="size-4 text-red-600" />
  )
}

function toTotalChartData(rows: PeriodTotalRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.period_short,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    sortValue: row.period_year * 100 + row.period_month,
    periodCells: [row.period_label, row.period_end],
  }))
}

function toAnnualTotalChartData(rows: PeriodTotalRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: String(row.period_year),
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    sortValue: row.period_year,
    periodCells: [row.period_year, row.period_end],
  }))
}

function toAnnualAverageChartData(rows: PeriodTotalRow[]): ChartPoint[] {
  const byYear = new Map<number, { total: number; count: number; periodEnd: string }>()
  for (const row of rows) {
    const existing = byYear.get(row.period_year)
    if (existing) {
      existing.total += row.vacatures
      existing.count += 1
      existing.periodEnd = row.period_end > existing.periodEnd ? row.period_end : existing.periodEnd
    } else {
      byYear.set(row.period_year, {
        total: row.vacatures,
        count: 1,
        periodEnd: row.period_end,
      })
    }
  }

  return Array.from(byYear.entries()).map(([year, row]) => {
    const value = Math.round(row.total / row.count)
    return {
      label: String(year),
      value,
      formattedValue: formatInt(value),
      sortValue: year,
      periodCells: [year, row.periodEnd],
    }
  })
}

type FilterOption = {
  value: string
  latest: number
  total: number
}

type EvolutionFilters = {
  group: string
  profession: string
  detail: string
}

function isAll(value: string): boolean {
  return value === ALL_FILTER_VALUE
}

function optionMatches(
  option: HierarchyOption,
  filters: Partial<EvolutionFilters>
): boolean {
  if (filters.group && !isAll(filters.group) && option.hoofdberoepsgroep !== filters.group) return false
  if (filters.profession && !isAll(filters.profession) && option.beroepsgroep !== filters.profession) return false
  if (filters.detail && !isAll(filters.detail) && option.beroep !== filters.detail) return false
  return true
}

function rowMatches(
  row: HierarchySeriesRow,
  filters: EvolutionFilters
): boolean {
  if (!isAll(filters.group) && row.hoofdberoepsgroep !== filters.group) return false
  if (!isAll(filters.profession) && row.beroepsgroep !== filters.profession) return false
  if (!isAll(filters.detail) && row.beroep !== filters.detail) return false
  return true
}

function aggregateOptions(
  options: HierarchyOption[],
  key: "hoofdberoepsgroep" | "beroepsgroep" | "beroep",
  filters: Partial<EvolutionFilters> = {}
): FilterOption[] {
  const byValue = new Map<string, FilterOption>()

  for (const option of options) {
    if (!optionMatches(option, filters)) continue
    const value = option[key]
    const existing = byValue.get(value)
    if (existing) {
      existing.latest += option.latest_vacatures
      existing.total += option.total_vacatures
    } else {
      byValue.set(value, {
        value,
        latest: option.latest_vacatures,
        total: option.total_vacatures,
      })
    }
  }

  return Array.from(byValue.values()).sort((a, b) =>
    b.latest - a.latest || b.total - a.total || a.value.localeCompare(b.value, "nl")
  )
}

function toHierarchyChartData(
  totals: TotalRow[],
  series: HierarchySeriesRow[],
  filters: EvolutionFilters,
  periodView: EvolutionPeriodView
): ChartPoint[] {
  const byPeriod = new Map<string, number>()
  for (const row of series) {
    if (!rowMatches(row, filters)) continue
    byPeriod.set(row.period_end, (byPeriod.get(row.period_end) ?? 0) + row.vacatures)
  }

  const groupLabel = isAll(filters.group) ? "Alle beroepsgroepen" : filters.group
  const professionLabel = isAll(filters.profession) ? "Alle beroepen" : filters.profession
  const detailLabel = isAll(filters.detail) ? "Alle beroepdetails" : filters.detail

  return totals.map((row) => {
    const value = byPeriod.get(row.period_end) ?? 0
    return {
      label: periodView === "year" ? String(row.period_year) : row.period_short,
      value,
      formattedValue: formatInt(value),
      sortValue: periodView === "year" ? row.period_year : row.period_year * 100 + row.period_month,
      periodCells: [
        periodView === "year" ? row.period_year : row.period_label,
        row.period_end,
        groupLabel,
        professionLabel,
        detailLabel,
      ],
    }
  })
}

function toOpenHierarchyChartData(
  monthlyTotals: MonthlyTotalRow[],
  series: HierarchySeriesRow[],
  filters: EvolutionFilters,
  periodView: EvolutionPeriodView,
  annualAggregation: "average" | "sum"
): ChartPoint[] {
  const byPeriod = new Map<string, number>()
  for (const row of series) {
    if (!rowMatches(row, filters)) continue
    byPeriod.set(row.period_end, (byPeriod.get(row.period_end) ?? 0) + row.vacatures)
  }

  const groupLabel = isAll(filters.group) ? "Alle beroepsgroepen" : filters.group
  const professionLabel = isAll(filters.profession) ? "Alle beroepen" : filters.profession
  const detailLabel = isAll(filters.detail) ? "Alle beroepdetails" : filters.detail

  if (periodView === "month") {
    return monthlyTotals.map((row) => {
      const value = byPeriod.get(row.period_end) ?? 0
      return {
        label: row.period_short,
        value,
        formattedValue: formatInt(value),
        sortValue: row.period_year * 100 + row.period_month,
        periodCells: [row.period_label, row.period_end, groupLabel, professionLabel, detailLabel],
      }
    })
  }

  const byYear = new Map<number, { total: number; count: number; periodEnd: string }>()
  for (const row of monthlyTotals) {
    const value = byPeriod.get(row.period_end) ?? 0
    const existing = byYear.get(row.period_year)
    if (existing) {
      existing.total += value
      existing.count += 1
      existing.periodEnd = row.period_end > existing.periodEnd ? row.period_end : existing.periodEnd
    } else {
      byYear.set(row.period_year, {
        total: value,
        count: 1,
        periodEnd: row.period_end,
      })
    }
  }

  return Array.from(byYear.entries()).map(([year, row]) => {
    const value = annualAggregation === "average" ? Math.round(row.total / row.count) : row.total
    return {
      label: String(year),
      value,
      formattedValue: formatInt(value),
      sortValue: year,
      periodCells: [year, row.periodEnd, groupLabel, professionLabel, detailLabel],
    }
  })
}

function topOccupationData(rows: OccupationRow[]): ChartPoint[] {
  return rows.slice(0, 15).map((row) => ({
    label: row.beroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    periodCells: [row.rank, row.beroep, row.beroepsgroep, row.hoofdberoepsgroep],
  }))
}

function beroepsgroepData(rows: BeroepsgroepRow[]): ChartPoint[] {
  return rows.slice(0, 15).map((row) => ({
    label: row.beroepsgroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    periodCells: [row.rank, row.beroepsgroep, row.hoofdberoepsgroep],
  }))
}

function groupData(rows: GroupRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.hoofdberoepsgroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    periodCells: [row.rank, row.hoofdberoepsgroep],
  }))
}

function occupationTableData(rows: OccupationRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.beroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    sortValue: row.vacatures,
    periodCells: [row.rank, row.beroep, row.beroepsgroep, row.hoofdberoepsgroep],
  }))
}

function beroepsgroepTableData(rows: BeroepsgroepRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.beroepsgroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    sortValue: row.vacatures,
    periodCells: [row.rank, row.beroepsgroep, row.hoofdberoepsgroep],
  }))
}

function groupTableData(rows: GroupRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.hoofdberoepsgroep,
    value: row.vacatures,
    formattedValue: formatInt(row.vacatures),
    sortValue: row.vacatures,
    periodCells: [row.rank, row.hoofdberoepsgroep],
  }))
}

function SummaryCards({
  latestTotal,
  latestLabel,
  latestTitle,
  latestOpenTotal,
  latestOpenLabel,
  latestFullYear,
  latestFullYearTotal,
  previousFullYear,
  fullYearChangeAbs,
  fullYearChangePct,
  generatedAt,
}: {
  latestTotal: number
  latestLabel: string
  latestTitle: string
  latestOpenTotal: number | null
  latestOpenLabel: string | null
  latestFullYear: number
  latestFullYearTotal: number
  previousFullYear: number | null
  fullYearChangeAbs: number | null
  fullYearChangePct: number | null
  generatedAt: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 not-prose">
      <Card className="rounded-lg gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <BriefcaseBusiness className="size-4" />
            {latestTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <div className="text-2xl font-semibold">{formatInt(latestTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{latestLabel}</div>
        </CardContent>
      </Card>

      <Card className="rounded-lg gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <BriefcaseBusiness className="size-4" />
            Openstaand
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <div className="text-2xl font-semibold">{formatInt(latestOpenTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{latestOpenLabel ?? "Geen maanddata"}</div>
        </CardContent>
      </Card>

      <Card className="rounded-lg gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            {trendIcon(fullYearChangeAbs)}
            Kalenderjaar {latestFullYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <div className="text-2xl font-semibold">{formatInt(latestFullYearTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {previousFullYear ? `${formatPct(fullYearChangePct)} tegenover ${previousFullYear}` : "Geen vergelijkingsjaar"}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-4" />
            Dataset
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <div className="text-2xl font-semibold">{formatDate(generatedAt)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Laatste verwerking</div>
        </CardContent>
      </Card>
    </div>
  )
}

function SectionHeader({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <CardTitle className="text-base leading-tight">{title}</CardTitle>
      {children}
    </div>
  )
}

function EvolutionSection({
  totals,
  monthlyTotals,
  openMonthlyTotals,
  hierarchySeries,
  hierarchyOptions,
  receivedMonthlyHierarchySeries,
  receivedHierarchyOptions,
  openMonthlyHierarchySeries,
  openHierarchyOptions,
  selectedGroup,
  selectedProfession,
  selectedDetail,
  onGroupChange,
  onProfessionChange,
  onDetailChange,
  view,
  onViewChange,
  periodView,
  onPeriodViewChange,
  metric,
  onMetricChange,
  embedded,
}: {
  totals: TotalRow[]
  monthlyTotals: MonthlyTotalRow[]
  openMonthlyTotals: MonthlyTotalRow[]
  hierarchySeries: HierarchySeriesRow[]
  hierarchyOptions: HierarchyOption[]
  receivedMonthlyHierarchySeries: HierarchySeriesRow[]
  receivedHierarchyOptions: HierarchyOption[]
  openMonthlyHierarchySeries: HierarchySeriesRow[]
  openHierarchyOptions: HierarchyOption[]
  selectedGroup: string
  selectedProfession: string
  selectedDetail: string
  onGroupChange: (group: string) => void
  onProfessionChange: (profession: string) => void
  onDetailChange: (detail: string) => void
  view: VacaturesView
  onViewChange: (view: VacaturesView) => void
  periodView: EvolutionPeriodView
  onPeriodViewChange: (periodView: EvolutionPeriodView) => void
  metric: EvolutionMetric
  onMetricChange: (metric: EvolutionMetric) => void
  embedded?: boolean
}) {
  const hasReceivedMonthlyHierarchy = receivedMonthlyHierarchySeries.length > 0
  const activeHierarchyOptions = metric === "open"
    ? openHierarchyOptions
    : hasReceivedMonthlyHierarchy
      ? receivedHierarchyOptions
      : hierarchyOptions
  const groupOptions = React.useMemo(
    () => aggregateOptions(activeHierarchyOptions, "hoofdberoepsgroep"),
    [activeHierarchyOptions]
  )

  const validGroup = groupOptions.some((option) => option.value === selectedGroup)
    ? selectedGroup
    : ALL_FILTER_VALUE

  const professionOptions = React.useMemo(
    () => aggregateOptions(activeHierarchyOptions, "beroepsgroep", { group: validGroup }),
    [activeHierarchyOptions, validGroup]
  )

  const validProfession = professionOptions.some((option) => option.value === selectedProfession)
    ? selectedProfession
    : ALL_FILTER_VALUE

  const detailOptions = React.useMemo(
    () => aggregateOptions(activeHierarchyOptions, "beroep", {
      group: validGroup,
      profession: validProfession,
    }),
    [activeHierarchyOptions, validGroup, validProfession]
  )

  const validDetail = detailOptions.some((option) => option.value === selectedDetail)
    ? selectedDetail
    : ALL_FILTER_VALUE

  const filters = React.useMemo(
    () => ({
      group: validGroup,
      profession: validProfession,
      detail: validDetail,
    }),
    [validDetail, validGroup, validProfession]
  )

  const hasOccupationalFilter = !isAll(filters.group) || !isAll(filters.profession) || !isAll(filters.detail)
  const effectivePeriodView: EvolutionPeriodView =
    metric === "received" && hasOccupationalFilter && !hasReceivedMonthlyHierarchy
      ? "year"
      : periodView
  const annualTotals = React.useMemo(
    () => totals.filter((row) => row.period_month === 12),
    [totals]
  )

  const data = React.useMemo(() => {
    if (metric === "open") {
      if (!hasOccupationalFilter && effectivePeriodView === "month") {
        return toTotalChartData(openMonthlyTotals)
      }
      if (!hasOccupationalFilter) {
        return toAnnualAverageChartData(openMonthlyTotals)
      }
      return toOpenHierarchyChartData(
        openMonthlyTotals,
        openMonthlyHierarchySeries,
        filters,
        effectivePeriodView,
        "average"
      )
    }
    if (hasReceivedMonthlyHierarchy && hasOccupationalFilter) {
      return toOpenHierarchyChartData(
        monthlyTotals,
        receivedMonthlyHierarchySeries,
        filters,
        effectivePeriodView,
        "sum"
      )
    }
    if (effectivePeriodView === "month") {
      return toTotalChartData(monthlyTotals.length ? monthlyTotals : totals)
    }
    if (!hasOccupationalFilter) {
      return toAnnualTotalChartData(annualTotals)
    }
    return toHierarchyChartData(annualTotals, hierarchySeries, filters, effectivePeriodView)
  }, [
    annualTotals,
    effectivePeriodView,
    filters,
    hasOccupationalFilter,
    hierarchySeries,
    metric,
    monthlyTotals,
    openMonthlyHierarchySeries,
    openMonthlyTotals,
    receivedMonthlyHierarchySeries,
    totals,
  ])

  const selectedLabel = hasOccupationalFilter
    ? [
        isAll(validGroup) ? null : validGroup,
        isAll(validProfession) ? null : validProfession,
        isAll(validDetail) ? null : validDetail,
      ].filter(Boolean).join(" - ")
    : "Alle beroepen"
  const metricLabel = metric === "open" ? "Openstaande vacatures" : "Ontvangen vacatures"
  const periodLabel = effectivePeriodView === "month" ? "Maanddata" : metric === "open" ? "Jaargemiddelde" : "Jaardata"
  const periodHeaders = React.useMemo(() => {
    const baseHeaders = effectivePeriodView === "month" ? ["Maand", "Einddatum"] : ["Jaar", "Einddatum"]
    return !hasOccupationalFilter
      ? baseHeaders
      : [...baseHeaders, "Beroepsgroep", "Beroep", "Beroepdetail"]
  }, [effectivePeriodView, hasOccupationalFilter])

  return (
    <Card className="rounded-lg not-prose">
      <CardHeader className="gap-3">
        <CardTitle className="text-base leading-tight">Vacatures per periode</CardTitle>
        <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Tabs
            value={metric}
            onValueChange={(next) => onMetricChange(next as EvolutionMetric)}
            className="min-w-0"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="received">Ontvangen</TabsTrigger>
              <TabsTrigger value="open">Openstaand</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={validGroup} onValueChange={onGroupChange}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Alle beroepsgroepen</SelectItem>
              {groupOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={validProfession} onValueChange={onProfessionChange}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Alle beroepen</SelectItem>
              {professionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={validDetail} onValueChange={onDetailChange}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Alle beroepdetails</SelectItem>
              {detailOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs
            value={effectivePeriodView}
            onValueChange={(next) => onPeriodViewChange(next as EvolutionPeriodView)}
            className="min-w-0"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="month" disabled={metric === "received" && hasOccupationalFilter && !hasReceivedMonthlyHierarchy}>
                Maanddata
              </TabsTrigger>
              <TabsTrigger value="year">{metric === "open" ? "Jaargem." : "Jaardata"}</TabsTrigger>
            </TabsList>
          </Tabs>
          {!embedded && (
            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <ExportButtons
                data={data}
                title={`${metricLabel} in de bouw - ${selectedLabel} - ${periodLabel}`}
                slug={SLUG}
                sectionId="evolutie"
                viewType={view}
                periodHeaders={periodHeaders}
                valueLabel="Vacatures"
                dataSource={SOURCE}
                dataSourceUrl={SOURCE_URL}
                embedParams={{
                  group: isAll(validGroup) ? null : validGroup,
                  profession: isAll(validProfession) ? null : validProfession,
                  detail: isAll(validDetail) ? null : validDetail,
                  occupation: isAll(validDetail) ? null : validDetail,
                  period: effectivePeriodView,
                  metric,
                }}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={(next) => onViewChange(next as VacaturesView)}>
          {!embedded && (
            <TabsList className="mb-4">
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="chart" className="mt-0">
            <FilterableChart
              data={data}
              chartType={effectivePeriodView === "month" ? "line" : "bar"}
              showMovingAverage={false}
              yAxisLabelAbove={metricLabel}
              yAxisFormatter={(value) => formatInt(value)}
            />
          </TabsContent>
          <TabsContent value="table" className="mt-0">
            <FilterableTable data={data} label="Vacatures" periodHeaders={periodHeaders} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function BreakdownSection({
  occupations,
  beroepsgroepen,
  groups,
  latestPeriod,
  view,
  onViewChange,
  embedded,
}: {
  occupations: OccupationRow[]
  beroepsgroepen: BeroepsgroepRow[]
  groups: GroupRow[]
  latestPeriod: string
  view: VacaturesView
  onViewChange: (view: VacaturesView) => void
  embedded?: boolean
}) {
  const [breakdown, setBreakdown] = React.useState<BreakdownType>("beroep")

  const chartData = React.useMemo(() => {
    if (breakdown === "hoofdberoepsgroep") return groupData(groups)
    if (breakdown === "beroepsgroep") return beroepsgroepData(beroepsgroepen)
    return topOccupationData(occupations)
  }, [breakdown, beroepsgroepen, groups, occupations])

  const tableData = React.useMemo(() => {
    if (breakdown === "hoofdberoepsgroep") return groupTableData(groups)
    if (breakdown === "beroepsgroep") return beroepsgroepTableData(beroepsgroepen)
    return occupationTableData(occupations)
  }, [breakdown, beroepsgroepen, groups, occupations])

  const periodHeaders = React.useMemo(() => {
    if (breakdown === "hoofdberoepsgroep") return ["Rang", "Hoofdberoepsgroep"]
    if (breakdown === "beroepsgroep") return ["Rang", "Beroepsgroep", "Hoofdberoepsgroep"]
    return ["Rang", "Beroep", "Beroepsgroep", "Hoofdberoepsgroep"]
  }, [breakdown])

  const title = breakdown === "hoofdberoepsgroep"
    ? "Verdeling naar hoofdberoepsgroep"
    : breakdown === "beroepsgroep"
      ? "Top beroepsgroepen"
      : "Top beroepen"

  return (
    <Card className="rounded-lg not-prose">
      <CardHeader>
        <SectionHeader title={`${title} - ${latestPeriod}`}>
          {!embedded && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={breakdown} onValueChange={(next) => setBreakdown(next as BreakdownType)}>
                <SelectTrigger className="w-full sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beroep">Beroepen</SelectItem>
                  <SelectItem value="beroepsgroep">Beroepsgroepen</SelectItem>
                  <SelectItem value="hoofdberoepsgroep">Hoofdgroepen</SelectItem>
                </SelectContent>
              </Select>
              <ExportButtons
                data={tableData}
                title={`${title} - vacatures in de bouw`}
                slug={SLUG}
                sectionId="top-beroepen"
                viewType={view}
                periodHeaders={periodHeaders}
                valueLabel="Vacatures"
                dataSource={SOURCE}
                dataSourceUrl={SOURCE_URL}
                embedParams={{ breakdown }}
              />
            </div>
          )}
        </SectionHeader>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={(next) => onViewChange(next as VacaturesView)}>
          {!embedded && (
            <TabsList className="mb-4">
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="chart" className="mt-0">
            <FilterableChart
              data={chartData}
              chartType="bar"
              layout="horizontal"
              showMovingAverage={false}
              yAxisLabelAbove="Vacatures"
              yAxisFormatter={(value) => formatInt(value)}
            />
          </TabsContent>
          <TabsContent value="table" className="mt-0">
            <FilterableTable data={tableData} label="Vacatures" periodHeaders={periodHeaders} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <Card className="rounded-lg not-prose">
      <CardContent className="py-10 text-sm text-muted-foreground">Data laden...</CardContent>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="not-prose">
      <AlertCircle className="size-4" />
      <AlertTitle>Data kon niet geladen worden</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function VacaturesDashboard({
  embeddedSection,
  initialView = "chart",
  initialMetric = "received",
  initialPeriodView = "month",
  initialGroup = ALL_FILTER_VALUE,
  initialProfession = ALL_FILTER_VALUE,
  initialDetail = ALL_FILTER_VALUE,
}: {
  embeddedSection?: VacaturesSection
  initialView?: VacaturesView
  initialMetric?: EvolutionMetric
  initialPeriodView?: EvolutionPeriodView
  initialGroup?: string
  initialProfession?: string
  initialDetail?: string
}) {
  const { data: bundle, loading, error } = useVacaturesData()
  const [evolutionView, setEvolutionView] = React.useState<VacaturesView>(initialView)
  const [breakdownView, setBreakdownView] = React.useState<VacaturesView>(initialView)
  const [selectedMetric, setSelectedMetric] = React.useState<EvolutionMetric>(initialMetric)
  const [evolutionPeriodView, setEvolutionPeriodView] = React.useState<EvolutionPeriodView>(() =>
    resolveInitialPeriodView(initialPeriodView, initialMetric, initialGroup, initialProfession, initialDetail)
  )
  const [selectedGroup, setSelectedGroup] = React.useState(initialGroup || ALL_FILTER_VALUE)
  const [selectedProfession, setSelectedProfession] = React.useState(initialProfession || ALL_FILTER_VALUE)
  const [selectedDetail, setSelectedDetail] = React.useState(initialDetail || ALL_FILTER_VALUE)

  React.useEffect(() => {
    if (embeddedSection === "evolutie") setEvolutionView(initialView)
    if (embeddedSection === "top-beroepen") setBreakdownView(initialView)
  }, [embeddedSection, initialView])

  React.useEffect(() => {
    setSelectedGroup(initialGroup || ALL_FILTER_VALUE)
    setSelectedProfession(initialProfession || ALL_FILTER_VALUE)
    setSelectedDetail(initialDetail || ALL_FILTER_VALUE)
    setSelectedMetric(initialMetric)
    setEvolutionPeriodView(resolveInitialPeriodView(initialPeriodView, initialMetric, initialGroup, initialProfession, initialDetail))
  }, [initialDetail, initialGroup, initialMetric, initialPeriodView, initialProfession])

  function handleMetricChange(value: EvolutionMetric) {
    setSelectedMetric(value)
  }

  function handleGroupChange(value: string) {
    setSelectedGroup(value)
    setSelectedProfession(ALL_FILTER_VALUE)
    setSelectedDetail(ALL_FILTER_VALUE)
  }

  function handleProfessionChange(value: string) {
    setSelectedProfession(value)
    setSelectedDetail(ALL_FILTER_VALUE)
  }

  function handleDetailChange(value: string) {
    setSelectedDetail(value)
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!bundle) return <ErrorState message="Geen dataset beschikbaar." />

  const csvUrl = getDataPath(bundle.metadata.raw_csv_path)

  if (embeddedSection === "evolutie") {
    return (
      <EvolutionSection
        totals={bundle.totals}
        monthlyTotals={bundle.monthlyTotals}
        openMonthlyTotals={bundle.openMonthlyTotals}
        hierarchySeries={bundle.hierarchySeries}
        hierarchyOptions={bundle.hierarchyOptions}
        receivedMonthlyHierarchySeries={bundle.receivedMonthlyHierarchySeries}
        receivedHierarchyOptions={bundle.receivedHierarchyOptions}
        openMonthlyHierarchySeries={bundle.openMonthlyHierarchySeries}
        openHierarchyOptions={bundle.openHierarchyOptions}
        selectedGroup={selectedGroup}
        selectedProfession={selectedProfession}
        selectedDetail={selectedDetail}
        onGroupChange={handleGroupChange}
        onProfessionChange={handleProfessionChange}
        onDetailChange={handleDetailChange}
        view={evolutionView}
        onViewChange={setEvolutionView}
        periodView={evolutionPeriodView}
        onPeriodViewChange={setEvolutionPeriodView}
        metric={selectedMetric}
        onMetricChange={handleMetricChange}
        embedded
      />
    )
  }

  if (embeddedSection === "top-beroepen") {
    return (
      <BreakdownSection
        occupations={bundle.occupationsLatest}
        beroepsgroepen={bundle.beroepsgroepenLatest}
        groups={bundle.groupsLatest}
        latestPeriod={bundle.metadata.latest_period_label}
        view={breakdownView}
        onViewChange={setBreakdownView}
        embedded
      />
    )
  }

  return (
    <div className="space-y-6">
      <SummaryCards
        latestTotal={bundle.metadata.latest_month_total ?? bundle.metadata.latest_total}
        latestLabel={bundle.metadata.latest_month_label ?? bundle.metadata.latest_period_label}
        latestTitle={bundle.metadata.latest_month_total ? "Ontvangen maand" : "Ontvangen periode"}
        latestOpenTotal={bundle.metadata.latest_open_month_total}
        latestOpenLabel={bundle.metadata.latest_open_month_label}
        latestFullYear={bundle.metadata.latest_full_year}
        latestFullYearTotal={bundle.metadata.latest_full_year_total}
        previousFullYear={bundle.metadata.previous_full_year}
        fullYearChangeAbs={bundle.metadata.full_year_change_abs}
        fullYearChangePct={bundle.metadata.full_year_change_pct}
        generatedAt={bundle.metadata.generated_at}
      />

      <div className="not-prose flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span>Data beschikbaar tot en met {bundle.metadata.data_availability_label}.</span>
        <Button asChild variant="outline" size="sm">
          <a href={csvUrl} download>
            <Download className="size-4" />
            Volledige CSV
          </a>
        </Button>
      </div>

      <EvolutionSection
        totals={bundle.totals}
        monthlyTotals={bundle.monthlyTotals}
        openMonthlyTotals={bundle.openMonthlyTotals}
        hierarchySeries={bundle.hierarchySeries}
        hierarchyOptions={bundle.hierarchyOptions}
        receivedMonthlyHierarchySeries={bundle.receivedMonthlyHierarchySeries}
        receivedHierarchyOptions={bundle.receivedHierarchyOptions}
        openMonthlyHierarchySeries={bundle.openMonthlyHierarchySeries}
        openHierarchyOptions={bundle.openHierarchyOptions}
        selectedGroup={selectedGroup}
        selectedProfession={selectedProfession}
        selectedDetail={selectedDetail}
        onGroupChange={handleGroupChange}
        onProfessionChange={handleProfessionChange}
        onDetailChange={handleDetailChange}
        view={evolutionView}
        onViewChange={setEvolutionView}
        periodView={evolutionPeriodView}
        onPeriodViewChange={setEvolutionPeriodView}
        metric={selectedMetric}
        onMetricChange={handleMetricChange}
      />

      <BreakdownSection
        occupations={bundle.occupationsLatest}
        beroepsgroepen={bundle.beroepsgroepenLatest}
        groups={bundle.groupsLatest}
        latestPeriod={bundle.metadata.latest_period_label}
        view={breakdownView}
        onViewChange={setBreakdownView}
      />
    </div>
  )
}
