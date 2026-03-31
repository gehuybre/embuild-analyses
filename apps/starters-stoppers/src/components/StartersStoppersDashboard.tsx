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
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "@embuild/shared/lib/geo-utils"
import { GeoProvider, useGeo } from "@embuild/shared/components/shared/GeoContext"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

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

type YearPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

type RegionPoint = {
  r: RegionCode
  y: number
  value: number
}

type ProvincePoint = {
  p: ProvinceCode
  y: number
  value: number
}

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(n) + "%"
}

function getNaceMainOptions(lookupsData: any | null) {
  const items: Array<{ code: string; label: string }> =
    lookupsData?.nace_lvl1?.map((d: any) => ({
      code: String(d.code),
      label: `${String(d.code)} — ${d.nl ?? d.en ?? ""}`.trim(),
    })) ?? []
  items.sort((a, b) => a.label.localeCompare(b.label, "nl"))
  return items
}

// Compact inline geo filter for section-level use
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

  const sortedProvinces = React.useMemo(() => {
    return [...PROVINCES].sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const currentLabel = React.useMemo(() => {
    if (selectedProvince) {
      return PROVINCES.find((p) => String(p.code) === String(selectedProvince))?.name ?? "Provincie"
    }
    if (selectedRegion !== "1000") {
      return REGIONS.find((r) => r.code === selectedRegion)?.name ?? "Regio"
    }
    return "België"
  }, [selectedRegion, selectedProvince])

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
    const prov = PROVINCES.find((p) => String(p.code) === String(code))
    if (prov) onSelectRegion(prov.regionCode)
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
              {REGIONS.filter((r) => r.code !== "1000").map((r) => (
                <CommandItem key={r.code} value={r.name} onSelect={() => selectRegion(r.code)}>
                  <Check className={cn("mr-2 h-4 w-4", !selectedProvince && selectedRegion === r.code ? "opacity-100" : "opacity-0")} />
                  {r.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Provincie">
              {sortedProvinces.map((p) => (
                <CommandItem key={p.code} value={p.name} onSelect={() => selectProvince(p.code)}>
                  <Check className={cn("mr-2 h-4 w-4", String(selectedProvince) === String(p.code) ? "opacity-100" : "opacity-0")} />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Compact inline sector filter for section-level use
function SectorFilterInline({
  selected,
  onChange,
  options,
}: {
  selected: string | null
  onChange: (code: string | null) => void
  options: Array<{ code: string; label: string }>
}) {
  const [open, setOpen] = React.useState(false)

  const selectedLabel = React.useMemo(() => {
    if (!selected) return "Alle sectoren"
    const opt = options.find((o) => o.code === selected)
    return opt ? `${opt.code}` : selected
  }, [selected, options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{selectedLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
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
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === o.code ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function filterRowsByGeo(rows: VatSurvivalRow[], level: string, selectedRegion: RegionCode, selectedProvince: ProvinceCode | null) {
  if (level === "province" && selectedProvince) {
    return rows.filter((r) => r.p && String(r.p) === String(selectedProvince))
  }
  if (level === "region" && selectedRegion !== "1000") {
    return rows.filter((r) => r.r && String(r.r) === String(selectedRegion))
  }
  return rows
}

function filterRowsBySector(rows: VatSurvivalRow[], nace1: string | null) {
  if (!nace1) return rows
  return rows.filter((r) => r.n1 === nace1)
}

function aggregateStartersByYear(rows: VatSurvivalRow[]): YearPoint[] {
  const agg = new Map<number, number>()
  for (const r of rows) {
    if (typeof r.y !== "number" || typeof r.fr !== "number") continue
    agg.set(r.y, (agg.get(r.y) ?? 0) + r.fr)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({ sortValue: y, periodCells: [y], value: v }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

type StopHorizon = 1 | 2 | 3 | 4 | 5
type SurvivalKey = "s1" | "s2" | "s3" | "s4" | "s5"

function survivalKeyForHorizon(h: StopHorizon): SurvivalKey {
  return `s${h}` as SurvivalKey
}

function aggregateStoppersByYear(rows: VatSurvivalRow[], horizon: StopHorizon): YearPoint[] {
  const key = survivalKeyForHorizon(horizon)
  const agg = new Map<number, { fr: number; surv: number }>()
  for (const r of rows) {
    const surv = (r as any)[key]
    if (typeof r.y !== "number" || typeof r.fr !== "number" || typeof surv !== "number") continue
    const prev = agg.get(r.y) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(r.y, prev)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({ sortValue: y, periodCells: [y], value: Math.max(0, v.fr - v.surv) }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateSurvivalRateByYear(rows: VatSurvivalRow[], yearKey: "s1" | "s2" | "s3" | "s4" | "s5"): YearPoint[] {
  const agg = new Map<number, { fr: number; surv: number }>()
  for (const r of rows) {
    const surv = (r as any)[yearKey]
    if (typeof r.y !== "number" || typeof r.fr !== "number" || typeof surv !== "number") continue
    const prev = agg.get(r.y) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(r.y, prev)
  }
  return Array.from(agg.entries())
    .map(([y, v]) => ({
      sortValue: y,
      periodCells: [y],
      value: v.fr > 0 ? Math.round(((v.surv / v.fr) * 100) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function aggregateByRegionAllYears(rows: VatSurvivalRow[], valueFn: (r: VatSurvivalRow) => number | null): RegionPoint[] {
  const agg = new Map<string, number>() // key: "year-region"
  for (const r of rows) {
    if (typeof r.y !== "number" || !r.r) continue
    const code = String(r.r) as RegionCode
    const key = `${r.y}-${code}`
    const v = valueFn(r)
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    agg.set(key, (agg.get(key) ?? 0) + v)
  }
  return Array.from(agg.entries())
    .map(([key, value]) => {
      const [y, r] = key.split("-")
      return { r: r as RegionCode, y: Number(y), value }
    })
    .sort((a, b) => a.y - b.y || a.r.localeCompare(b.r))
}

function aggregateByProvinceAllYears(
  rows: VatSurvivalRow[],
  valueFn: (r: VatSurvivalRow) => number | null
): ProvincePoint[] {
  const agg = new Map<string, number>() // key: "year-province"
  for (const r of rows) {
    if (typeof r.y !== "number" || !r.p) continue
    const code = String(r.p)
    const key = `${r.y}-${code}`
    const v = valueFn(r)
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    agg.set(key, (agg.get(key) ?? 0) + v)
  }
  return Array.from(agg.entries())
    .map(([key, value]) => {
      const [y, p] = key.split("-")
      return { p, y: Number(y), value }
    })
    .sort((a, b) => a.y - b.y || a.p.localeCompare(b.p))
}

function survivalRateByRegionAllYears(rows: VatSurvivalRow[], key: SurvivalKey): RegionPoint[] {
  const agg = new Map<string, { fr: number; surv: number }>() // key: "year-region"
  for (const r of rows) {
    if (typeof r.y !== "number" || !r.r) continue
    const surv = (r as any)[key]
    if (typeof r.fr !== "number" || typeof surv !== "number") continue
    const code = String(r.r) as RegionCode
    const mapKey = `${r.y}-${code}`
    const prev = agg.get(mapKey) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(mapKey, prev)
  }
  return Array.from(agg.entries()).map(([mapKey, v]) => {
    const [y, r] = mapKey.split("-")
    return {
      r: r as RegionCode,
      y: Number(y),
      value: v.fr > 0 ? Math.round(((v.surv / v.fr) * 100) * 10) / 10 : 0,
    }
  })
}

function survivalRateByProvinceAllYears(rows: VatSurvivalRow[], key: SurvivalKey): ProvincePoint[] {
  const agg = new Map<string, { fr: number; surv: number }>() // key: "year-province"
  for (const r of rows) {
    if (typeof r.y !== "number" || !r.p) continue
    const surv = (r as any)[key]
    if (typeof r.fr !== "number" || typeof surv !== "number") continue
    const code = String(r.p)
    const mapKey = `${r.y}-${code}`
    const prev = agg.get(mapKey) ?? { fr: 0, surv: 0 }
    prev.fr += r.fr
    prev.surv += surv
    agg.set(mapKey, prev)
  }
  return Array.from(agg.entries()).map(([mapKey, v]) => {
    const [y, p] = mapKey.split("-")
    return {
      p,
      y: Number(y),
      value: v.fr > 0 ? Math.round(((v.surv / v.fr) * 100) * 10) / 10 : 0,
    }
  })
}

function MetricSection({
  title,
  label,
  yearSeries,
  mapData,
  years,
  mapLevel,
  formatValue,
  selectedRegion,
  selectedProvince,
  selectedSector,
  sectorOptions,
  onSelectRegion,
  onSelectProvince,
  onSelectSector,
  stopHorizon,
  onStopHorizonChange,
  slug,
  sectionId,
  dataSource,
  dataSourceUrl,
  embedParams,
}: {
  title: string
  label: string
  yearSeries: YearPoint[]
  mapData: RegionPoint[] | ProvincePoint[]
  years: number[]
  mapLevel: "region" | "province"
  formatValue: (v: number) => string
  selectedRegion: RegionCode
  selectedProvince: ProvinceCode | null
  selectedSector: string | null
  sectorOptions: Array<{ code: string; label: string }>
  onSelectRegion: (code: RegionCode) => void
  onSelectProvince: (code: ProvinceCode | null) => void
  onSelectSector: (code: string | null) => void
  stopHorizon?: StopHorizon
  onStopHorizonChange?: (h: StopHorizon) => void
  slug?: string
  sectionId?: string
  dataSource?: string
  dataSourceUrl?: string
  embedParams?: Record<string, string | number | null | undefined>
}) {
  const [currentView, setCurrentView] = React.useState<"chart" | "table" | "map">("chart")

  // Transform yearSeries to the format ExportButtons expects
  const exportData = React.useMemo(() =>
    yearSeries.map(d => ({
      label: String(d.sortValue),
      value: d.value,
      periodCells: d.periodCells,
    })),
    [yearSeries]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {slug && sectionId && (
          <ExportButtons
            data={exportData}
            title={title}
            slug={slug}
            sectionId={sectionId}
            viewType={currentView}
            periodHeaders={["Jaar"]}
            valueLabel={label}
            dataSource={dataSource}
            dataSourceUrl={dataSourceUrl}
            embedParams={embedParams}
          />
        )}
      </div>
      <Tabs defaultValue="chart" onValueChange={(v) => setCurrentView(v as "chart" | "table")}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <GeoFilterInline
              selectedRegion={selectedRegion}
              selectedProvince={selectedProvince}
              onSelectRegion={onSelectRegion}
              onSelectProvince={onSelectProvince}
            />
            <SectorFilterInline
              selected={selectedSector}
              onChange={onSelectSector}
              options={sectorOptions}
            />
            {stopHorizon !== undefined && onStopHorizonChange && (
              <Tabs
                value={String(stopHorizon)}
                onValueChange={(v) => onStopHorizonChange(Number(v) as StopHorizon)}
              >
                <TabsList className="h-9">
                  <TabsTrigger value="1" className="text-xs px-2">1j</TabsTrigger>
                  <TabsTrigger value="2" className="text-xs px-2">2j</TabsTrigger>
                  <TabsTrigger value="3" className="text-xs px-2">3j</TabsTrigger>
                  <TabsTrigger value="4" className="text-xs px-2">4j</TabsTrigger>
                  <TabsTrigger value="5" className="text-xs px-2">5j</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Evolutie</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableChart
                data={yearSeries}
                getLabel={(d) => String((d as any).sortValue)}
                getValue={(d) => (d as any).value}
                getSortValue={(d) => (d as any).sortValue}
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
              <FilterableTable data={yearSeries} label={label} periodHeaders={["Jaar"]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InnerDashboard() {
  const { level, selectedRegion, setSelectedRegion, selectedProvince, setSelectedProvince, setSelectedMunicipality, setLevel } = useGeo()

  const [selectedNace1, setSelectedNace1] = React.useState<string | null>(null)
  const [stopHorizon, setStopHorizon] = React.useState<StopHorizon>(1)

  const { data: bundle, loading, error } = useJsonBundle<{
    raw: VatSurvivalRow[]
    lookups: any
  }>({
    raw: "/data/vat_survivals.json",
    lookups: "/data/lookups.json",
  })

  const naceMainOptions = React.useMemo(
    () => getNaceMainOptions(bundle?.lookups ?? null),
    [bundle]
  )

  const allRows = (bundle?.raw ?? []) as VatSurvivalRow[]

  const filteredRows = React.useMemo(() => {
    const bySector = filterRowsBySector(allRows, selectedNace1)
    return filterRowsByGeo(bySector, level, selectedRegion, selectedProvince)
  }, [allRows, selectedNace1, level, selectedRegion, selectedProvince])

  const startersSeries = React.useMemo(() => aggregateStartersByYear(filteredRows), [filteredRows])
  const stoppersSeries = React.useMemo(() => aggregateStoppersByYear(filteredRows, stopHorizon), [filteredRows, stopHorizon])
  const survivalSeries = React.useMemo(
    () => aggregateSurvivalRateByYear(filteredRows, survivalKeyForHorizon(stopHorizon)),
    [filteredRows, stopHorizon]
  )

  const mapRows = React.useMemo(() => filterRowsBySector(allRows, selectedNace1), [allRows, selectedNace1])

  // Extract all years from the data
  const years = React.useMemo(() => {
    const yearSet = new Set<number>()
    for (const r of allRows) {
      if (typeof r.y === "number") yearSet.add(r.y)
    }
    return Array.from(yearSet).sort((a, b) => a - b)
  }, [allRows])

  // Map level logic: At Belgium level, show regions. At region level, show provinces.
  // Province level doesn't need a map (already drilled down to single province).
  const mapLevel = level === "region" && selectedRegion !== "1000" ? "province" : "region"

  const startersMap = React.useMemo(() => {
    const val = (r: VatSurvivalRow) => (typeof r.fr === "number" ? r.fr : null)
    return mapLevel === "province"
      ? aggregateByProvinceAllYears(mapRows, val)
      : aggregateByRegionAllYears(mapRows, val)
  }, [mapRows, mapLevel])

  const stoppersMap = React.useMemo(() => {
    const key = survivalKeyForHorizon(stopHorizon)
    const val = (r: VatSurvivalRow) => {
      const surv = (r as any)[key]
      return typeof r.fr === "number" && typeof surv === "number" ? Math.max(0, r.fr - surv) : null
    }
    return mapLevel === "province"
      ? aggregateByProvinceAllYears(mapRows, val)
      : aggregateByRegionAllYears(mapRows, val)
  }, [mapRows, stopHorizon, mapLevel])

  const survivalMap: RegionPoint[] | ProvincePoint[] = React.useMemo(() => {
    const key = survivalKeyForHorizon(stopHorizon)
    return mapLevel === "province"
      ? survivalRateByProvinceAllYears(mapRows, key)
      : survivalRateByRegionAllYears(mapRows, key)
  }, [mapRows, stopHorizon, mapLevel])

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
      return
    }
    setSelectedProvince(code)
    setSelectedMunicipality(null)
    const prov = PROVINCES.find((p) => String(p.code) === String(code))
    if (prov) setSelectedRegion(prov.regionCode)
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
          We tonen hier het aantal starters (eerste inschrijvingen), het aantal stoppers (starters die na N jaar niet meer actief zijn),
          en de overlevingskans na N jaar. Gebruik de toggle om N (1–5 jaar) te kiezen. Gebruik de filters per sectie om de data te filteren.
        </p>
      </div>

      <MetricSection
        title="Aantal starters"
        label="Aantal"
        yearSeries={startersSeries}
        mapData={startersMap}
        years={years}
        mapLevel={mapLevel}
        formatValue={formatInt}
        selectedRegion={selectedRegion}
        selectedProvince={selectedProvince}
        selectedSector={selectedNace1}
        sectorOptions={naceMainOptions}
        onSelectRegion={selectRegion}
        onSelectProvince={selectProvince}
        onSelectSector={setSelectedNace1}
        slug="starters-stoppers"
        sectionId="starters"
        dataSource="Statbel - Overlevingsgraad van btw-plichtigen"
        dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/overlevingsgraad-van-btw-plichtigen"
        embedParams={{
          region: selectedRegion !== "1000" ? selectedRegion : null,
          province: selectedProvince,
          sector: selectedNace1,
        }}
      />

      <MetricSection
        title={`Aantal stoppers (na ${stopHorizon} jaar)`}
        label="Aantal"
        yearSeries={stoppersSeries}
        mapData={stoppersMap}
        years={years}
        mapLevel={mapLevel}
        formatValue={formatInt}
        selectedRegion={selectedRegion}
        selectedProvince={selectedProvince}
        selectedSector={selectedNace1}
        sectorOptions={naceMainOptions}
        onSelectRegion={selectRegion}
        onSelectProvince={selectProvince}
        onSelectSector={setSelectedNace1}
        stopHorizon={stopHorizon}
        onStopHorizonChange={setStopHorizon}
        slug="starters-stoppers"
        sectionId="stoppers"
        dataSource="Statbel - Overlevingsgraad van btw-plichtigen"
        dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/overlevingsgraad-van-btw-plichtigen"
        embedParams={{
          horizon: stopHorizon,
          region: selectedRegion !== "1000" ? selectedRegion : null,
          province: selectedProvince,
          sector: selectedNace1,
        }}
      />

      <MetricSection
        title={`Overlevingskans na ${stopHorizon} jaar`}
        label="Overlevingskans"
        yearSeries={survivalSeries}
        mapData={survivalMap}
        years={years}
        mapLevel={mapLevel}
        formatValue={formatPct}
        selectedRegion={selectedRegion}
        selectedProvince={selectedProvince}
        selectedSector={selectedNace1}
        sectorOptions={naceMainOptions}
        onSelectRegion={selectRegion}
        onSelectProvince={selectProvince}
        onSelectSector={setSelectedNace1}
        stopHorizon={stopHorizon}
        onStopHorizonChange={setStopHorizon}
        slug="starters-stoppers"
        sectionId="survival"
        dataSource="Statbel - Overlevingsgraad van btw-plichtigen"
        dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/overlevingsgraad-van-btw-plichtigen"
        embedParams={{
          horizon: stopHorizon,
          region: selectedRegion !== "1000" ? selectedRegion : null,
          province: selectedProvince,
          sector: selectedNace1,
        }}
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
