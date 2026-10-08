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
import { ExportButtons, FilterableChart, FilterableTable } from "@/components/ComparisonViews"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { cn } from "@embuild/shared/lib/utils"
import {
  MIGRATION_DIM_OPTIONS,
  MIGRATION_REGION_OPTIONS,
  MigrationData,
  MigrationDim,
  MigrationMatrix,
  MigrationSelection,
  buildMigrationMatrix,
  buildMigrationSeries,
  buildMigrationComparisonSeries,
  migrationCategoryLabels,
  migrationCategoryOptions,
  migrationFilterItems,
  migrationTitle,
  normalizeCounterparts,
  normalizeMigrationRegions,
} from "@/lib/migration"
import { joinList } from "@/lib/selection"
import { EmbedFilters } from "@/components/EmbedFilters"
import { MultiSelectInline } from "@/components/MultiSelectInline"

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

export type MigrationVariant = "flows" | "balance" | "matrix"

type Series = ReturnType<typeof buildMigrationSeries>
type FilterState = MigrationSelection

export function buildMigrationChartData(series: Series) {
  return series.map((point) => ({ ...point, label: String(point.year) }))
}

function filterText(items: Array<{ label: string; value: string }>) {
  return items.map((item) => `${item.label}: ${item.value}`).join("; ")
}

function flowSeries(isAll: boolean) {
  return isAll
    ? [{ key: "total", label: "Verhuizingen", color: CHART_SERIES_COLORS[0] }]
    : [
        { key: "inflow", label: "Instroom", color: CHART_SERIES_COLORS[0] },
        { key: "outflow", label: "Uitstroom", color: CHART_SERIES_COLORS[1] },
      ]
}

function FlowsChart({ series, isAll }: { series: Series; isAll: boolean }) {
  const chartData = React.useMemo(() => buildMigrationChartData(series), [series])
  return (
    <FilterableChart
      data={chartData}
      chartType="line"
      showMovingAverage={false}
      getLabel={(point) => (point as { label: string }).label}
      series={flowSeries(isAll)}
      yAxisLabelAbove="Aantal ondernemingen"
    />
  )
}

function BalanceChart({ series }: { series: Series }) {
  const chartData = React.useMemo(() => buildMigrationChartData(series).map((point) => ({ ...point, comparisons: point.balanceComparisons })), [series])
  return (
    <FilterableChart
      data={chartData}
      chartType="bar"
      showMovingAverage={false}
      getLabel={(point) => (point as { label: string }).label}
      getValue={(point) => (point as { net: number }).net}
      getSortValue={(point) => (point as { sortValue: number }).sortValue}
      yAxisLabelAbove="Saldo"
    />
  )
}

