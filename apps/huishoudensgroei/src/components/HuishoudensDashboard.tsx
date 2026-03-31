"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Button } from "@embuild/shared/components/ui/button"
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
import { cn } from "@embuild/shared/lib/utils"
import { GeoProvider } from "@embuild/shared/components/shared/GeoContext"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { MapSection } from "@embuild/shared/components/shared/MapSection"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type MunicipalityRow = {
  y: number
  nis: string
  n: number
  name: string | null
  p: string | null
  gr: number | null
}

type ProvinceRow = {
  y: number
  p: string
  n: number
  gr: number | null
}

type RegionRow = {
  y: number
  r: string
  n: number
  gr: number | null
}

type SizeRow = {
  y: number
  hh: string
  n: number
  r?: string
  p?: string
}

type Province = {
  code: string
  name: string
}

type Municipality = {
  code: string
  name: string
}

type HouseholdSize = {
  code: string
  nl: string
}

type YearPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

let municipalitiesRaw: MunicipalityRow[] = []
let provincesRaw: ProvinceRow[] = []
let regionRaw: RegionRow[] = []
let regionBySizeRaw: SizeRow[] = []
let provincesBySizeRaw: SizeRow[] = []
let lookups: {
  provinces?: Province[]
  municipalities?: Municipality[]
  household_sizes?: HouseholdSize[]
} | null = null

const BASE_YEAR = 2023
const CURRENT_YEAR = 2023 // Latest actual data
const PROJECTION_START = 2024

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function useProvinceOptions(): Province[] {
  return (lookups as { provinces: Province[] }).provinces ?? []
}

function useMunicipalityOptions(): Municipality[] {
  return (lookups as { municipalities: Municipality[] }).municipalities ?? []
}

function useHouseholdSizeOptions(): HouseholdSize[] {
  return (lookups as { household_sizes: HouseholdSize[] }).household_sizes ?? []
}

