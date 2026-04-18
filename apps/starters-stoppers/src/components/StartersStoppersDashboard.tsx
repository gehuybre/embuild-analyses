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
  CommandSeparator,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { GeoProvider, useGeo } from "@embuild/shared/components/shared/GeoContext"
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "@embuild/shared/lib/geo-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { cn } from "@embuild/shared/lib/utils"

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
  g: RegionCode
}

type MonthlyLookups = {
  sectors: Array<{ code: string; nl: string }>
  years: number[]
  latestPeriod: string
}

type MonthlySummary = {
  latestPeriod: string
  monthlyMinYear: number
  monthlyMaxYear: number
  yearlyMinYear: number
  yearlyMaxYear: number
  notes?: string[]
}

type AnnualFlowRow = {
  y: number
  g: RegionCode
  n1: string
  fr: number
  st: number
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

type TimeRange = "yearly" | "quarterly" | "monthly"
type StopHorizon = 1 | 2 | 3 | 4 | 5
type SurvivalKey = "s1" | "s2" | "s3" | "s4" | "s5"

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  label: string
}

const MONTH_NAMES_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const MONTH_NAMES_FULL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
const ANNUAL_SOURCE_URL = "https://statbel.fgov.be/nl/cijfers/evolutie-van-het-aantal-oprichtingen-en-stopzettingen-van-btw-plichtige-ondernemingen-0"
const MONTHLY_SOURCE_URL = "https://statbel.fgov.be/nl/themas/ondernemingen/btw-plichtige-ondernemingen/maandevolutie-van-de-btw-plichtige-ondernemingen"
const MONTHLY_REGION_OPTIONS: Array<{ code: RegionCode; label: string }> = [
  { code: "1000", label: "België" },
  { code: "2000", label: "Vlaanderen" },
  { code: "3000", label: "Wallonië" },
  { code: "4000", label: "Brussel" },
]

function formatInt(value: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(value)
}

function formatPct(value: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(value) + "%"
}

function formatLatestPeriod(period: string | undefined) {
  if (!period) return null
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return period
  return `${MONTH_NAMES_FULL[Number(match[2]) - 1]} ${match[1]}`
}

function buildMonthlySectorOptions(lookups: MonthlyLookups | null) {
  const items = (lookups?.sectors ?? []).map((sector) => ({
    code: sector.code,
    label: `${sector.code} — ${sector.nl}`,
  }))
  items.sort((a, b) => a.label.localeCompare(b.label, "nl"))
  return items
}

function buildSurvivalSectorOptions(lookupsData: any | null) {
  const items: Array<{ code: string; label: string }> =
    lookupsData?.nace_lvl1?.map((row: any) => ({
      code: String(row.code),
      label: `${String(row.code)} — ${row.nl ?? row.en ?? ""}`.trim(),
    })) ?? []
  items.sort((a, b) => a.label.localeCompare(b.label, "nl"))
  return items
}

function filterMonthlyRows(rows: MonthlyFlowRow[], selectedSector: string | null) {
  const code = selectedSector ?? "ALL"
  return rows.filter((row) => row.n1 === code)
}

function filterRegionalMonthlyRows(rows: RegionalMonthlyFlowRow[], selectedSector: string | null, selectedRegion: RegionCode) {
  const code = selectedSector ?? "ALL"
  return rows.filter((row) => row.g === selectedRegion && row.n1 === code)
}

