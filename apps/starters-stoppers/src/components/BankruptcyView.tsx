"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons, FilterableChart, FilterableTable } from "@/components/ComparisonViews"
import { geoDimension, mergeComparisons, selectionCombinations, ComparisonPoint } from "@/lib/comparison"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { EmbedFilters } from "@/components/EmbedFilters"
import { GeoMultiFilter, MultiSelectInline } from "@/components/MultiSelectInline"
import {
  BREAKDOWN_GROUPS,
  BankruptcyLookups,
  BankruptcyPoint,
  BankruptcyRow,
  BreakdownDim,
  BreakdownPoint,
  BreakdownRow,
  DURATION_SHORT_LABELS,
  TimeRange,
  aggregateBankruptcies,
  aggregateBreakdown,
  bankruptcyRatePerThousand,
  breakdownKey,
  groupBreakdown,
} from "@/lib/bankruptcy"
import type { FilterItem } from "@/lib/migration"
import {
  Option,
  describeGeos,
  filterEnterpriseRows,
  geoEmbedParams,
  geoLabels,
  joinList,
  labelsFor,
} from "@/lib/selection"
import { useLazyJson } from "@/lib/use-lazy-json"

export type BankruptcyVariant = "count" | "workers" | "rate" | "age" | "size"
type EnterpriseRow = { y: number; g: string; n1: string; w: string; vat: number }

const VARIANTS: Record<BankruptcyVariant, { sectionId: string; title: string; dim?: BreakdownDim }> = {
  count: { sectionId: "bankruptcies", title: "Aantal faillissementen" },
  workers: { sectionId: "bankruptcies-workers", title: "Aantal getroffen werknemers" },
  rate: { sectionId: "bankruptcies-rate", title: "Faillissementen per 1.000 btw-plichtige ondernemingen" },
  age: { sectionId: "bankruptcies-by-age", title: "Faillissementen naar leeftijd van de onderneming", dim: "dur" },
  size: { sectionId: "bankruptcies-by-size", title: "Faillissementen naar werknemersklasse", dim: "cls" },
}

const MONTH_NAMES_FULL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
const BANKRUPTCY_SOURCE = "Statbel - Maandelijkse faillissementen"
const NUMBER_FORMAT = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 })
const RATE_FORMAT = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function useBankruptcyData(variants: BankruptcyVariant[]) {
  const needsMonthly = variants.some((variant) => ["count", "workers", "rate"].includes(variant))
  const needsBreakdown = variants.some((variant) => variant === "age" || variant === "size")
  const lookups = useLazyJson<BankruptcyLookups>("/data/bankruptcies_lookups.json", true)
  const monthly = useLazyJson<BankruptcyRow[]>("/data/bankruptcies_monthly.json", needsMonthly)
  const breakdown = useLazyJson<BreakdownRow[]>("/data/bankruptcies_breakdown.json", needsBreakdown)
  const error = lookups.error ?? monthly.error ?? breakdown.error
  const ready = Boolean(lookups.data) && (!needsMonthly || Boolean(monthly.data)) && (!needsBreakdown || Boolean(breakdown.data))
  return { lookups: lookups.data, monthly: monthly.data, breakdown: breakdown.data, ready, error }
}

type Context = {
  lookups: BankruptcyLookups
  monthly: BankruptcyRow[] | null
  breakdown: BreakdownRow[] | null
  geos: string[]
  sectors: string[]
  timeRange: TimeRange
  enterpriseRows: EnterpriseRow[]
  sectorOptions: Option[]
}

function enterpriseTotalsByYear(rows: EnterpriseRow[], geos: string[], sectors: string[]) {
  const totals = new Map<number, number>()
  for (const row of filterEnterpriseRows(rows, geos, sectors, [])) totals.set(row.y, (totals.get(row.y) ?? 0) + row.vat)
  return Array.from(totals.entries()).map(([sortValue, value]) => ({ sortValue, value }))
}

