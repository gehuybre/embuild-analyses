"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { cn } from "@embuild/shared/lib/utils"
import {
  MIGRATION_ALL,
  MIGRATION_DIM_OPTIONS,
  MIGRATION_REGION_OPTIONS,
  MigrationData,
  MigrationDim,
  buildMigrationSeries,
  migrationCategoryOptions,
  migrationRegionLabel,
  migrationTitle,
} from "@/lib/migration"

const SOURCE_TITLE = "Statbel - Migratie van btw-plichtige ondernemingen"
const NUMBER_FORMAT = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 })
const SIGNED_FORMAT = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0, signDisplay: "exceptZero" })

type Option = { code: string; label: string }

function SelectInline({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  searchable?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const current = options.find((option) => option.code === value)?.label ?? placeholder ?? value

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className={cn("h-9 gap-1 min-w-[130px]", className)}>
          <span className="truncate max-w-[170px]">{current}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={searchable ? "w-[340px] p-0" : "w-[240px] p-0"} align="start">
        <Command>
          {searchable ? <CommandInput placeholder="Zoeken..." /> : null}
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.code}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option.code ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function useMigrationState(data: MigrationData, initial?: Partial<{ region: string; counterpart: string | null; dim: MigrationDim; category: string | null }>) {
  const [region, setRegion] = React.useState(initial?.region ?? "2000")
  const [counterpart, setCounterpart] = React.useState<string | null>(initial?.counterpart ?? null)
  const [dim, setDim] = React.useState<MigrationDim>(initial?.dim ?? "tot")
  const [category, setCategory] = React.useState<string | null>(initial?.category ?? null)

  const series = React.useMemo(
    () => buildMigrationSeries(data, { dim, category, region, counterpart }),
    [category, counterpart, data, dim, region]
  )

  return { region, setRegion, counterpart, setCounterpart, dim, setDim, category, setCategory, series }
}

export function buildMigrationChartData(series: ReturnType<typeof buildMigrationSeries>) {
  return series.map((point) => ({ ...point, label: String(point.year) }))
}

export function MigrationEmbed({
  data,
  viewType,
  region,
  counterpart,
  dim,
  category,
}: {
  data: MigrationData
  viewType: "chart" | "table"
  region: string
  counterpart: string | null
  dim: MigrationDim
  category: string | null
}) {
  const series = React.useMemo(
    () => buildMigrationSeries(data, { dim, category, region, counterpart }),
    [category, counterpart, data, dim, region]
  )
  const chartData = React.useMemo(() => buildMigrationChartData(series), [series])
  const isAll = region === MIGRATION_ALL
  const categoryLabel = category ? migrationCategoryOptions(data, dim).find((option) => option.code === category)?.label ?? null : null

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold">{migrationTitle(region, counterpart, categoryLabel)}</h2>
      {viewType === "chart" ? (
        <FilterableChart
          data={chartData}
          chartType="line"
          showMovingAverage={false}
          getLabel={(point) => (point as { label: string }).label}
          series={
            isAll
              ? [{ key: "total", label: "Verhuizingen", color: CHART_SERIES_COLORS[0] }]
              : [
                  { key: "inflow", label: "Instroom", color: CHART_SERIES_COLORS[0] },
                  { key: "outflow", label: "Uitstroom", color: CHART_SERIES_COLORS[1] },
                ]
          }
          yAxisLabelAbove="Aantal ondernemingen"
        />
      ) : (
        <MigrationTable series={series} isAll={isAll} />
      )}
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}

function MigrationTable({ series, isAll }: { series: ReturnType<typeof buildMigrationSeries>; isAll: boolean }) {
  const rows = React.useMemo(
    () =>
      series.map((point) =>
        isAll
          ? { sortValue: point.sortValue, periodCells: [point.year], value: point.total }
          : {
              sortValue: point.sortValue,
              periodCells: [point.year, NUMBER_FORMAT.format(point.inflow), NUMBER_FORMAT.format(point.outflow)],
              value: SIGNED_FORMAT.format(point.net),
            }
      ),
    [isAll, series]
  )

  return (
    <FilterableTable
      data={rows}
      label={isAll ? "Verhuizingen" : "Saldo"}
      periodHeaders={isAll ? ["Jaar"] : ["Jaar", "Instroom", "Uitstroom"]}
    />
  )
}

function OriginDestinationCard({
  data,
  dim,
  category,
}: {
  data: MigrationData
  dim: MigrationDim
  category: string | null
}) {
  const [year, setYear] = React.useState(String(data.latestYear))
  const yearOptions = React.useMemo(
    () => [...data.years].sort((a, b) => b - a).map((item) => ({ code: String(item), label: String(item) })),
    [data.years]
  )

  const matrix = React.useMemo(() => {
    const activeDim = dim === "tot" || !category ? "tot" : dim
    const result = new Map<string, number>()
    for (const record of data.records) {
      if (record.y !== Number(year) || record.dim !== activeDim) continue
      if (activeDim !== "tot" && record.k !== category) continue
      result.set(`${record.o}|${record.d}`, (result.get(`${record.o}|${record.d}`) ?? 0) + record.n)
    }
    return result
  }, [category, data.records, dim, year])

  const origins = [...MIGRATION_REGION_OPTIONS.map((option) => option.code), "0000"]
  const originLabel = (code: string) => (code === "0000" ? "Onbekend" : migrationRegionLabel(code))
  const value = (origin: string, destination: string) => (origin === destination ? null : matrix.get(`${origin}|${destination}`) ?? 0)
  const rowTotal = (origin: string) => MIGRATION_REGION_OPTIONS.reduce((sum, option) => sum + (value(origin, option.code) ?? 0), 0)
  const columnTotal = (destination: string) => origins.reduce((sum, origin) => sum + (value(origin, destination) ?? 0), 0)
  const visibleOrigins = origins.filter((origin) => origin !== "0000" || rowTotal(origin) > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Herkomst en bestemming</CardTitle>
        <SelectInline value={year} onChange={setYear} options={yearOptions} className="min-w-[90px]" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Van \ naar</TableHead>
              {MIGRATION_REGION_OPTIONS.map((option) => (
                <TableHead key={option.code} className="text-right">
                  {option.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Uitstroom</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOrigins.map((origin) => (
              <TableRow key={origin}>
                <TableCell>{originLabel(origin)}</TableCell>
                {MIGRATION_REGION_OPTIONS.map((destination) => {
                  const cell = value(origin, destination.code)
                  return (
                    <TableCell key={destination.code} className="text-right">
                      {cell === null ? "-" : NUMBER_FORMAT.format(cell)}
                    </TableCell>
                  )
                })}
                <TableCell className="text-right font-medium">{origin === "0000" ? "-" : NUMBER_FORMAT.format(rowTotal(origin))}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">Instroom</TableCell>
              {MIGRATION_REGION_OPTIONS.map((destination) => (
                <TableCell key={destination.code} className="text-right font-medium">
                  {NUMBER_FORMAT.format(columnTotal(destination.code))}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function MigrationSection({ data }: { data: MigrationData }) {
  const { region, setRegion, counterpart, setCounterpart, dim, setDim, category, setCategory, series } = useMigrationState(data)
  const [currentView, setCurrentView] = React.useState<"chart" | "table">("chart")

  const isAll = region === MIGRATION_ALL
  const chartData = React.useMemo(() => buildMigrationChartData(series), [series])
  const dimOption = MIGRATION_DIM_OPTIONS.find((option) => option.code === dim) ?? MIGRATION_DIM_OPTIONS[0]
  const categoryOptions = React.useMemo(() => migrationCategoryOptions(data, dim), [data, dim])

  const regionOptions: Option[] = [
    { code: MIGRATION_ALL, label: "Alle gewesten" },
    ...MIGRATION_REGION_OPTIONS.map((option) => ({ code: option.code, label: option.label })),
  ]
  const counterpartOptions: Option[] = [
    { code: "", label: "Alle andere gewesten" },
    ...MIGRATION_REGION_OPTIONS.filter((option) => option.code !== region).map((option) => ({ code: option.code, label: option.label })),
  ]
  const dimOptions: Option[] = MIGRATION_DIM_OPTIONS.map((option) => ({ code: option.code, label: option.label }))
  const categoryChoices: Option[] = [{ code: "", label: dimOption.allLabel }, ...categoryOptions]
  const categoryLabel = category ? categoryOptions.find((option) => option.code === category)?.label ?? null : null
  const title = migrationTitle(region, counterpart, categoryLabel)

  const exportData = React.useMemo(
    () =>
      series.map((point) =>
        isAll
          ? { label: String(point.year), value: point.total, periodCells: [point.year] }
          : { label: String(point.year), value: point.net, periodCells: [point.year, point.inflow, point.outflow] }
      ),
    [isAll, series]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        <ExportButtons
          data={exportData}
          title={title}
          slug="starters-stoppers"
          sectionId="migration"
          viewType={currentView}
          periodHeaders={isAll ? ["Jaar"] : ["Jaar", "Instroom", "Uitstroom"]}
          valueLabel={isAll ? "Verhuizingen" : "Saldo"}
          dataSource={SOURCE_TITLE}
          dataSourceUrl={data.sourceUrl}
          embedParams={{
            region,
            counterpart,
            dim: dim === "tot" ? null : dim,
            category,
          }}
        />
      </div>

      <Tabs defaultValue="chart" onValueChange={(value) => setCurrentView(value as "chart" | "table")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <SelectInline
              value={region}
              onChange={(value) => {
                setRegion(value)
                setCounterpart(null)
              }}
              options={regionOptions}
            />
            {!isAll ? (
              <SelectInline value={counterpart ?? ""} onChange={(value) => setCounterpart(value || null)} options={counterpartOptions} />
            ) : null}
            <SelectInline
              value={dim}
              onChange={(value) => {
                setDim(value as MigrationDim)
                setCategory(null)
              }}
              options={dimOptions}
            />
            {dim !== "tot" ? (
              <SelectInline value={category ?? ""} onChange={(value) => setCategory(value || null)} options={categoryChoices} searchable />
            ) : null}
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Aantal btw-plichtige ondernemingen waarvan de maatschappelijke zetel van het ene gewest naar het andere verhuisde, per jaar vanaf {data.years[0]} tot en met {data.latestYear}.
          Verhuizingen binnen een gewest zijn niet inbegrepen. De uitsplitsingen naar werknemersklasse, sector en rechtsvorm zijn aparte Statbel-tabellen en kunnen dus niet gecombineerd worden.
        </p>

        <TabsContent value="chart">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{isAll ? "Verhuizingen tussen gewesten" : "Instroom en uitstroom"}</CardTitle>
              </CardHeader>
              <CardContent>
                <FilterableChart
                  data={chartData}
                  chartType="line"
                  showMovingAverage={false}
                  getLabel={(point) => (point as { label: string }).label}
                  series={
                    isAll
                      ? [{ key: "total", label: "Verhuizingen", color: CHART_SERIES_COLORS[0] }]
                      : [
                          { key: "inflow", label: "Instroom", color: CHART_SERIES_COLORS[0] },
                          { key: "outflow", label: "Uitstroom", color: CHART_SERIES_COLORS[1] },
                        ]
                  }
                  yAxisLabelAbove="Aantal ondernemingen"
                />
              </CardContent>
            </Card>

            {!isAll ? (
              <Card>
                <CardHeader>
                  <CardTitle>Saldo (instroom min uitstroom)</CardTitle>
                </CardHeader>
                <CardContent>
                  <FilterableChart
                    data={chartData}
                    chartType="bar"
                    showMovingAverage={false}
                    getLabel={(point) => (point as { label: string }).label}
                    getValue={(point) => (point as { net: number }).net}
                    getSortValue={(point) => (point as { sortValue: number }).sortValue}
                    yAxisLabelAbove="Saldo"
                  />
                </CardContent>
              </Card>
            ) : null}

            <OriginDestinationCard data={data} dim={dim} category={category} />
          </div>
        </TabsContent>

        <TabsContent value="table">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data</CardTitle>
              </CardHeader>
              <CardContent>
                <MigrationTable series={series} isAll={isAll} />
              </CardContent>
            </Card>
            <OriginDestinationCard data={data} dim={dim} category={category} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