function filterAnnualRows(rows: AnnualFlowRow[], selectedSector: string | null, selectedRegion: RegionCode) {
  const code = selectedSector ?? "ALL"
  return rows.filter((row) => row.g === selectedRegion && row.n1 === code)
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

function mergeChartSeries(...seriesGroups: ChartPoint[][]) {
  const merged = new Map<number, ChartPoint>()
  for (const series of seriesGroups) {
    for (const point of series) {
      merged.set(point.sortValue, point)
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.sortValue - b.sortValue)
}

function formatMonthlyRegionLabel(regionCode: RegionCode) {
  return MONTHLY_REGION_OPTIONS.find((option) => option.code === regionCode)?.label ?? "België"
}

function survivalKeyForHorizon(horizon: StopHorizon): SurvivalKey {
  return `s${horizon}` as SurvivalKey
}

function filterSurvivalRowsByGeo(rows: VatSurvivalRow[], level: string, selectedRegion: RegionCode, selectedProvince: ProvinceCode | null) {
  if (level === "province" && selectedProvince) {
    return rows.filter((row) => row.p && String(row.p) === String(selectedProvince))
  }
  if (level === "region" && selectedRegion !== "1000") {
    return rows.filter((row) => row.r && String(row.r) === String(selectedRegion))
  }
  return rows
}

function filterSurvivalRowsBySector(rows: VatSurvivalRow[], nace1: string | null) {
  if (!nace1) return rows
  return rows.filter((row) => row.n1 === nace1)
}

function aggregateSurvivalRateByYear(rows: VatSurvivalRow[], key: SurvivalKey): ChartPoint[] {
  const grouped = new Map<number, { fr: number; surv: number }>()

  for (const row of rows) {
    const survived = (row as Record<string, unknown>)[key] as number | null
    if (typeof row.y !== "number" || typeof row.fr !== "number" || typeof survived !== "number") {
      continue
    }

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

function TimeRangeTabs({
  value,
  onChange,
}: {
  value: TimeRange
  onChange: (value: TimeRange) => void
}) {
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

function RegionFilterInline({
  selected,
  onChange,
}: {
  selected: RegionCode
  onChange: (value: RegionCode) => void
}) {
  const [open, setOpen] = React.useState(false)
  const currentLabel = React.useMemo(() => formatMonthlyRegionLabel(selected), [selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[130px]">
          <span className="truncate max-w-[110px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup heading="Gewest">
              {MONTHLY_REGION_OPTIONS.map((option) => (
                <CommandItem
                  key={option.code}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === option.code ? "opacity-100" : "opacity-0")} />
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

function GeoFilterInline({
  selectedRegion,
  selectedProvince,
  onSelectRegion,
  onSelectProvince,
}: {
  selectedRegion: RegionCode
  selectedProvince: ProvinceCode | null
  onSelectRegion: (code: RegionCode) => void
  onSelectProvince: (code: ProvinceCode | null) => void
}) {
  const [open, setOpen] = React.useState(false)

  const currentLabel = React.useMemo(() => {
    if (selectedProvince) {
      return PROVINCES.find((province) => String(province.code) === String(selectedProvince))?.name ?? "Provincie"
    }
    if (selectedRegion !== "1000") {
      return REGIONS.find((region) => region.code === selectedRegion)?.name ?? "Regio"
    }
    return "België"
  }, [selectedProvince, selectedRegion])

  const sortedProvinces = React.useMemo(
    () => [...PROVINCES].sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  function selectBelgium() {
    onSelectRegion("1000")
    onSelectProvince(null)
    setOpen(false)
  }

  function selectRegion(code: RegionCode) {
    onSelectRegion(code)
    onSelectProvince(null)
    setOpen(false)
  }

  function selectProvince(code: ProvinceCode) {
    onSelectProvince(code)
    const province = PROVINCES.find((item) => String(item.code) === String(code))
    if (province) onSelectRegion(province.regionCode)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek locatie..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Land">
              <CommandItem value="België" onSelect={selectBelgium}>
                <Check className={cn("mr-2 h-4 w-4", selectedRegion === "1000" && !selectedProvince ? "opacity-100" : "opacity-0")} />
                België
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Regio">
              {REGIONS.filter((region) => region.code !== "1000").map((region) => (
                <CommandItem key={region.code} value={region.name} onSelect={() => selectRegion(region.code)}>
                  <Check className={cn("mr-2 h-4 w-4", !selectedProvince && selectedRegion === region.code ? "opacity-100" : "opacity-0")} />
                  {region.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Provincie">
              {sortedProvinces.map((province) => (
                <CommandItem key={province.code} value={province.name} onSelect={() => selectProvince(province.code)}>
                  <Check className={cn("mr-2 h-4 w-4", String(selectedProvince) === String(province.code) ? "opacity-100" : "opacity-0")} />
                  {province.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function SectorFilterInline({
  selected,
  onChange,
  options,
}: {
  selected: string | null
  onChange: (value: string | null) => void
  options: Array<{ code: string; label: string }>
}) {
  const [open, setOpen] = React.useState(false)

  const currentLabel = React.useMemo(() => {
    if (!selected) return "Alle sectoren"
    return options.find((option) => option.code === selected)?.label ?? selected
  }, [options, selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[150px]">
          <span className="truncate max-w-[150px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek sector..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Sector">
              <CommandItem
                value="Alle sectoren"
                onSelect={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !selected ? "opacity-100" : "opacity-0")} />
                Alle sectoren
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="NACE">
              {options.map((option) => (
                <CommandItem
                  key={option.code}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === option.code ? "opacity-100" : "opacity-0")} />
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

function MonthlyMetricSection({
  title,
  label,
  data,
  timeRange,
  onTimeRangeChange,
  selectedRegion,
  onSelectRegion,
  selectedSector,
  onSelectSector,
  sectorOptions,
  coverageNote,
  slug,
  sectionId,
}: {
  title: string
  label: string
  data: ChartPoint[]
  timeRange: TimeRange
  onTimeRangeChange: (value: TimeRange) => void
  selectedRegion: RegionCode
  onSelectRegion: (value: RegionCode) => void
  selectedSector: string | null
  onSelectSector: (value: string | null) => void
  sectorOptions: Array<{ code: string; label: string }>
  coverageNote: string
  slug: string
  sectionId: string
}) {
  const [currentView, setCurrentView] = React.useState<"chart" | "table">("chart")
  const locationLabel = React.useMemo(() => formatMonthlyRegionLabel(selectedRegion), [selectedRegion])
  const exportTitle = title + (selectedRegion !== "1000" ? ` - ${locationLabel}` : "")
  const periodHeader = timeRange === "yearly" ? "Jaar" : "Periode"
  const exportSource = timeRange === "yearly"
    ? {
        title: "Statbel - Jaarlijkse evolutie van de btw-plichtige ondernemingen",
        url: ANNUAL_SOURCE_URL,
      }
    : {
        title: "Statbel - Maandevolutie van de btw-plichtige ondernemingen",
        url: MONTHLY_SOURCE_URL,
      }

  const exportData = React.useMemo(
    () => data.map((point) => ({ label: point.label, value: point.value, periodCells: point.periodCells })),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{exportTitle}</h2>
        <ExportButtons
          data={exportData}
          title={exportTitle}
          slug={slug}
          sectionId={sectionId}
          viewType={currentView}
          periodHeaders={[periodHeader]}
          valueLabel={label}
          dataSource={exportSource.title}
          dataSourceUrl={exportSource.url}
          embedParams={{
            timeRange,
            region: selectedRegion !== "1000" ? selectedRegion : null,
            sector: selectedSector,
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
            <RegionFilterInline selected={selectedRegion} onChange={onSelectRegion} />
            <SectorFilterInline selected={selectedSector} onChange={onSelectSector} options={sectorOptions} />
            <TimeRangeTabs value={timeRange} onChange={onTimeRangeChange} />
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">{coverageNote}</p>

        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Evolutie</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableChart
                data={data}
                getLabel={(point) => (point as ChartPoint).label}
                getValue={(point) => (point as ChartPoint).value}
                getSortValue={(point) => (point as ChartPoint).sortValue}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Data</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableTable data={data} label={label} periodHeaders={[periodHeader]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SurvivalSection({
  data,
  selectedRegion,
  selectedProvince,
  onSelectRegion,
  onSelectProvince,
  selectedSector,
  onSelectSector,
  sectorOptions,
  stopHorizon,
  onStopHorizonChange,
}: {
  data: ChartPoint[]
  selectedRegion: RegionCode
  selectedProvince: ProvinceCode | null
  onSelectRegion: (value: RegionCode) => void
  onSelectProvince: (value: ProvinceCode | null) => void
  selectedSector: string | null
  onSelectSector: (value: string | null) => void
  sectorOptions: Array<{ code: string; label: string }>
  stopHorizon: StopHorizon
  onStopHorizonChange: (value: StopHorizon) => void
}) {
  const [currentView, setCurrentView] = React.useState<"chart" | "table">("chart")

  const exportData = React.useMemo(
    () => data.map((point) => ({ label: point.label, value: point.value, periodCells: point.periodCells })),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{`Overlevingskans na ${stopHorizon} jaar`}</h2>
        <ExportButtons
          data={exportData}
          title={`Overlevingskans na ${stopHorizon} jaar`}
          slug="starters-stoppers"
          sectionId="survival"
          viewType={currentView}
          periodHeaders={["Jaar"]}
          valueLabel="Overlevingskans"
          dataSource="Statbel - Overlevingsgraad van btw-plichtigen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/overlevingsgraad-van-btw-plichtigen"
          embedParams={{
            horizon: stopHorizon,
            region: selectedRegion !== "1000" ? selectedRegion : null,
            province: selectedProvince,
            sector: selectedSector,
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
            <GeoFilterInline
              selectedRegion={selectedRegion}
              selectedProvince={selectedProvince}
              onSelectRegion={onSelectRegion}
              onSelectProvince={onSelectProvince}
            />
            <SectorFilterInline selected={selectedSector} onChange={onSelectSector} options={sectorOptions} />
            <Tabs value={String(stopHorizon)} onValueChange={(value) => onStopHorizonChange(Number(value) as StopHorizon)}>
              <TabsList className="h-9">
                <TabsTrigger value="1" className="text-xs px-2">1j</TabsTrigger>
                <TabsTrigger value="2" className="text-xs px-2">2j</TabsTrigger>
                <TabsTrigger value="3" className="text-xs px-2">3j</TabsTrigger>
                <TabsTrigger value="4" className="text-xs px-2">4j</TabsTrigger>
                <TabsTrigger value="5" className="text-xs px-2">5j</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Evolutie</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableChart
                data={data}
                getLabel={(point) => (point as ChartPoint).label}
                getValue={(point) => (point as ChartPoint).value}
                getSortValue={(point) => (point as ChartPoint).sortValue}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Data</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableTable data={data} label="Overlevingskans" periodHeaders={["Jaar"]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InnerDashboard() {
  const { selectedRegion, setSelectedRegion, selectedProvince, setSelectedProvince, setSelectedMunicipality, setLevel } = useGeo()
  const [monthlyRegion, setMonthlyRegion] = React.useState<RegionCode>("1000")
  const [monthlySector, setMonthlySector] = React.useState<string | null>(null)
  const [monthlyTimeRange, setMonthlyTimeRange] = React.useState<TimeRange>("yearly")
  const [survivalSector, setSurvivalSector] = React.useState<string | null>(null)
  const [stopHorizon, setStopHorizon] = React.useState<StopHorizon>(1)

  const { data: bundle, loading, error } = useJsonBundle<{
    monthlyRaw: MonthlyFlowRow[]
    monthlyRegionalRaw: RegionalMonthlyFlowRow[]
    monthlyLookups: MonthlyLookups
    monthlySummary: MonthlySummary
    yearlyRaw: AnnualFlowRow[]
    survivalRaw: VatSurvivalRow[]
    survivalLookups: any
  }>({
    monthlyRaw: "/data/vat_monthly_flows.json",
    monthlyRegionalRaw: "/data/vat_monthly_flows_regions.json",
    monthlyLookups: "/data/vat_monthly_lookups.json",
    monthlySummary: "/data/summary.json",
    yearlyRaw: "/data/vat_yearly_flows.json",
    survivalRaw: "/data/vat_survivals.json",
    survivalLookups: "/data/lookups.json",
  })

  const monthlyRows = React.useMemo(() => bundle?.monthlyRaw ?? [], [bundle])
  const monthlyRegionalRows = React.useMemo(() => bundle?.monthlyRegionalRaw ?? [], [bundle])
  const yearlyRows = React.useMemo(() => bundle?.yearlyRaw ?? [], [bundle])
  const survivalRows = React.useMemo(() => bundle?.survivalRaw ?? [], [bundle])
  const monthlySectorOptions = React.useMemo(() => buildMonthlySectorOptions(bundle?.monthlyLookups ?? null), [bundle])
  const survivalSectorOptions = React.useMemo(() => buildSurvivalSectorOptions(bundle?.survivalLookups ?? null), [bundle])
  const latestMonthlyLabel = React.useMemo(() => formatLatestPeriod(bundle?.monthlySummary?.latestPeriod), [bundle])

  const filteredMonthlyRows = React.useMemo(() => {
    if (monthlyRegion === "1000") {
      return filterMonthlyRows(monthlyRows, monthlySector)
    }
    return filterRegionalMonthlyRows(monthlyRegionalRows, monthlySector, monthlyRegion)
  }, [monthlyRegion, monthlyRegionalRows, monthlyRows, monthlySector])

  const filteredYearlyRows = React.useMemo(
    () => filterAnnualRows(yearlyRows, monthlySector, monthlyRegion),
    [monthlyRegion, monthlySector, yearlyRows]
  )

  const startersSeries = React.useMemo(
    () =>
      monthlyTimeRange === "yearly"
        ? aggregateAnnualMetric(filteredYearlyRows, "fr")
        : aggregateMonthlyMetric(filteredMonthlyRows, "fr", monthlyTimeRange),
    [filteredMonthlyRows, filteredYearlyRows, monthlyTimeRange]
  )

  const stoppersSeries = React.useMemo(
    () =>
      monthlyTimeRange === "yearly"
        ? aggregateAnnualMetric(filteredYearlyRows, "st")
        : aggregateMonthlyMetric(filteredMonthlyRows, "st", monthlyTimeRange),
    [filteredMonthlyRows, filteredYearlyRows, monthlyTimeRange]
  )

  const monthlyCoverageNote = React.useMemo(() => {
    const monthlyMinYear = bundle?.monthlySummary?.monthlyMinYear ?? 2019
    const yearlyMinYear = bundle?.monthlySummary?.yearlyMinYear ?? 2008
    const yearlyMaxYear = bundle?.monthlySummary?.yearlyMaxYear ?? yearlyMinYear

    if (monthlyTimeRange === "yearly") {
      return `Jaarcijfers per sector en gewest lopen van ${yearlyMinYear} tot en met ${yearlyMaxYear}. Deze jaarlijkse starters en stoppers zijn Statbel-jaarfoto's op 31 december en verschillen dus van de som van maandcijfers.`
    }

    return `Kwartaal- en maanddata starten in ${monthlyMinYear}. Voor die fijnere uitsplitsing gebruikt de app de maandelijkse Statbel-reeks.`
  }, [bundle, monthlyTimeRange])

  const filteredSurvivalRows = React.useMemo(() => {
    const bySector = filterSurvivalRowsBySector(survivalRows, survivalSector)
    return filterSurvivalRowsByGeo(bySector, selectedProvince ? "province" : "region", selectedRegion, selectedProvince)
  }, [selectedProvince, selectedRegion, survivalRows, survivalSector])

  const survivalSeries = React.useMemo(
    () => aggregateSurvivalRateByYear(filteredSurvivalRows, survivalKeyForHorizon(stopHorizon)),
    [filteredSurvivalRows, stopHorizon]
  )

  function selectRegion(code: RegionCode) {
    setSelectedRegion(code)
    setSelectedProvince(null)
    setSelectedMunicipality(null)
    setLevel("region")
  }

  function selectProvince(code: ProvinceCode | null) {
    if (code === null) {
      setSelectedProvince(null)
      setSelectedMunicipality(null)
      setLevel("region")
      return
    }

    setSelectedProvince(code)
    setSelectedMunicipality(null)
    const province = PROVINCES.find((item) => String(item.code) === String(code))
    if (province) setSelectedRegion(province.regionCode)
    setLevel("province")
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          De secties <strong>starters</strong> en <strong>stoppers</strong> combineren nu twee Statbel-reeksen: een jaarlijkse reeks per sector en gewest vanaf 2008, en een maandelijkse reeks vanaf 2019.
          Meest recente maand: {latestMonthlyLabel ?? "onbekend"}. Per sectie kun je wisselen tussen België en gewest, en tussen jaar-, kwartaal- of maandniveau.
        </p>
        <p className="mt-2">
          De jaarreeks loopt momenteel tot en met {bundle.monthlySummary.yearlyMaxYear}. Voor 2019-2020 gebruikt Statbel in de maandreeks een DataLab-bron op T+30; vanaf 2021 is dit de offici&euml;le maandreeks op T+45. De overlevingskans hieronder blijft de jaarlijkse survivalreeks.
        </p>
      </div>

      <MonthlyMetricSection
        title="Aantal starters"
        label="Aantal"
        data={startersSeries}
        timeRange={monthlyTimeRange}
        onTimeRangeChange={setMonthlyTimeRange}
        selectedRegion={monthlyRegion}
        onSelectRegion={setMonthlyRegion}
        selectedSector={monthlySector}
        onSelectSector={setMonthlySector}
        sectorOptions={monthlySectorOptions}
        coverageNote={monthlyCoverageNote}
        slug="starters-stoppers"
        sectionId="starters"
      />

      <MonthlyMetricSection
        title="Aantal stoppers"
        label="Aantal"
        data={stoppersSeries}
        timeRange={monthlyTimeRange}
        onTimeRangeChange={setMonthlyTimeRange}
        selectedRegion={monthlyRegion}
        onSelectRegion={setMonthlyRegion}
        selectedSector={monthlySector}
        onSelectSector={setMonthlySector}
        sectorOptions={monthlySectorOptions}
        coverageNote={monthlyCoverageNote}
        slug="starters-stoppers"
        sectionId="stoppers"
      />

      <SurvivalSection
        data={survivalSeries}
        selectedRegion={selectedRegion}
        selectedProvince={selectedProvince}
        onSelectRegion={selectRegion}
        onSelectProvince={selectProvince}
        selectedSector={survivalSector}
        onSelectSector={setSurvivalSector}
        sectorOptions={survivalSectorOptions}
        stopHorizon={stopHorizon}
        onStopHorizonChange={setStopHorizon}
      />
    </div>
  )
}

export function StartersStoppersDashboard() {
  return (
    <GeoProvider>
      <InnerDashboard />
    </GeoProvider>
  )
}