function computeSingleSeries(variant: BankruptcyVariant, ctx: Context): { points?: ComparisonPoint[]; breakdown?: BreakdownPoint[] } {
  const { lookups, monthly, breakdown, geos, sectors, timeRange } = ctx
  if (variant === "count" || variant === "workers") {
    return { points: aggregateBankruptcies(monthly ?? [], variant === "count" ? "n" : "w", timeRange, geos, sectors, lookups) }
  }
  if (variant === "rate") {
    const yearly = aggregateBankruptcies(monthly ?? [], "n", "yearly", geos, sectors, lookups)
    return { points: bankruptcyRatePerThousand(yearly, enterpriseTotalsByYear(ctx.enterpriseRows, geos, sectors)) }
  }
  const dim = VARIANTS[variant].dim as BreakdownDim
  return { breakdown: aggregateBreakdown(breakdown ?? [], dim, "n", geos, sectors, lookups) }
}

function computeSeries(variant: BankruptcyVariant, ctx: Context) {
  const groups = selectionCombinations([geoDimension(ctx.geos), { selected: ctx.sectors, options: ctx.sectorOptions }])
    .map(({ label, selections: [geos, sectors] }) => ({
      label,
      series: computeSingleSeries(variant, { ...ctx, geos, sectors }),
    }))
  if (variant !== "age" && variant !== "size") {
    return { points: mergeComparisons(groups.map((group) => ({ label: group.label, points: group.series.points ?? [] }))) }
  }
  if (groups.length === 1) return groups[0].series
  const dim = VARIANTS[variant].dim as BreakdownDim
  const chartGroups = groups.flatMap((group) =>
    BREAKDOWN_GROUPS[dim].map((category) => ({
      label: `${group.label} · ${category.label}`,
      points: groupBreakdown(group.series.breakdown ?? [], dim).map((point) => ({
        sortValue: Number(point.sortValue), label: String(point.label), periodCells: [String(point.label)],
        value: Number(point[category.key]),
      })),
    }))
  )
  const tableGroups = groups.flatMap((group) =>
    categoryLabels(variant, ctx.lookups).map((category) => ({
      label: `${group.label} · ${category.label}`,
      points: (group.series.breakdown ?? []).map((point) => ({
        sortValue: point.sortValue, label: point.label, periodCells: point.periodCells,
        value: Number(point[breakdownKey(category.code)]),
      })),
    }))
  )
  return { comparisonChart: mergeComparisons(chartGroups), comparisonTable: mergeComparisons(tableGroups) }
}

function categoryLabels(variant: BankruptcyVariant, lookups: BankruptcyLookups) {
  if (variant === "age") return lookups.durations.map((item) => ({ code: item.code, label: DURATION_SHORT_LABELS[item.code] ?? item.nl }))
  return lookups.classes.map((item) => ({ code: item.code, label: item.nl }))
}

function PanelChart({ variant, series, lookups }: { variant: BankruptcyVariant; series: ReturnType<typeof computeSeries>; lookups: BankruptcyLookups }) {
  if ("comparisonChart" in series && series.comparisonChart) {
    return <FilterableChart data={series.comparisonChart} getLabel={(point) => point.label} yAxisLabelAbove="Aantal faillissementen" />
  }
  if (variant === "age" || variant === "size") {
    const dim = VARIANTS[variant].dim as BreakdownDim
    const data = groupBreakdown(("breakdown" in series ? series.breakdown : undefined) ?? [], dim)
    return (
      <FilterableChart
        data={data}
        chartType="line"
        showMovingAverage={false}
        getLabel={(point) => String((point as { label: string }).label)}
        series={BREAKDOWN_GROUPS[dim].map((group, index) => ({ key: group.key, label: group.label, color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] }))}
        yAxisLabelAbove="Aantal faillissementen"
      />
    )
  }

  const points = ("points" in series ? series.points : undefined) ?? []
  const isRate = variant === "rate"
  return (
    <FilterableChart
      data={points}
      chartType={isRate ? "line" : undefined}
      showMovingAverage={isRate ? false : undefined}
      yAxisLabelAbove={isRate ? "Per 1.000 ondernemingen" : variant === "workers" ? "Getroffen werknemers" : "Faillissementen"}
      yAxisFormatter={isRate ? (value: number) => RATE_FORMAT.format(value) : undefined}
      tooltipUsesYAxisFormatter={isRate ? true : undefined}
      getLabel={(point) => (point as BankruptcyPoint).label}
      getValue={(point) => (point as BankruptcyPoint).value}
      getSortValue={(point) => (point as BankruptcyPoint).sortValue}
    />
  )
}