function MigrationTable({ series, isAll }: { series: Series; isAll: boolean }) {
  const rows = React.useMemo(
    () =>
      series.map((point) =>
        isAll
          ? { sortValue: point.sortValue, periodCells: [point.year], value: point.total, comparisons: point.tableComparisons }
          : {
              sortValue: point.sortValue,
              periodCells: [point.year, NUMBER_FORMAT.format(point.inflow), NUMBER_FORMAT.format(point.outflow)],
              value: SIGNED_FORMAT.format(point.net),
              comparisons: point.tableComparisons,
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

function MigrationMatrixTable({ matrix }: { matrix: MigrationMatrix }) {
  if (matrix.comparisons) {
    const comparisons = matrix.comparisons
    const origins = Array.from(new Map(comparisons.flatMap(({ matrix }) => matrix.rows.map((row) => [row.code, row.label] as const))).entries())
    return (
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Van \ naar</TableHead>
              {comparisons.flatMap(({ label }) => [...MIGRATION_REGION_OPTIONS.map((destination) =>
                <TableHead key={`${label}-${destination.code}`} className="text-right">{label} · {destination.label}</TableHead>
              ), <TableHead key={`${label}-outflow`} className="text-right">{label} · Uitstroom</TableHead>])}
            </TableRow>
          </TableHeader>
          <TableBody>
            {origins.map(([code, label]) => (
              <TableRow key={code}>
                <TableCell>{label}</TableCell>
                {comparisons.flatMap((comparison) => {
                  const row = comparison.matrix.rows.find((row) => row.code === code)
                  return [
                    ...MIGRATION_REGION_OPTIONS.map((destination) => <TableCell key={`${comparison.label}-${destination.code}`} className="text-right">
                      {code === destination.code ? "—" : NUMBER_FORMAT.format(row?.cells[destination.code] ?? 0)}
                    </TableCell>),
                    <TableCell key={`${comparison.label}-outflow`} className="text-right">{code === "0000" ? "—" : NUMBER_FORMAT.format(row?.outflow ?? 0)}</TableCell>,
                  ]
                })}
              </TableRow>
            ))}
            <TableRow>
              <TableCell>Instroom</TableCell>
              {comparisons.flatMap(({ label, matrix }) => [
                ...MIGRATION_REGION_OPTIONS.map((destination) => <TableCell key={`${label}-${destination.code}`} className="text-right">{NUMBER_FORMAT.format(matrix.inflow[destination.code] ?? 0)}</TableCell>),
                <TableCell key={`${label}-outflow`} />,
              ])}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }
  return (
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
        {matrix.rows.map((row) => (
          <TableRow key={row.code}>
            <TableCell>{row.label}</TableCell>
            {MIGRATION_REGION_OPTIONS.map((destination) => {
              const cell = row.cells[destination.code]
              return (
                <TableCell key={destination.code} className="text-right">
                  {cell === null ? "-" : NUMBER_FORMAT.format(cell)}
                </TableCell>
              )
            })}
            <TableCell className="text-right font-medium">{row.outflow === null ? "-" : NUMBER_FORMAT.format(row.outflow)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-medium">Instroom</TableCell>
          {MIGRATION_REGION_OPTIONS.map((destination) => (
            <TableCell key={destination.code} className="text-right font-medium">
              {NUMBER_FORMAT.format(matrix.inflow[destination.code] ?? 0)}
            </TableCell>
          ))}
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  )
}

/** CSV-rijen in lange vorm (van, naar, aantal): de diagonaal bestaat niet en kan dus niet als lege kolom mee. */
function matrixExportRows(matrix: MigrationMatrix): Array<{ label: string; value: number; periodCells: string[] }> {
  if (matrix.comparisons) {
    return matrix.comparisons.flatMap(({ label, matrix }) => matrixExportRows(matrix).map((row) => ({
      ...row, periodCells: [label, ...row.periodCells],
    })))
  }
  return matrix.rows.flatMap((row) =>
    MIGRATION_REGION_OPTIONS.filter((destination) => row.cells[destination.code] !== null).map((destination) => ({
      label: `${row.label} naar ${destination.label}`,
      value: row.cells[destination.code] ?? 0,
      periodCells: [row.label, destination.label],
    }))
  )
}

function seriesExportRows(series: Series, isAll: boolean, kind: "flows" | "balance") {
  if (isAll) return series.map((point) => ({ label: String(point.year), value: point.total, periodCells: [point.year], comparisons: point.tableComparisons }))
  if (kind === "balance") return series.map((point) => ({ label: String(point.year), value: point.net, periodCells: [point.year], comparisons: point.balanceComparisons }))
  return series.map((point) => ({ label: String(point.year), value: point.net, periodCells: [point.year, point.inflow, point.outflow], comparisons: point.tableComparisons }))
}

export function MigrationEmbed({
  data,
  viewType,
  variant = "flows",
  regions,
  counterparts,
  dim,
  categories,
  year,
}: FilterState & {
  data: MigrationData
  viewType: "chart" | "table"
  variant?: MigrationVariant
  year?: number | null
}) {
  const series = React.useMemo(
    () => buildMigrationComparisonSeries(data, { dim, categories, regions, counterparts }),
    [categories, counterparts, data, dim, regions]
  )
  const isAll = regions.length === 0
  const matrixYear = year && data.years.includes(year) ? year : data.latestYear
  const matrix = React.useMemo(() => buildMigrationMatrix(data, { dim, categories, year: matrixYear }), [categories, data, dim, matrixYear])
  const isMatrix = variant === "matrix"
  const filters = migrationFilterItems(data, { regions, counterparts, dim, categories, year: isMatrix ? matrixYear : null, omitRegion: isMatrix })
  const baseTitle = migrationTitle({ regions, counterparts })
  const title = variant === "balance" ? `Saldo - ${baseTitle}` : isMatrix ? `Herkomst en bestemming ${matrixYear}` : baseTitle

  let content: React.ReactNode
  if (isMatrix) {
    content = <MigrationMatrixTable matrix={matrix} />
  } else if (variant === "balance" && isAll) {
    content = <p className="text-sm text-muted-foreground">Het saldo is enkel beschikbaar voor een of meer gekozen gewesten.</p>
  } else if (viewType === "table") {
    content = <MigrationTable series={series} isAll={isAll} />
  } else {
    content = variant === "balance" ? <BalanceChart series={series} /> : <FlowsChart series={series} isAll={isAll} />
  }

  return (
    <div className="p-4">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <EmbedFilters items={filters} />
      {content}
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <span>Bron: Statbel</span>
      </div>
    </div>
  )
}

function CardTitleWithExport({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
      <CardTitle>{title}</CardTitle>
      {children}
    </CardHeader>
  )
}

function MigrationMatrixCard({
  data,
  filters,
  exportTitle,
}: {
  data: MigrationData
  filters: FilterState
  exportTitle: string
}) {
  const [year, setYear] = React.useState(String(data.latestYear))
  const yearOptions = React.useMemo(
    () => [...data.years].sort((a, b) => b - a).map((item) => ({ code: String(item), label: String(item) })),
    [data.years]
  )
  const matrix = React.useMemo(
    () => buildMigrationMatrix(data, { dim: filters.dim, categories: filters.categories, year: Number(year) }),
    [data, filters.categories, filters.dim, year]
  )
  const exportRows = React.useMemo(() => matrixExportRows(matrix), [matrix])
  const title = `Herkomst en bestemming ${year}`

  return (
    <Card>
      <CardTitleWithExport title="Herkomst en bestemming">
        <div className="flex items-center gap-2">
          <SelectInline value={year} onChange={setYear} options={yearOptions} className="min-w-[90px]" />
          <ExportButtons
            data={exportRows}
            title={`${title} (${exportTitle})`}
            slug="starters-stoppers"
            sectionId="migration-matrix"
            viewType="table"
            periodHeaders={matrix.comparisons ? ["Categorie", "Van", "Naar"] : ["Van", "Naar"]}
            valueLabel="Aantal ondernemingen"
            dataSource={SOURCE_TITLE}
            dataSourceUrl={data.sourceUrl}
            embedParams={{
              dim: filters.dim === "tot" ? null : filters.dim,
              category: joinList(filters.categories),
              year,
            }}
          />
        </div>
      </CardTitleWithExport>
      <CardContent>
        <MigrationMatrixTable matrix={matrix} />
      </CardContent>
    </Card>
  )
}

export function MigrationSection({ data }: { data: MigrationData }) {
  const [regions, setRegionsState] = React.useState<string[]>(["2000"])
  const [counterparts, setCounterparts] = React.useState<string[]>([])
  const [dim, setDim] = React.useState<MigrationDim>("tot")
  const [categories, setCategories] = React.useState<string[]>([])

  const series = React.useMemo(
    () => buildMigrationComparisonSeries(data, { dim, categories, regions, counterparts }),
    [categories, counterparts, data, dim, regions]
  )
  const isAll = regions.length === 0
  const dimOption = MIGRATION_DIM_OPTIONS.find((option) => option.code === dim) ?? MIGRATION_DIM_OPTIONS[0]
  const categoryOptions = React.useMemo(() => migrationCategoryOptions(data, dim), [data, dim])

  function setRegions(next: string[]) {
    const normalized = normalizeMigrationRegions(next)
    setRegionsState(normalized)
    setCounterparts((current) => normalizeCounterparts(current, normalized))
  }

  const counterpartOptions = MIGRATION_REGION_OPTIONS.filter((option) => !(regions.length === 1 && regions.includes(option.code)))
  const dimOptions: Option[] = MIGRATION_DIM_OPTIONS.map((option) => ({ code: option.code, label: option.label }))
  const categoryLabels = migrationCategoryLabels(data, dim, categories)
  const title = migrationTitle({ regions, counterparts }, dim === "tot" ? [] : categoryLabels)
  const filters: FilterState = { regions, counterparts, dim, categories }
  const exportTitle = filterText(migrationFilterItems(data, filters))
  const baseParams = {
    region: regions.length > 0 ? joinList(regions) : "all", // expliciet, anders zou een embed zonder gewest op een standaard terugvallen
    counterpart: joinList(counterparts),
    dim: dim === "tot" ? null : dim,
    category: joinList(categories),
  }

  const flowHeaders = isAll ? ["Jaar"] : ["Jaar", "Instroom", "Uitstroom"]
  const flowExport = React.useMemo(() => seriesExportRows(series, isAll, "flows"), [isAll, series])
  const balanceExport = React.useMemo(() => seriesExportRows(series, isAll, "balance"), [isAll, series])

  const flowButtons = (view: "chart" | "table") => (
    <ExportButtons
      data={flowExport}
      title={`${title} (${exportTitle})`}
      slug="starters-stoppers"
      sectionId="migration"
      viewType={view}
      periodHeaders={flowHeaders}
      valueLabel={isAll ? "Verhuizingen" : "Saldo"}
      dataSource={SOURCE_TITLE}
      dataSourceUrl={data.sourceUrl}
      embedParams={baseParams}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      <Tabs defaultValue="chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectInline
              groups={[{ heading: "Gewest", options: MIGRATION_REGION_OPTIONS }]}
              selected={regions}
              onChange={setRegions}
              allLabel="Alle gewesten"
              noun="gewesten"
            />
            {!isAll ? (
              <MultiSelectInline
                groups={[{ heading: "Tegenpartij", options: counterpartOptions }]}
                selected={counterparts}
                onChange={(next) => setCounterparts(normalizeCounterparts(next, regions))}
                allLabel="Alle andere gewesten"
                noun="gewesten"
              />
            ) : null}
            <SelectInline
              value={dim}
              onChange={(value) => {
                setDim(value as MigrationDim)
                setCategories([])
              }}
              options={dimOptions}
            />
            {dim !== "tot" ? (
              <MultiSelectInline
                groups={[{ heading: dimOption.label, options: categoryOptions }]}
                selected={categories}
                onChange={setCategories}
                allLabel={dimOption.allLabel}
                noun={dimOption.noun}
                searchable
              />
            ) : null}
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Aantal btw-plichtige ondernemingen waarvan de maatschappelijke zetel van het ene gewest naar het andere verhuisde, per jaar vanaf {data.years[0]} tot en met {data.latestYear}.
          Verhuizingen binnen een gewest zijn niet inbegrepen. Elk gekozen gewest, elke tegenpartij en elke categorie worden afzonderlijk vergeleken; instroom en uitstroom worden per gewest berekend, niet over de grens van een opgetelde groep. De uitsplitsingen naar werknemersklasse, sector en rechtsvorm zijn aparte Statbel-tabellen en kunnen dus niet gecombineerd worden.
        </p>

        <TabsContent value="chart">
          <div className="space-y-4">
            <Card>
              <CardTitleWithExport title={isAll ? "Verhuizingen tussen gewesten" : "Instroom en uitstroom"}>{flowButtons("chart")}</CardTitleWithExport>
              <CardContent>
                <FlowsChart series={series} isAll={isAll} />
              </CardContent>
            </Card>

            {!isAll ? (
              <Card>
                <CardTitleWithExport title="Saldo (instroom min uitstroom)">
                  <ExportButtons
                    data={balanceExport}
                    title={`Saldo - ${title} (${exportTitle})`}
                    slug="starters-stoppers"
                    sectionId="migration-balance"
                    viewType="chart"
                    periodHeaders={["Jaar"]}
                    valueLabel="Saldo"
                    dataSource={SOURCE_TITLE}
                    dataSourceUrl={data.sourceUrl}
                    embedParams={baseParams}
                  />
                </CardTitleWithExport>
                <CardContent>
                  <BalanceChart series={series} />
                </CardContent>
              </Card>
            ) : null}

            <MigrationMatrixCard data={data} filters={filters} exportTitle={exportTitle} />
          </div>
        </TabsContent>

        <TabsContent value="table">
          <div className="space-y-4">
            <Card>
              <CardTitleWithExport title="Data">{flowButtons("table")}</CardTitleWithExport>
              <CardContent>
                <MigrationTable series={series} isAll={isAll} />
              </CardContent>
            </Card>
            <MigrationMatrixCard data={data} filters={filters} exportTitle={exportTitle} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