// Geo filter inline component
function GeoFilterInline({
  selectedLevel,
  selectedCode,
  onSelect,
}: {
  selectedLevel: "vlaanderen" | "province" | "municipality"
  selectedCode: string | null
  onSelect: (level: "vlaanderen" | "province" | "municipality", code: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const provinces = useProvinceOptions()
  const municipalities = useMunicipalityOptions()

  const currentLabel = React.useMemo(() => {
    if (selectedLevel === "vlaanderen" || !selectedCode) return "Vlaanderen"
    if (selectedLevel === "province") {
      return provinces.find((p) => p.code === selectedCode)?.name ?? "Provincie"
    }
    if (selectedLevel === "municipality") {
      return municipalities.find((m) => m.code === selectedCode)?.name ?? "Gemeente"
    }
    return "Vlaanderen"
  }, [selectedLevel, selectedCode, provinces, municipalities])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[140px]">
          <span className="truncate max-w-[180px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek locatie..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Regio">
              <CommandItem
                value="Vlaanderen"
                onSelect={() => {
                  onSelect("vlaanderen", null)
                  setOpen(false)
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", selectedLevel === "vlaanderen" ? "opacity-100" : "opacity-0")} />
                Vlaanderen
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Provincie">
              {provinces.map((p) => (
                <CommandItem
                  key={p.code}
                  value={p.name}
                  onSelect={() => {
                    onSelect("province", p.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selectedLevel === "province" && selectedCode === p.code ? "opacity-100" : "opacity-0")} />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Gemeente">
              {municipalities.slice(0, 50).map((m) => (
                <CommandItem
                  key={m.code}
                  value={m.name}
                  onSelect={() => {
                    onSelect("municipality", m.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selectedLevel === "municipality" && selectedCode === m.code ? "opacity-100" : "opacity-0")} />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Horizon filter (year range)
function HorizonFilterInline({
  selected,
  onChange,
}: {
  selected: number
  onChange: (year: number) => void
}) {
  const [open, setOpen] = React.useState(false)
  const horizonYears = [2025, 2030, 2033, 2035, 2040]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[100px]">
          <span>Horizon {selected}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup heading="Projectiejaar">
              {horizonYears.map((year) => (
                <CommandItem
                  key={year}
                  value={String(year)}
                  onSelect={() => {
                    onChange(year)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === year ? "opacity-100" : "opacity-0")} />
                  {year}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Get series data for a given geographic selection
function getYearSeries(
  level: "vlaanderen" | "province" | "municipality",
  code: string | null,
  maxYear: number
): YearPoint[] {
  let data: Array<{ y: number; n: number }>

  if (level === "municipality" && code) {
    data = (municipalitiesRaw as MunicipalityRow[]).filter((r) => r.nis === code && r.y <= maxYear)
  } else if (level === "province" && code) {
    data = (provincesRaw as ProvinceRow[]).filter((r) => r.p === code && r.y <= maxYear)
  } else {
    data = (regionRaw as RegionRow[]).filter((r) => r.y <= maxYear)
  }

  return data
    .map((r) => ({
      sortValue: r.y,
      periodCells: [r.y],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

// Get size breakdown data
function getSizeBreakdown(
  level: "vlaanderen" | "province" | "municipality",
  code: string | null,
  year: number
): Array<{ hh: string; n: number; label: string }> {
  const householdSizes = useHouseholdSizeOptions()

  let data: SizeRow[]
  if (level === "province" && code) {
    data = (provincesBySizeRaw as SizeRow[]).filter((r) => r.p === code && r.y === year)
  } else {
    // For Vlaanderen or municipality, use region data (municipality breakdown not available by size)
    data = (regionBySizeRaw as SizeRow[]).filter((r) => r.y === year)
  }

  return data.map((r) => ({
    hh: r.hh,
    n: r.n,
    label: householdSizes.find((h) => h.code === r.hh)?.nl ?? r.hh,
  }))
}

// Get all province data for interactive map (all years)
function getAllProvinceMapData(): { p: string; gr: number; y: number }[] {
  return (provincesRaw as ProvinceRow[])
    .filter((r) => r.gr !== null)
    .map((r) => ({
      p: r.p,
      gr: r.gr ?? 0,
      y: r.y,
    }))
}

// Get growth ranking for municipalities
function getMunicipalityRanking(
  year: number,
  provinceCode: string | null,
  limit: number = 10,
  ascending: boolean = false
): Array<{ nis: string; name: string; gr: number; n: number }> {
  let data = (municipalitiesRaw as MunicipalityRow[]).filter(
    (r) => r.y === year && r.gr !== null && r.name !== null
  )

  if (provinceCode) {
    data = data.filter((r) => r.p === provinceCode)
  }

  return data
    .map((r) => ({
      nis: r.nis,
      name: r.name!,
      gr: r.gr!,
      n: r.n,
    }))
    .sort((a, b) => (ascending ? a.gr - b.gr : b.gr - a.gr))
    .slice(0, limit)
}

// Summary cards component
function SummaryCards({
  level,
  code,
  horizonYear,
}: {
  level: "vlaanderen" | "province" | "municipality"
  code: string | null
  horizonYear: number
}) {
  const baseData = React.useMemo(() => {
    if (level === "municipality" && code) {
      return (municipalitiesRaw as MunicipalityRow[]).find((r) => r.nis === code && r.y === BASE_YEAR)
    } else if (level === "province" && code) {
      return (provincesRaw as ProvinceRow[]).find((r) => r.p === code && r.y === BASE_YEAR)
    } else {
      return (regionRaw as RegionRow[]).find((r) => r.y === BASE_YEAR)
    }
  }, [level, code])

  const horizonData = React.useMemo(() => {
    if (level === "municipality" && code) {
      return (municipalitiesRaw as MunicipalityRow[]).find((r) => r.nis === code && r.y === horizonYear)
    } else if (level === "province" && code) {
      return (provincesRaw as ProvinceRow[]).find((r) => r.p === code && r.y === horizonYear)
    } else {
      return (regionRaw as RegionRow[]).find((r) => r.y === horizonYear)
    }
  }, [level, code, horizonYear])

  if (!baseData || !horizonData) return null

  const growth = horizonData.gr ?? 0
  const absoluteGrowth = horizonData.n - baseData.n

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Huishoudens {BASE_YEAR}</div>
          <div className="text-2xl font-bold">{formatInt(baseData.n)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Prognose {horizonYear}</div>
          <div className="text-2xl font-bold">{formatInt(horizonData.n)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Groei</div>
          <div className={cn("text-2xl font-bold", growth >= 0 ? "text-green-600" : "text-red-600")}>
            {formatPct(growth)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Absolute groei</div>
          <div className={cn("text-2xl font-bold", absoluteGrowth >= 0 ? "text-green-600" : "text-red-600")}>
            {absoluteGrowth >= 0 ? "+" : ""}
            {formatInt(absoluteGrowth)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main section with chart/table/map
function MainSection({
  level,
  code,
  horizonYear,
  onSelectGeo,
  onHorizonChange,
}: {
  level: "vlaanderen" | "province" | "municipality"
  code: string | null
  horizonYear: number
  onSelectGeo: (level: "vlaanderen" | "province" | "municipality", code: string | null) => void
  onHorizonChange: (year: number) => void
}) {
  const [currentView, setCurrentView] = React.useState<"chart" | "table" | "map">("chart")
  const horizonYears = [2025, 2030, 2033, 2035, 2040]

  const yearSeries = React.useMemo(() => getYearSeries(level, code, horizonYear), [level, code, horizonYear])

  // Map data - gebruik echte gemeentedata
  const municipalityMapData = React.useMemo(() => {
    return municipalitiesRaw.map((m: any) => ({
      nis: m.nis,
      y: m.y,
      gr: m.gr,
    }))
  }, [])

  const exportData = React.useMemo(
    () =>
      yearSeries.map((d) => ({
        label: String(d.periodCells[0]),
        value: d.value,
        periodCells: d.periodCells,
      })),
    [yearSeries]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Evolutie aantal huishoudens</h2>
        <ExportButtons
          data={exportData}
          title="Evolutie aantal huishoudens"
          slug="huishoudensgroei"
          sectionId="evolutie"
          viewType={currentView}
          periodHeaders={["Jaar"]}
          valueLabel="Huishoudens"
          dataSource="Statistiek Vlaanderen - Huishoudensvooruitzichten"
          dataSourceUrl="https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei"
        />
      </div>

      <Tabs defaultValue="chart" onValueChange={(v) => setCurrentView(v as "chart" | "table" | "map")}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
            <TabsTrigger value="map">Kaart</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <GeoFilterInline selectedLevel={level} selectedCode={code} onSelect={onSelectGeo} />
            <HorizonFilterInline selected={horizonYear} onChange={onHorizonChange} />
          </div>
        </div>
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Aantal huishoudens per jaar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-sm text-muted-foreground">
                Historische data tot {CURRENT_YEAR}, projecties vanaf {PROJECTION_START}
              </div>
              <FilterableChart
                data={yearSeries}
                getLabel={(d) => String((d as YearPoint).periodCells[0])}
                getValue={(d) => (d as YearPoint).value}
                getSortValue={(d) => (d as YearPoint).sortValue}
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
              <FilterableTable data={yearSeries} label="Huishoudens" periodHeaders={["Jaar"]} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle>Groei per gemeente ({BASE_YEAR} - horizon)</CardTitle>
            </CardHeader>
            <CardContent>
              <MapSection
                data={municipalityMapData}
                getGeoCode={(d: any) => d.nis}
                getValue={(d: any) => d.gr}
                getPeriod={(d: any) => d.y}
                periods={horizonYears}
                showTimeSlider={true}
                formatValue={formatPct}
                tooltipLabel="Groei (%)"
                showProvinceBoundaries={true}
                colorScheme="green"
                height={500}
              />
              <div className="mt-3 text-xs text-muted-foreground">
                Gebruik de tijdsslider om verschillende horizon-jaren te vergelijken. Zoek een gemeente om in te zoomen.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Ranking section
function RankingSection({
  horizonYear,
  provinceCode,
  geoLevel,
  selectedCode,
  onSelectGeo,
  onHorizonChange,
}: {
  horizonYear: number
  provinceCode: string | null
  geoLevel: "vlaanderen" | "province" | "municipality"
  selectedCode: string | null
  onSelectGeo: (level: "vlaanderen" | "province" | "municipality", code: string | null) => void
  onHorizonChange: (year: number) => void
}) {
  const [showDecline, setShowDecline] = React.useState(false)
  const currentView = "table" as const

  const ranking = React.useMemo(
    () => getMunicipalityRanking(horizonYear, provinceCode, 10, showDecline),
    [horizonYear, provinceCode, showDecline]
  )

  const provinces = useProvinceOptions()
  const provinceName = provinceCode ? provinces.find((p) => p.code === provinceCode)?.name : null

  const exportData = React.useMemo(
    () =>
      ranking.map((r) => ({
        label: r.name,
        value: r.gr,
        periodCells: [r.name, formatInt(r.n), formatPct(r.gr)],
      })),
    [ranking]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {showDecline ? "Gemeenten met sterkste afname" : "Snelst groeiende gemeenten"}
          {provinceName && ` in ${provinceName}`}
        </h2>
        <ExportButtons
          data={exportData}
          title={`${showDecline ? "Gemeenten met sterkste afname" : "Snelst groeiende gemeenten"}${provinceName ? ` in ${provinceName}` : ""}`}
          slug="huishoudensgroei"
          sectionId="ranking"
          viewType={currentView}
          periodHeaders={["Gemeente", "Huishoudens", "Groei (%)"]}
          valueLabel="Groei (%)"
          dataSource="Statistiek Vlaanderen - Huishoudensvooruitzichten"
          dataSourceUrl="https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <GeoFilterInline selectedLevel={geoLevel} selectedCode={selectedCode} onSelect={onSelectGeo} />
        <HorizonFilterInline selected={horizonYear} onChange={onHorizonChange} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDecline(!showDecline)}
        >
          {showDecline ? "Toon groei" : "Toon afname"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 gemeenten ({BASE_YEAR} - {horizonYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.nis} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium">{r.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{formatInt(r.n)} huishoudens</span>
                  <span className={cn("font-bold min-w-[60px] text-right", r.gr >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatPct(r.gr)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Household size breakdown section
function SizeBreakdownSection({
  level,
  code,
  horizonYear,
  onSelectGeo,
  onHorizonChange,
}: {
  level: "vlaanderen" | "province" | "municipality"
  code: string | null
  horizonYear: number
  onSelectGeo: (level: "vlaanderen" | "province" | "municipality", code: string | null) => void
  onHorizonChange: (year: number) => void
}) {
  const currentView = "table" as const
  const baseData = getSizeBreakdown(level, code, BASE_YEAR)
  const horizonData = getSizeBreakdown(level, code, horizonYear)

  const combined = React.useMemo(() => {
    return baseData.map((base) => {
      const horizon = horizonData.find((h) => h.hh === base.hh)
      const growth = horizon ? ((horizon.n - base.n) / base.n) * 100 : 0
      return {
        label: base.label,
        base: base.n,
        horizon: horizon?.n ?? 0,
        growth,
      }
    })
  }, [baseData, horizonData])

  const exportData = React.useMemo(
    () =>
      combined.map((item) => ({
        label: item.label,
        value: item.growth,
        periodCells: [item.label, formatInt(item.base), formatInt(item.horizon), formatPct(item.growth)],
      })),
    [combined]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Samenstelling huishoudens</h2>
        <ExportButtons
          data={exportData}
          title="Samenstelling huishoudens"
          slug="huishoudensgroei"
          sectionId="size-breakdown"
          viewType={currentView}
          periodHeaders={["Huishoudgrootte", `${BASE_YEAR}`, `${horizonYear}`, "Groei (%)"]}
          valueLabel="Groei (%)"
          dataSource="Statistiek Vlaanderen - Huishoudensvooruitzichten"
          dataSourceUrl="https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei"
        />
      </div>
      <div className="flex items-center gap-2">
        <GeoFilterInline selectedLevel={level} selectedCode={code} onSelect={onSelectGeo} />
        <HorizonFilterInline selected={horizonYear} onChange={onHorizonChange} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verdeling naar huishoudgrootte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {combined.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.label}</span>
                  <span className={cn("font-bold", item.growth >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatPct(item.growth)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{BASE_YEAR}: {formatInt(item.base)}</span>
                  <span>{horizonYear}: {formatInt(item.horizon)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(item.horizon / Math.max(...combined.map((c) => c.horizon))) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main Dashboard Component
function InnerDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    municipalities: MunicipalityRow[]
    provinces: ProvinceRow[]
    region: RegionRow[]
    regionBySize: SizeRow[]
    provincesBySize: SizeRow[]
    lookups: {
      provinces?: Province[]
      municipalities?: Municipality[]
      household_sizes?: HouseholdSize[]
    }
  }>({
    municipalities: "/data/municipalities.json",
    provinces: "/data/provinces.json",
    region: "/data/region.json",
    regionBySize: "/data/region_by_size.json",
    provincesBySize: "/data/provinces_by_size.json",
    lookups: "/data/lookups.json",
  })

  const [geoLevel, setGeoLevel] = React.useState<"vlaanderen" | "province" | "municipality">("vlaanderen")
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null)
  const [horizonYear, setHorizonYear] = React.useState<number>(2033)

  if (bundle) {
    municipalitiesRaw = bundle.municipalities
    provincesRaw = bundle.provinces
    regionRaw = bundle.region
    regionBySizeRaw = bundle.regionBySize
    provincesBySizeRaw = bundle.provincesBySize
    lookups = bundle.lookups
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

  function handleSelectGeo(level: "vlaanderen" | "province" | "municipality", code: string | null) {
    setGeoLevel(level)
    setSelectedCode(code)
  }

  return (
    <div className="space-y-10">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Deze analyse toont de huishoudensvooruitzichten voor Vlaanderen. De data bevat historische cijfers
          (2010-2023) en projecties tot 2040. Selecteer een provincie of gemeente en een horizon-jaar om de
          verwachte evolutie te bekijken.
        </p>
      </div>

      <SummaryCards level={geoLevel} code={selectedCode} horizonYear={horizonYear} />

      <MainSection
        level={geoLevel}
        code={selectedCode}
        horizonYear={horizonYear}
        onSelectGeo={handleSelectGeo}
        onHorizonChange={setHorizonYear}
      />

      <SizeBreakdownSection
        level={geoLevel}
        code={selectedCode}
        horizonYear={horizonYear}
        onSelectGeo={handleSelectGeo}
        onHorizonChange={setHorizonYear}
      />

      <RankingSection
        horizonYear={horizonYear}
        provinceCode={geoLevel === "province" ? selectedCode : null}
        geoLevel={geoLevel}
        selectedCode={selectedCode}
        onSelectGeo={handleSelectGeo}
        onHorizonChange={setHorizonYear}
      />
    </div>
  )
}

export function HuishoudensDashboard() {
  return (
    <GeoProvider>
      <InnerDashboard />
    </GeoProvider>
  )
}