function breakdownTableRows(points: BreakdownPoint[], categories: Array<{ code: number; label: string }>) {
  return points.map((point) => ({
    sortValue: point.sortValue,
    periodCells: [point.label, ...categories.map((category) => NUMBER_FORMAT.format(point[breakdownKey(category.code)] as number))],
    value: point.value,
  }))
}

function PanelTable({ variant, series, lookups, timeRange }: { variant: BankruptcyVariant; series: ReturnType<typeof computeSeries>; lookups: BankruptcyLookups; timeRange: TimeRange }) {
  if ("comparisonTable" in series && series.comparisonTable) {
    return <FilterableTable data={series.comparisonTable} periodHeaders={["Jaar"]} />
  }
  if (variant === "age" || variant === "size") {
    const categories = categoryLabels(variant, lookups)
    return (
      <FilterableTable
        data={breakdownTableRows(("breakdown" in series ? series.breakdown : undefined) ?? [], categories)}
        label="Totaal"
        periodHeaders={["Jaar", ...categories.map((category) => category.label)]}
      />
    )
  }
  const yearly = variant === "rate" || timeRange === "yearly"
  return (
    <FilterableTable
      data={(("points" in series ? series.points : undefined) ?? []).map((point) => ({
        ...point,
        formattedValue: variant === "rate" ? RATE_FORMAT.format(point.value) : NUMBER_FORMAT.format(point.value),
      }))}
      label={variant === "rate" ? "Per 1.000 ondernemingen" : variant === "workers" ? "Getroffen werknemers" : "Faillissementen"}
      periodHeaders={[yearly ? "Jaar" : "Periode"]}
      valueFormatter={variant === "rate" ? (value) => RATE_FORMAT.format(value) : (value) => NUMBER_FORMAT.format(value)}
    />
  )
}

function exportRows(variant: BankruptcyVariant, series: ReturnType<typeof computeSeries>, lookups: BankruptcyLookups) {
  if ("comparisonTable" in series && series.comparisonTable) {
    return series.comparisonTable.map((point) => ({ label: point.label, value: point.value, periodCells: point.periodCells, comparisons: point.comparisons }))
  }
  if (variant === "age" || variant === "size") {
    const categories = categoryLabels(variant, lookups)
    return (("breakdown" in series ? series.breakdown : undefined) ?? []).map((point) => ({
      label: point.label,
      value: point.value,
      periodCells: [point.label, ...categories.map((category) => point[breakdownKey(category.code)] as number)],
    }))
  }
  return (("points" in series ? series.points : undefined) ?? []).map((point) => ({ label: point.label, value: point.value, periodCells: point.periodCells, comparisons: point.comparisons }))
}

function exportHeaders(variant: BankruptcyVariant, timeRange: TimeRange, lookups: BankruptcyLookups) {
  if (variant === "age" || variant === "size") return ["Jaar", ...categoryLabels(variant, lookups).map((category) => category.label)]
  return [variant === "rate" || timeRange === "yearly" ? "Jaar" : "Periode"]
}

function valueLabel(variant: BankruptcyVariant) {
  if (variant === "rate") return "Faillissementen per 1.000 ondernemingen"
  if (variant === "workers") return "Getroffen werknemers"
  if (variant === "age" || variant === "size") return "Totaal"
  return "Aantal faillissementen"
}

function periodLabel(timeRange: TimeRange) {
  return timeRange === "yearly" ? "Per jaar" : timeRange === "quarterly" ? "Per kwartaal" : "Per maand"
}

function latestNote(lookups: BankruptcyLookups) {
  const monthName = MONTH_NAMES_FULL[lookups.latestMonth - 1]
  return lookups.latestMonth === 12
    ? null
    : `${lookups.latestYear} is nog niet volledig (tot en met ${monthName}) en verschijnt daarom enkel in de maand- en kwartaalweergave, voor zover het kwartaal volledig is.`
}

function panelFilters(variant: BankruptcyVariant, geos: string[], sectors: string[], sectorOptions: Option[], timeRange: TimeRange): FilterItem[] {
  const items: FilterItem[] = [
    { label: "Locatie", value: geoLabels(geos).join(", ") },
    { label: "Sector", value: sectors.length > 0 ? labelsFor(sectors, sectorOptions).join(", ") : "Alle sectoren" },
  ]
  if (variant === "count" || variant === "workers") items.push({ label: "Periode", value: periodLabel(timeRange) })
  return items
}

export function BankruptcyEmbed({
  variant,
  viewType,
  geos,
  sectors,
  timeRange,
  enterpriseRows,
  sectorOptions,
}: {
  variant: BankruptcyVariant
  viewType: "chart" | "table"
  geos: string[]
  sectors: string[]
  timeRange: TimeRange
  enterpriseRows: EnterpriseRow[]
  sectorOptions: Option[]
}) {
  const data = useBankruptcyData([variant])
  const geoSuffix = geos.length > 0 ? ` - ${describeGeos(geos)}` : ""

  const series = React.useMemo(
    () =>
      data.ready && data.lookups
        ? computeSeries(variant, { lookups: data.lookups, monthly: data.monthly, breakdown: data.breakdown, geos, sectors, timeRange, enterpriseRows, sectorOptions })
        : null,
    [data.breakdown, data.lookups, data.monthly, data.ready, enterpriseRows, geos, sectors, sectorOptions, timeRange, variant]
  )

  return (
    <div className="p-4">
      <h2 className="mb-2 text-lg font-semibold">{`${VARIANTS[variant].title}${geoSuffix}`}</h2>
      <EmbedFilters items={panelFilters(variant, geos, sectors, sectorOptions, timeRange)} />
      {data.error ? (
        <p className="text-sm text-destructive">{data.error}</p>
      ) : !series || !data.lookups ? (
        <p className="text-sm text-muted-foreground">Faillissementscijfers laden...</p>
      ) : viewType === "table" ? (
        <PanelTable variant={variant} series={series} lookups={data.lookups} timeRange={timeRange} />
      ) : (
        <PanelChart variant={variant} series={series} lookups={data.lookups} />
      )}
      {data.lookups && latestNote(data.lookups) && variant !== "count" && variant !== "workers" ? (
        <p className="mt-3 text-xs text-muted-foreground">{latestNote(data.lookups)}</p>
      ) : null}
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}

function SectorFilter({ selected, onChange, options }: { selected: string[]; onChange: (value: string[]) => void; options: Option[] }) {
  return (
    <MultiSelectInline
      groups={[{ heading: "NACE", options }]}
      selected={selected}
      onChange={onChange}
      allLabel="Alle sectoren"
      noun="sectoren"
      searchable
      className="min-w-[150px]"
    />
  )
}

function TimeRangeTabs({ value, onChange }: { value: TimeRange; onChange: (value: TimeRange) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as TimeRange)}>
      <TabsList className="h-9">
        <TabsTrigger value="yearly" className="text-xs px-2">Jaar</TabsTrigger>
        <TabsTrigger value="quarterly" className="text-xs px-2">Kwartaal</TabsTrigger>
        <TabsTrigger value="monthly" className="text-xs px-2">Maand</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function PanelCard({
  variant,
  series,
  lookups,
  view,
  geos,
  sectors,
  sectorOptions,
  timeRange,
}: {
  variant: BankruptcyVariant
  series: ReturnType<typeof computeSeries>
  lookups: BankruptcyLookups
  view: "chart" | "table"
  geos: string[]
  sectors: string[]
  sectorOptions: Option[]
  timeRange: TimeRange
}) {
  const meta = VARIANTS[variant]
  const geoSuffix = geos.length > 0 ? ` - ${describeGeos(geos)}` : ""
  const filterText = panelFilters(variant, geos, sectors, sectorOptions, timeRange)
    .map((item) => `${item.label}: ${item.value}`)
    .join("; ")
  const rows = React.useMemo(() => exportRows(variant, series, lookups), [lookups, series, variant])
  const sourceTitle = variant === "rate" ? `${BANKRUPTCY_SOURCE} en Statbel - Btw-plichtige ondernemingen` : BANKRUPTCY_SOURCE

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{meta.title}</CardTitle>
        <ExportButtons
          data={rows}
          title={`${meta.title}${geoSuffix} (${filterText})`}
          slug="starters-stoppers"
          sectionId={meta.sectionId}
          viewType={view}
          periodHeaders={exportHeaders(variant, timeRange, lookups)}
          valueLabel={valueLabel(variant)}
          dataSource={sourceTitle}
          dataSourceUrl={lookups.sourceUrl}
          embedParams={{
            ...geoEmbedParams(geos),
            arrondissement: null,
            sector: joinList(sectors),
            timeRange: variant === "count" || variant === "workers" ? timeRange : null,
          }}
        />
      </CardHeader>
      <CardContent>
        {view === "chart" ? (
          <PanelChart variant={variant} series={series} lookups={lookups} />
        ) : (
          <PanelTable variant={variant} series={series} lookups={lookups} timeRange={timeRange} />
        )}
      </CardContent>
    </Card>
  )
}

export function BankruptcySection({ enterpriseRows, sectorOptions }: { enterpriseRows: EnterpriseRow[]; sectorOptions: Option[] }) {
  const [geos, setGeos] = React.useState<string[]>([])
  const [sectors, setSectors] = React.useState<string[]>([])
  const [timeRange, setTimeRange] = React.useState<TimeRange>("yearly")
  const data = useBankruptcyData(["count", "workers", "rate", "age", "size"])

  const ctx = React.useMemo<Context | null>(
    () =>
      data.ready && data.lookups
        ? { lookups: data.lookups, monthly: data.monthly, breakdown: data.breakdown, geos, sectors, timeRange, enterpriseRows, sectorOptions }
        : null,
    [data.breakdown, data.lookups, data.monthly, data.ready, enterpriseRows, geos, sectors, sectorOptions, timeRange]
  )
  const series = React.useMemo(
    () =>
      ctx
        ? (Object.keys(VARIANTS) as BankruptcyVariant[]).reduce(
            (acc, variant) => ({ ...acc, [variant]: computeSeries(variant, ctx) }),
            {} as Record<BankruptcyVariant, ReturnType<typeof computeSeries>>
          )
        : null,
    [ctx]
  )

  const title = `Faillissementen${geos.length > 0 ? ` - ${describeGeos(geos)}` : ""}`
  const latest = data.lookups?.latestPeriod

  const panels = (view: "chart" | "table") =>
    series && data.lookups ? (
      <div className="space-y-4">
        {(Object.keys(VARIANTS) as BankruptcyVariant[]).map((variant) => (
          <PanelCard
            key={variant}
            variant={variant}
            series={series[variant]}
            lookups={data.lookups as BankruptcyLookups}
            view={view}
            geos={geos}
            sectors={sectors}
            sectorOptions={sectorOptions}
            timeRange={timeRange}
          />
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{data.error ?? "Faillissementscijfers laden..."}</p>
    )

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>

      <Tabs defaultValue="chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <GeoMultiFilter selected={geos} onChange={setGeos} />
            <SectorFilter selected={sectors} onChange={setSectors} options={sectorOptions} />
            <TimeRangeTabs value={timeRange} onChange={setTimeRange} />
          </div>
        </div>

        <div className="mb-4 space-y-2 text-sm text-muted-foreground">
          <p>
            Faillissementen en getroffen werknemers per maand{latest ? `, meest recent ${MONTH_NAMES_FULL[Number(latest.slice(5)) - 1]} ${latest.slice(0, 4)}` : ""}. De periodekeuze geldt voor de eerste twee grafieken; de overige grafieken zijn jaarcijfers.
            Brussel heeft geen provincies en staat enkel als gewest. De uitsplitsing naar sector gebruikt NACE 2008. Het aantal faillissementen per 1.000 ondernemingen deelt de faillissementen van een jaar door het aantal btw-plichtige ondernemingen in dat jaar (zie de sectie aantal ondernemingen).
          </p>
          {data.lookups && latestNote(data.lookups) ? <p>{latestNote(data.lookups)}</p> : null}
        </div>

        <TabsContent value="chart">{panels("chart")}</TabsContent>
        <TabsContent value="table">{panels("table")}</TabsContent>
      </Tabs>
    </div>
  )
}
